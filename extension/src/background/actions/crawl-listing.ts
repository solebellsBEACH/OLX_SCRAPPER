import { categorizeInChunks } from "../ai-categorize";
import { CRAWL_MAX_PAGES } from "../constants";
import { dbAll, dbUpsertMany } from "../db";
import { itemToRecord, mergeItems } from "../items";
import { clearPageLoading, setPageLoading } from "../loading";
import { progress } from "../progress";
import { delay, getActiveOlxTab, injectContent, navigate, pageOf, sameListing, withPage } from "../tabs";
import type { Card, CrawlOptions, CrawlResult, DbRecord } from "../types";
import { isCarro } from "../vehicle-filter";

export async function crawlListing({
  maxPages,
  scrollEach,
  skipKnown,
  saveToDb,
}: CrawlOptions): Promise<CrawlResult> {
  const tab = await getActiveOlxTab();
  const tabId = tab.id;
  const baseUrl = tab.url ?? "";
  if (!baseUrl) throw new Error("Aba do OLX sem URL. Abra uma página de listagem e tente de novo.");

  const startPage = pageOf(baseUrl);
  const originalUrl = baseUrl;

  // Quantas páginas a paginação do OLX realmente oferece? Limita a varredura a
  // esse total (a partir da página atual) e nunca passa de CRAWL_MAX_PAGES (10).
  let lastPage: number | null = null;
  try {
    await injectContent(tabId);
    const pg = (await chrome.tabs.sendMessage(tabId, { action: "extractPagination" })) as
      | { ok: boolean; lastPage: number | null }
      | undefined;
    lastPage = pg?.lastPage ?? null;
  } catch {
    /* sem paginação legível — segue só com o pedido do usuário */
  }

  const requested = Math.max(1, Math.min(maxPages || 1, 50));
  const available = lastPage && lastPage >= startPage ? lastPage - startPage + 1 : requested;
  const pages = Math.min(requested, available, CRAWL_MAX_PAGES);
  progress(
    `Paginação: ${lastPage ?? "?"} página(s) no total — varrendo ${pages} ` +
      `(a partir da ${startPage}).`,
    { state: "running" },
  );

  // db.json lido UMA vez: serve pra pular os que já foram analisados.
  const db = await dbAll();

  const allCards: Card[] = []; // novos (não repetidos e, se skipKnown, fora do DB)
  const seen = new Set<string>(); // ids já vistos NESTA varredura
  let skipped = 0; // já estavam no db.json
  let duplicates = 0; // apareceram em mais de uma página
  const perPage: CrawlResult["perPage"] = [];

  try {
    for (let p = startPage; p < startPage + pages; p += 1) {
      const pageUrl = withPage(baseUrl, p);
      const done = p - startPage;

      progress(`Página ${p} (${done + 1}/${pages}): abrindo...`, { state: "running" });

      const cur = await chrome.tabs.get(tabId).catch(() => null);
      const alreadyThere = cur?.url && sameListing(cur.url, pageUrl) && pageOf(cur.url) === p;
      if (!alreadyThere) {
        await navigate(tabId, pageUrl, 25000);
      }
      await delay(1200); // deixa o React montar os cards

      await injectContent(tabId);
      await setPageLoading(tabId, `Varrendo página ${p} (${done + 1}/${pages})...`);
      if (scrollEach) {
        progress(`Página ${p} (${done + 1}/${pages}): rolando...`, { state: "running" });
        await chrome.tabs.sendMessage(tabId, { action: "autoScroll", duration: 1400 }).catch(() => {});
        await delay(400);
      }

      const extracted = (await chrome.tabs.sendMessage(tabId, { action: "extractSections" })) as
        | { ok: boolean; count: number; cards: Card[] }
        | undefined;
      const cards = extracted?.cards ?? [];

      if (cards.length === 0) {
        progress(`Página ${p}: sem anúncios — fim da paginação.`);
        break;
      }

      // 1) tira os que já apareceram nesta varredura (paginação do OLX repete cards)
      const withId = cards.filter((c) => typeof c.id === "string") as Array<Card & { id: string }>;
      const dupOnPage = withId.filter((c) => seen.has(c.id));
      const notSeen = withId.filter((c) => !seen.has(c.id));
      duplicates += dupOnPage.length;

      if (notSeen.length === 0) {
        progress(`Página ${p}: só anúncios repetidos — fim da paginação.`);
        break;
      }
      for (const c of notSeen) seen.add(c.id);

      // 2) tira os que já estão no db.json (já foram analisados antes)
      const known = skipKnown ? notSeen.filter((c) => c.id in db) : [];
      const novos = skipKnown ? notSeen.filter((c) => !(c.id in db)) : notSeen;
      skipped += known.length;

      allCards.push(...novos);
      perPage.push({
        page: p,
        novos: novos.length,
        noDb: known.length,
        repetidos: dupOnPage.length,
        total: allCards.length,
      });
      progress(
        `Página ${p}: +${novos.length} novo(s)` +
          (known.length ? ` · ${known.length} já no DB` : "") +
          (dupOnPage.length ? ` · ${dupOnPage.length} repetido(s)` : "") +
          ` · total ${allCards.length}`,
      );
    }
  } finally {
    await clearPageLoading(tabId);
  }

  // reindexa para alinhar com a categorização
  allCards.forEach((c, i) => {
    c.index = i;
  });

  // volta a aba para a página onde o usuário estava
  await chrome.tabs.update(tabId, { url: originalUrl }).catch(() => {});

  if (allCards.length === 0) {
    return {
      count: 0,
      items: [],
      categorias: null,
      raw: null,
      pages: perPage.length,
      newCount: 0,
      skipped,
      duplicates,
      savedToDb: 0,
      lastPage,
      perPage,
    };
  }

  progress(`Categorizando ${allCards.length} anúncio(s) novo(s) no DeepSeek...`, { state: "running" });
  await injectContent(tabId);
  await setPageLoading(tabId, `Categorizando ${allCards.length} anúncio(s)...`);
  const { categorias, error } = await categorizeInChunks(allCards).finally(() => clearPageLoading(tabId));
  const merged = mergeItems(allCards, categorias, db);
  // a extensão só trabalha com carros: descarta moto, caminhão, náutica, etc.
  const items = merged.filter((it) => isCarro(it.categoria));
  const nonCar = merged.length - items.length;
  if (nonCar > 0) progress(`${nonCar} anúncio(s) descartado(s) por não serem carro.`);

  // grava no db.json — só os que ainda não existem, pra não sobrescrever um
  // registro completo (detail da página) com o raso da listagem.
  let savedToDb = 0;
  let saveError: string | undefined;
  if (saveToDb) {
    const records = items
      .filter((it) => typeof it.id === "string" && !(it.id in db))
      .map(itemToRecord)
      .filter((r): r is DbRecord => r !== null);
    if (records.length > 0) {
      progress(`Salvando ${records.length} anúncio(s) no db.json...`, { state: "running" });
      try {
        savedToDb = await dbUpsertMany(records);
        for (const r of records) db[r.id] = r;
      } catch (err) {
        saveError = err instanceof Error ? err.message : String(err);
        progress(`⚠️ Falha ao gravar no db.json: ${saveError}`);
      }
    } else {
      saveError = "nenhum registro montado a partir dos cards (id/url ausentes).";
    }
  }

  return {
    count: items.length,
    items: items.map((it) => ({ ...it, inDb: typeof it.id === "string" && it.id in db })),
    categorias,
    raw: null,
    pages: perPage.length,
    newCount: items.length,
    skipped,
    duplicates,
    savedToDb,
    saveError,
    nonCar,
    lastPage,
    perPage,
    aiError: error ?? (categorias ? undefined : "IA não retornou JSON válido."),
  } as CrawlResult;
}
