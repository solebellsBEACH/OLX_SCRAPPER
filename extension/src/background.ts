/**
 * Service worker do OLX Workspace.
 *
 * Ações vindas do popup (janela separada):
 *   - "analyze":          lê as <section> da listagem, categoriza no DeepSeek,
 *                         devolve os itens (listing + categoria) para a lista.
 *   - "autoScroll":       scroll automático na aba do OLX.
 *   - "analyzeSelected":  para cada item selecionado, NAVEGA a própria aba do
 *                         OLX até a página do anúncio, extrai o HTML/dados,
 *                         categoriza no DeepSeek e GRAVA no arquivo db.json (na
 *                         raiz do projeto, via proxy). Ao final volta a aba para
 *                         a listagem original.
 *   - "getDb" / "clearDb": lê / limpa o db.json (via proxy).
 *
 * Progresso do "analyzeSelected" é emitido via chrome.runtime.sendMessage
 * ({ type: "progress", ... }) para o popup.
 */

const OLX_URL_RE = /^https:\/\/([a-z0-9-]+\.)*olx\.com\.br\//i;
const PROXY_BASE = "http://localhost:8787";
const PROXY_URL = `${PROXY_BASE}/analyze`;
const DB_URL = `${PROXY_BASE}/db`;
const PANEL_PATH = "popup.html?tab=1";

/* ------------------------------------------------------------------ *
 *  Janela separada                                                    *
 * ------------------------------------------------------------------ */

chrome.action.onClicked.addListener(() => {
  void openPanel();
});

async function openPanel(): Promise<void> {
  const panelUrl = chrome.runtime.getURL(PANEL_PATH);
  try {
    const open = await chrome.tabs.query({ url: chrome.runtime.getURL("popup.html*") });
    const existing = open[0];
    if (existing?.id !== undefined && existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true });
      await chrome.tabs.update(existing.id, { active: true });
      return;
    }
  } catch {
    /* cria uma janela nova */
  }
  await chrome.windows.create({ url: panelUrl, type: "popup", width: 480, height: 760 });
}

/* ------------------------------------------------------------------ *
 *  Tipos                                                              *
 * ------------------------------------------------------------------ */

type Categoria = Record<string, unknown> & { index?: number };
type Card = Record<string, unknown> & { index?: number; id?: string | null; url?: string | null };
type Item = Card & {
  categoria: Categoria | null;
  /** id existe no db.json (raso ou completo). */
  inDb: boolean;
  /** id no db.json COM os dados da página (passou pelo "Analisar selecionados"). */
  deepAnalyzed: boolean;
};

interface AnalyzeResult {
  count: number;
  items: Item[];
  categorias: unknown[] | null;
  raw: string | null;
  aiError?: string;
}

type DbRecord = Record<string, unknown> & { id: string; analyzedAt: number };

interface Target {
  id: string;
  url: string;
}

/* ------------------------------------------------------------------ *
 *  JSON DB — arquivo db.json na raiz do projeto (via proxy)           *
 * ------------------------------------------------------------------ */

async function dbAll(): Promise<Record<string, DbRecord>> {
  try {
    const res = await fetch(DB_URL);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; db?: Record<string, DbRecord> };
    return data.ok && data.db ? data.db : {};
  } catch {
    return {};
  }
}

async function dbUpsert(id: string, patch: Record<string, unknown>): Promise<DbRecord> {
  const record: DbRecord = { ...patch, id, analyzedAt: Date.now() };
  const res = await fetch(DB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, record }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    db?: Record<string, DbRecord>;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Falha ao gravar db.json (HTTP ${res.status}). O proxy está rodando?`);
  }
  return data.db?.[id] ?? record;
}

/** Grava um lote de registros (merge por id no proxy). */
async function dbUpsertBatch(records: DbRecord[]): Promise<void> {
  const res = await fetch(DB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Falha ao gravar db.json (HTTP ${res.status}). O proxy está rodando?`);
  }
}

/** Grava muitos registros em lotes de `size`. Devolve quantos foram gravados. */
async function dbUpsertMany(records: DbRecord[], size = 40): Promise<number> {
  let saved = 0;
  for (let i = 0; i < records.length; i += size) {
    const batch = records.slice(i, i + size);
    await dbUpsertBatch(batch);
    saved += batch.length;
    progress(`Salvando no db.json: ${saved}/${records.length}...`, { state: "running" });
  }
  return saved;
}

async function dbClear(): Promise<void> {
  const res = await fetch(DB_URL, { method: "DELETE" });
  if (!res.ok) throw new Error(`Falha ao limpar db.json (HTTP ${res.status}).`);
}

/* ------------------------------------------------------------------ *
 *  Helpers de aba / tempo                                             *
 * ------------------------------------------------------------------ */

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Navega a aba `tabId` até `url` e espera terminar de carregar (best-effort). */
async function navigate(tabId: number, url: string, timeoutMs: number): Promise<void> {
  const adId = url.split(/[?#]/)[0].split("-").pop() ?? "";
  await chrome.tabs.update(tabId, { url });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(400);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === "complete" && (!adId || tab.url?.includes(adId))) return;
  }
}

/** OLX pagina a listagem pelo query param `o` (o=2, o=3, ...). o=1 é sem o param. */
function withPage(url: string, page: number): string {
  const u = new URL(url);
  if (page <= 1) u.searchParams.delete("o");
  else u.searchParams.set("o", String(page));
  return u.toString();
}

function pageOf(url: string | undefined | null): number {
  if (!url) return 1;
  const o = Number(new URL(url).searchParams.get("o") ?? "1");
  return Number.isFinite(o) && o >= 1 ? o : 1;
}

/** Mesma listagem (ignora o `o` e a ordem dos params)? */
function sameListing(a: string, b: string): boolean {
  const norm = (s: string): string => {
    const u = new URL(s);
    u.searchParams.delete("o");
    u.searchParams.sort();
    return `${u.origin}${u.pathname}?${u.searchParams.toString()}`;
  };
  try {
    return norm(a) === norm(b);
  } catch {
    return false;
  }
}

async function getActiveOlxTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && active.url && OLX_URL_RE.test(active.url)) {
    return active as chrome.tabs.Tab & { id: number };
  }
  const olxTabs = await chrome.tabs.query({ url: "https://*.olx.com.br/*" });
  const chosen = olxTabs.find((t) => t.active) ?? olxTabs[0];
  if (!chosen || chosen.id === undefined) {
    throw new Error("Nenhuma aba do OLX aberta. Abra uma página do OLX e tente de novo.");
  }
  return chosen as chrome.tabs.Tab & { id: number };
}

async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

function progress(text: string, extra: Record<string, unknown> = {}): void {
  chrome.runtime.sendMessage({ type: "progress", text, ...extra }).catch(() => {
    /* popup fechado */
  });
}

/** Garante que o proxy local está no ar; senão, erro claro. */
async function ensureProxy(): Promise<void> {
  try {
    const res = await fetch(`${PROXY_BASE}/health`, { cache: "no-store" });
    if (res.ok) return;
  } catch {
    /* cai no throw abaixo */
  }
  throw new Error(
    `Proxy offline em ${PROXY_BASE}. Abra um terminal e rode:  cd proxy && npm start`,
  );
}

/* ------------------------------------------------------------------ *
 *  DeepSeek (via proxy local)                                         *
 * ------------------------------------------------------------------ */

async function categorize(
  sections: unknown[],
): Promise<{ categorias: unknown[] | null; raw: string | null; error?: string }> {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      categorias?: unknown[] | null;
      raw?: string | null;
      error?: string;
    };
    if (!response.ok || !data.ok) {
      return { categorias: null, raw: null, error: data.error ?? `Proxy HTTP ${response.status}` };
    }
    return {
      categorias: Array.isArray(data.categorias) ? data.categorias : null,
      raw: data.raw ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { categorias: null, raw: null, error: `Proxy inacessível (${msg}). Rode: cd proxy && npm start` };
  }
}

/**
 * Categoriza em lotes para não estourar o prompt / o JSON de resposta quando a
 * varredura junta muitas páginas. Cada card já leva `index` global; o proxy pede
 * ao modelo para manter esse index, então basta concatenar os retornos.
 */
async function categorizeInChunks(
  cards: Card[],
  size: number,
): Promise<{ categorias: unknown[] | null; error?: string }> {
  const out: unknown[] = [];
  let anyOk = false;
  let lastError: string | undefined;
  for (let i = 0; i < cards.length; i += size) {
    const chunk = cards.slice(i, i + size);
    progress(`DeepSeek: ${i + 1}–${Math.min(i + size, cards.length)} de ${cards.length}...`);
    const { categorias, error } = await categorize(chunk);
    if (Array.isArray(categorias)) {
      out.push(...categorias);
      anyOk = true;
    } else if (error) {
      lastError = error;
    }
  }
  return { categorias: anyOk ? out : null, error: anyOk ? undefined : lastError };
}

function mergeItems(cards: Card[], categorias: unknown[] | null, db: Record<string, DbRecord>): Item[] {
  const byIndex = new Map<number, Categoria>();
  if (Array.isArray(categorias)) {
    categorias.forEach((c, i) => {
      if (c && typeof c === "object") {
        const cat = c as Categoria;
        byIndex.set(typeof cat.index === "number" ? cat.index : i, cat);
      }
    });
  }
  return cards.map((card, i) => {
    const id = typeof card.id === "string" ? card.id : null;
    const rec = id ? db[id] : undefined;
    return {
      ...card,
      categoria: byIndex.get(typeof card.index === "number" ? card.index : i) ?? null,
      inDb: Boolean(rec),
      deepAnalyzed: Boolean(rec && !(rec as Record<string, unknown>).shallow),
    };
  });
}

/**
 * Registro "raso" a partir de um card da listagem (sem visitar a página do
 * anúncio). Mesmo shape do db.json que o painel consome; `analyzeSelected`
 * depois sobrescreve `detail` com os dados completos da página (merge por id).
 */
function itemToRecord(item: Item): DbRecord | null {
  const id = typeof item.id === "string" ? item.id : null;
  const url = typeof item.url === "string" ? item.url : null;
  if (!id || !url) return null;
  const c = item as Record<string, unknown> & {
    title?: unknown;
    price?: unknown;
    oldPrice?: unknown;
    km?: unknown;
    kmText?: unknown;
    color?: unknown;
    location?: unknown;
    date?: unknown;
    image?: unknown;
    photos?: unknown;
    details?: unknown;
  };
  const properties = Array.isArray(c.details)
    ? (c.details as Array<Record<string, unknown>>).map((d) => ({
        label: String(d?.label ?? ""),
        value: String(d?.value ?? ""),
      }))
    : [];
  return {
    id,
    url,
    detail: {
      url,
      id,
      title: c.title ?? null,
      price: c.price ?? null,
      priceOld: c.oldPrice ?? null,
      km: typeof c.km === "number" ? c.km : null,
      kmText: c.kmText ?? null,
      color: c.color ?? null,
      description: null,
      location: c.location ?? null,
      publishedAt: null,
      dateText: c.date ?? null,
      properties,
      images: c.image ? [String(c.image)] : [],
      photos: typeof c.photos === "number" ? c.photos : null,
    },
    categoria: item.categoria ?? null,
    source: "listing",
    shallow: true,
    analyzedAt: Date.now(),
  } as DbRecord;
}

function detailToSection(id: string, data: Record<string, unknown> | null): Record<string, unknown> {
  const props = Array.isArray(data?.properties) ? (data!.properties as Array<Record<string, unknown>>) : [];
  return {
    index: 0,
    id,
    title: data?.title ?? null,
    price: data?.price ?? null,
    description: String(data?.description ?? "").slice(0, 1500),
    details: props.map((p) => ({ label: String(p.label ?? ""), value: String(p.value ?? "") })),
  };
}

/* ------------------------------------------------------------------ *
 *  Ação: analyze (listagem)                                           *
 * ------------------------------------------------------------------ */

async function analyze(): Promise<AnalyzeResult> {
  await ensureProxy();
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);

  const extracted = (await chrome.tabs.sendMessage(tab.id, { action: "extractSections" })) as
    | { ok: boolean; count: number; cards: Card[] }
    | undefined;
  const cards = extracted?.cards ?? [];
  const db = await dbAll();

  const { categorias, raw, error } = await categorize(cards);

  return {
    count: cards.length,
    items: mergeItems(cards, categorias, db),
    categorias,
    raw,
    aiError: error ?? (categorias ? undefined : "IA não retornou JSON válido (veja 'raw')."),
  };
}

async function autoScroll(): Promise<AnalyzeResult> {
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);
  await chrome.tabs.sendMessage(tab.id, { action: "autoScroll" });
  return { count: 0, items: [], categorias: null, raw: null };
}

/* ------------------------------------------------------------------ *
 *  Ação: crawlListing — varre a paginação da listagem               *
 * ------------------------------------------------------------------ */

interface CrawlOptions {
  /** máximo de páginas a visitar a partir da atual. */
  maxPages: number;
  /** rolar cada página antes de extrair (OLX carrega cards no scroll). */
  scrollEach: boolean;
  /** não recategoriza (nem lista de novo) anúncios que já estão no db.json. */
  skipKnown: boolean;
  /** grava os anúncios novos (raso, sem visitar a página) no db.json. */
  saveToDb: boolean;
}

interface CrawlResult extends AnalyzeResult {
  pages: number;
  /** anúncios novos, de fato varridos e mandados pra IA. */
  newCount: number;
  /** anúncios ignorados por já estarem no db.json. */
  skipped: number;
  /** anúncios ignorados por aparecerem em mais de uma página. */
  duplicates: number;
  /** anúncios gravados no db.json nesta varredura. */
  savedToDb: number;
  /** motivo de não ter gravado (quando `saveToDb` estava ligado e nada foi salvo). */
  saveError?: string;
  perPage: Array<{ page: number; novos: number; noDb: number; repetidos: number; total: number }>;
}

async function crawlListing({
  maxPages,
  scrollEach,
  skipKnown,
  saveToDb,
}: CrawlOptions): Promise<CrawlResult> {
  await ensureProxy();

  const tab = await getActiveOlxTab();
  const tabId = tab.id;
  const baseUrl = tab.url ?? "";
  if (!baseUrl) throw new Error("Aba do OLX sem URL. Abra uma página de listagem e tente de novo.");

  const startPage = pageOf(baseUrl);
  const pages = Math.max(1, Math.min(maxPages || 1, 50));
  const originalUrl = baseUrl;

  // db.json lido UMA vez: serve pra pular os que já foram analisados.
  const db = await dbAll();

  const allCards: Card[] = []; // novos (não repetidos e, se skipKnown, fora do DB)
  const seen = new Set<string>(); // ids já vistos NESTA varredura
  let skipped = 0; // já estavam no db.json
  let duplicates = 0; // apareceram em mais de uma página
  const perPage: CrawlResult["perPage"] = [];

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
      perPage,
    };
  }

  progress(`Categorizando ${allCards.length} anúncio(s) novo(s) no DeepSeek...`, { state: "running" });
  const { categorias, error } = await categorizeInChunks(allCards, 20);
  const items = mergeItems(allCards, categorias, db);

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
    count: allCards.length,
    items: items.map((it) => ({ ...it, inDb: typeof it.id === "string" && it.id in db })),
    categorias,
    raw: null,
    pages: perPage.length,
    newCount: allCards.length,
    skipped,
    duplicates,
    savedToDb,
    saveError,
    perPage,
    aiError: error ?? (categorias ? undefined : "IA não retornou JSON válido."),
  } as CrawlResult;
}

/* ------------------------------------------------------------------ *
 *  Ação: analyzeSelected (páginas dos anúncios -> DB)                 *
 * ------------------------------------------------------------------ */

interface SelectedResult {
  analyzed: DbRecord[];
  errors: Array<{ id: string; error: string }>;
  /** ids ignorados por já terem os dados da página no db.json. */
  skipped: string[];
}

async function analyzeSelected(targets: Target[], force = false): Promise<SelectedResult> {
  await ensureProxy();

  const analyzed: DbRecord[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  const skipped: string[] = [];

  // pula o que já foi feito: id no db.json e NÃO raso (já tem detail da página)
  const db = await dbAll();
  const pending = targets.filter((t) => {
    const rec = db[t.id];
    const alreadyDone = Boolean(rec && !(rec as Record<string, unknown>).shallow);
    if (alreadyDone && !force) {
      skipped.push(t.id);
      return false;
    }
    return true;
  });
  if (skipped.length > 0) {
    progress(`${skipped.length} já analisado(s) — pulando.`);
  }

  const tab = await getActiveOlxTab();
  const tabId = tab.id;
  const originalUrl = tab.url ?? null;

  for (let i = 0; i < pending.length; i += 1) {
    const t = pending[i];
    const pos = `${i + 1}/${pending.length}`;
    try {
      progress(`Navegando até o anúncio ${t.id} (${pos})...`, { id: t.id, state: "running" });
      await navigate(tabId, t.url, 25000);
      await delay(1800); // deixa o React popular a página

      await injectContent(tabId);

      let data: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 3 && !data; attempt += 1) {
        const resp = (await chrome.tabs.sendMessage(tabId, { action: "extractAdPage" })) as
          | { ok: boolean; data: Record<string, unknown> }
          | undefined;
        data = resp?.data ?? null;
        if (!data) await delay(1200);
      }
      if (!data) throw new Error("não consegui ler os dados da página");

      progress(`Categorizando ${t.id} no DeepSeek (${pos})...`, { id: t.id, state: "running" });
      const { categorias } = await categorize([detailToSection(t.id, data)]);
      const categoria = Array.isArray(categorias) ? (categorias[0] ?? null) : null;

      const record = await dbUpsert(t.id, {
        url: t.url,
        detail: data,
        categoria,
        htmlLength: data.htmlLength ?? null,
      });
      analyzed.push(record);
      progress(`✔ ${t.id} salvo no DB (${pos})`, { id: t.id, state: "done" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ id: t.id, error: msg });
      progress(`✖ ${t.id}: ${msg}`, { id: t.id, state: "error" });
    }
  }

  // volta a aba para a listagem original
  if (originalUrl && pending.length > 0) {
    await chrome.tabs.update(tabId, { url: originalUrl }).catch(() => {});
  }

  return { analyzed, errors, skipped };
}

/* ------------------------------------------------------------------ *
 *  Roteador de mensagens                                              *
 * ------------------------------------------------------------------ */

interface InMessage {
  action: "analyze" | "autoScroll" | "analyzeSelected" | "crawlListing" | "getDb" | "clearDb";
  targets?: Target[];
  force?: boolean;
  maxPages?: number;
  scrollEach?: boolean;
  skipKnown?: boolean;
  saveToDb?: boolean;
}

chrome.runtime.onMessage.addListener((message: InMessage, _sender, sendResponse) => {
  (async (): Promise<unknown> => {
    switch (message.action) {
      case "analyze":
        return { ok: true, result: await analyze() };
      case "autoScroll":
        return { ok: true, result: await autoScroll() };
      case "analyzeSelected":
        return { ok: true, result: await analyzeSelected(message.targets ?? [], message.force ?? false) };
      case "crawlListing":
        return {
          ok: true,
          result: await crawlListing({
            maxPages: message.maxPages ?? 5,
            scrollEach: message.scrollEach ?? true,
            skipKnown: message.skipKnown ?? true,
            saveToDb: message.saveToDb ?? true,
          }),
        };
      case "getDb":
        return { ok: true, db: await dbAll() };
      case "clearDb":
        await dbClear();
        return { ok: true, db: {} };
      default:
        return { ok: false, error: `Ação desconhecida: ${String((message as { action?: string }).action)}` };
    }
  })()
    .then(sendResponse)
    .catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[OLX Workspace] Falha:", msg);
      sendResponse({ ok: false, error: msg });
    });
  return true; // resposta assíncrona
});

export {};
