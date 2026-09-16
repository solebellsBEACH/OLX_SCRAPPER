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
/** A extensão só age em páginas da categoria de carros do OLX. */
const OLX_CARROS_RE = /olx\.com\.br\/[^?#]*carros-vans-e-utilitarios/i;
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

type Categoria = Record<string, unknown> & { index?: number; tipo?: string | null };
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
  /** anúncios descartados por NÃO serem carro (moto, caminhão, náutica, ...). */
  nonCar?: number;
  /** anúncios novos gravados (rasos) no db.json, pra não perder ao fechar a extensão. */
  savedToDb?: number;
}

/* ------------------------------------------------------------------ *
 *  Filtro: a extensão analisa SOMENTE carros de passeio              *
 * ------------------------------------------------------------------ */

/** `tipo` (vindo da IA) que representa algo que NÃO é carro. */
const NAO_CARRO = new Set([
  "moto", "motocicleta", "motoneta", "scooter", "ciclomotor",
  "caminhao", "caminhão", "onibus", "ônibus", "microonibus", "micro-ônibus",
  "van", "kombi", "furgao", "furgão", "reboque", "trailer", "carreta",
  "trator", "maquina", "máquina", "quadriciclo", "triciclo", "utv",
  "jetski", "jet ski", "lancha", "barco", "nautica", "náutica", "aeronave",
  "outro", "outros", "nao informado", "não informado",
]);

/** Normaliza o `tipo` da categoria (minúsculo, sem espaços nas pontas). */
function tipoVeiculo(cat: unknown): string | null {
  const raw =
    cat && typeof cat === "object" && typeof (cat as Record<string, unknown>).tipo === "string"
      ? ((cat as Record<string, unknown>).tipo as string)
      : "";
  const t = raw.toLowerCase().trim();
  return t || null;
}

/** É carro de passeio? Sem `tipo` conhecido => assume que sim (não descarta à toa). */
function isCarro(cat: unknown): boolean {
  const t = tipoVeiculo(cat);
  return !t || !NAO_CARRO.has(t);
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

/** Aba do OLX na categoria de carros (URL com `carros-vans-e-utilitarios`). */
function isCarrosOlxUrl(url: string | undefined): boolean {
  return Boolean(url && OLX_URL_RE.test(url) && OLX_CARROS_RE.test(url));
}

async function getActiveOlxTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && isCarrosOlxUrl(active.url)) {
    return active as chrome.tabs.Tab & { id: number };
  }
  const olxTabs = await chrome.tabs.query({ url: "https://*.olx.com.br/*" });
  const chosen =
    olxTabs.find((t) => t.active && isCarrosOlxUrl(t.url)) ?? olxTabs.find((t) => isCarrosOlxUrl(t.url));
  if (!chosen || chosen.id === undefined) {
    throw new Error(
      "Abra uma página de carros do OLX (URL com 'carros-vans-e-utilitarios') e tente de novo.",
    );
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
    const res = await fetch(`${PROXY_BASE}/health`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
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
  label?: string,
): Promise<{ categorias: unknown[] | null; raw: string | null; error?: string }> {
  try {
    progress(`${label ?? `Analisando ${sections.length} anúncio(s)`} · aguardando IA (alguns minutos por lote)...`);
    const response = await fetch(PROXY_URL, {
      signal: AbortSignal.timeout(310_000),
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
    const data = (await response.json().catch((err) => {
      if (err.name === "TimeoutError" || err.name === "AbortError") throw err;
      return {};
    })) as {
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
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return { categorias: null, raw: null, error: "A análise excedeu o tempo de espera. Tente novamente com menos anúncios por vez." };
    }
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
  size = 5,
): Promise<{ categorias: unknown[] | null; error?: string }> {
  if (cards.length === 0) return { categorias: [] };
  let failed = 0;
  const out: unknown[] = [];
  let anyOk = false;
  let lastError: string | undefined;
  for (let i = 0; i < cards.length; i += size) {
    const chunk = cards.slice(i, i + size);
    const label = `Lote ${Math.floor(i / size) + 1}/${Math.ceil(cards.length / size)} · anúncios ${i + 1}–${i + chunk.length} de ${cards.length}`;
    const { categorias, error } = await categorize(chunk, label);
    if (Array.isArray(categorias)) {
      out.push(...categorias.map((category, position) => {
        if (!category || typeof category !== "object") return category;
        const cat = category as Categoria;
        return { ...cat, index: typeof cat.index === "number" ? cat.index : chunk[position]?.index };
      }));
      anyOk = true;
    } else {
      failed += chunk.length;
      lastError = error ?? "A IA não retornou categorias válidas.";
    }
  }
  return {
    categorias: anyOk ? out : null,
    error: failed ? `${failed} de ${cards.length} anúncio(s) ficaram sem análise. Os resultados dos demais lotes foram mantidos. ${lastError}` : undefined,
  };
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
    const deepAnalyzed = Boolean(rec && !(rec as Record<string, unknown>).shallow);
    const fresh = byIndex.get(typeof card.index === "number" ? card.index : i) ?? null;
    // A recategorização da listagem só vê título/detalhes (sem descrição), então quase
    // nunca traz score. Se o item já foi analisado a fundo e tem score salvo no DB, usa
    // esse (mais rico) em vez do score (quase sempre null) que acabou de vir da IA.
    const storedScore = deepAnalyzed ? scoreOf((rec as Record<string, unknown>).categoria) : null;
    const categoria =
      storedScore !== null
        ? { ...(fresh ?? {}), score: storedScore, scoreMotivo: ((rec as Record<string, unknown>).categoria as Categoria | undefined)?.scoreMotivo ?? null }
        : fresh;
    return {
      ...card,
      categoria,
      inDb: Boolean(rec),
      deepAnalyzed,
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

/** Score (0-100) de condição do carro, se a categoria já tiver um. */
function scoreOf(cat: unknown): number | null {
  const v = cat && typeof cat === "object" ? (cat as Record<string, unknown>).score : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Para itens já analisados a fundo (estão no db.json com `detail`) mas cuja
 * categoria ainda não tem `score`, pede à IA só o score — usando os dados da
 * página que JÁ estão salvos (sem navegar de novo até o anúncio). Assim, um
 * carro analisado antes desta feature existir ganha o score assim que
 * aparecer de novo na tela do "Analisar página".
 */
async function backfillScores(items: Item[], db: Record<string, DbRecord>): Promise<void> {
  const pending = items.filter((it) => {
    const id = typeof it.id === "string" ? it.id : null;
    if (!id || !it.deepAnalyzed) return false;
    const rec = db[id];
    return Boolean(rec) && scoreOf((rec as Record<string, unknown>).categoria) === null;
  });
  if (pending.length === 0) return;

  progress(`Calculando score de condição para ${pending.length} anúncio(s) já analisado(s)...`, { state: "running" });
  const sections = pending.map((it, i) => {
    const id = it.id as string;
    const rec = db[id] as unknown as { detail?: Record<string, unknown> };
    return { ...detailToSection(id, rec.detail ?? null), index: i };
  });
  const { categorias } = await categorizeInChunks(sections as unknown as Card[]);
  if (!Array.isArray(categorias)) return;

  for (let i = 0; i < pending.length; i += 1) {
    const it = pending[i];
    const id = it.id as string;
    const scoreCat = categorias[i] as Categoria | undefined;
    const score = scoreOf(scoreCat);
    if (score === null) continue;
    const rec = db[id] as unknown as { categoria?: Categoria | null };
    const mergedCategoria = { ...(rec.categoria ?? {}), score, scoreMotivo: (scoreCat as Record<string, unknown>)?.scoreMotivo ?? null };
    try {
      const saved = await dbUpsert(id, { categoria: mergedCategoria });
      db[id] = saved;
      it.categoria = mergedCategoria;
    } catch {
      /* sem score desta vez; tenta de novo na próxima análise */
    }
  }
}

/**
 * Consulta rasa (sem IA) do db.json pra um lote de ids — usada pelo content
 * script assim que a página do OLX abre, pra já pintar borda+score nos cards
 * que já foram analisados antes, sem esperar o clique em "Analisar página".
 * Nunca lança: se o proxy estiver fora do ar, devolve lista vazia (o content
 * script simplesmente não marca nada e tenta de novo na próxima checagem).
 */
async function checkKnown(ids: string[]): Promise<Array<{ id: string; status: "done" | "pending"; score: number | null }>> {
  if (ids.length === 0) return [];
  const db = await dbAll();
  return ids.map((id) => {
    const rec = db[id];
    const deepAnalyzed = Boolean(rec && !(rec as Record<string, unknown>).shallow);
    return {
      id,
      status: deepAnalyzed ? "done" : "pending",
      score: deepAnalyzed ? scoreOf((rec as Record<string, unknown>).categoria) : null,
    };
  });
}

interface ShowIndicatorsResult {
  count: number;
  done: number;
  pending: number;
}

/**
 * Ação do botão "Exibir indicadores": força a marcação (borda verde/amarela +
 * score) na aba do OLX aberta AGORA, sem esperar a injeção automática do
 * content script — útil quando a extensão foi recarregada (ou a aba já
 * estava aberta antes de instalar/atualizar) e o `content_scripts` do
 * manifest não rodou nela. Não chama IA: só lê o db.json (via `checkKnown`).
 */
async function showIndicators(): Promise<ShowIndicatorsResult> {
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);

  const extracted = (await chrome.tabs.sendMessage(tab.id, { action: "extractSections" })) as
    | { ok: boolean; count: number; cards: Card[] }
    | undefined;
  const cards = extracted?.cards ?? [];
  const ids = cards
    .map((c) => (typeof c.id === "string" ? c.id : null))
    .filter((id): id is string => Boolean(id));

  const marks = await checkKnown(ids);
  await chrome.tabs.sendMessage(tab.id, { action: "markCards", marks }).catch(() => {
    /* content script ainda não respondeu — tenta de novo no próximo clique */
  });

  return {
    count: marks.length,
    done: marks.filter((m) => m.status === "done").length,
    pending: marks.filter((m) => m.status === "pending").length,
  };
}

/** Ação do botão "Ocultar indicadores": limpa borda/score da aba do OLX aberta agora. */
async function hideIndicators(): Promise<void> {
  const tab = await getActiveOlxTab();
  await chrome.tabs.sendMessage(tab.id, { action: "hideIndicators" }).catch(() => {
    /* sem content script na aba — nada pra ocultar */
  });
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

  const { categorias, error } = await categorizeInChunks(cards);
  const raw = null;

  const merged = mergeItems(cards, categorias, db);
  const items = merged.filter((it) => isCarro(it.categoria));
  const nonCar = merged.length - items.length;

  await backfillScores(items, db);
  await markCardsOnPage(tab.id, items);

  // Grava um rascunho raso de cada carro NOVO no db.json — sem isso, o que o
  // "Analisar página" categoriza só existe na memória da janela da extensão e
  // some ao fechá-la, sem chance de rodar o "Analisar selecionados" depois.
  // Nunca sobrescreve quem já está no DB (raso ou completo).
  let savedToDb = 0;
  const newRecords = items
    .filter((it) => typeof it.id === "string" && !(it.id in db))
    .map(itemToRecord)
    .filter((r): r is DbRecord => r !== null);
  if (newRecords.length > 0) {
    try {
      savedToDb = await dbUpsertMany(newRecords);
      for (const r of newRecords) db[r.id] = r;
    } catch (err) {
      progress(`⚠️ Não deu pra salvar rascunho no db.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    count: items.length,
    items,
    categorias,
    raw,
    nonCar,
    savedToDb,
    aiError: error ?? (categorias ? undefined : "IA não retornou JSON válido (veja 'raw')."),
  };
}

/**
 * Ação do botão "Carregar pendentes": lê o db.json e devolve os registros
 * RASOS (categorizados na listagem, mas que ainda não passaram pela página do
 * anúncio) como itens prontos pra lista do popup — dá pra selecionar e rodar
 * "Analisar selecionados" neles mesmo em uma sessão nova da extensão, sem
 * precisar estar na página de listagem onde foram vistos originalmente (usa
 * a `url` salva no registro pra navegar até o anúncio).
 */
async function loadPending(): Promise<AnalyzeResult> {
  const db = await dbAll();
  const items: Item[] = Object.values(db)
    .filter((rec) => Boolean((rec as Record<string, unknown>).shallow))
    .map((rec) => recordToItem(rec));
  return { count: items.length, items, categorias: null, raw: null };
}

/** Converte um registro do db.json (raso ou completo) pro shape `Item` da lista do popup. */
function recordToItem(rec: DbRecord): Item {
  const detail = (rec as Record<string, unknown>).detail as Record<string, unknown> | undefined;
  return {
    id: rec.id,
    title: (detail?.title as string | null) ?? null,
    url: (rec.url as string | undefined) ?? (detail?.url as string | null) ?? null,
    image: Array.isArray(detail?.images) ? ((detail!.images as unknown[])[0] as string | undefined) ?? null : null,
    price: (detail?.price as string | null) ?? null,
    oldPrice: (detail?.priceOld as string | null) ?? null,
    km: typeof detail?.km === "number" ? (detail!.km as number) : null,
    kmText: (detail?.kmText as string | null) ?? null,
    color: (detail?.color as string | null) ?? null,
    location: (detail?.location as string | null) ?? null,
    date: (detail?.dateText as string | null) ?? (detail?.publishedAt as string | null) ?? null,
    categoria: ((rec as Record<string, unknown>).categoria as Categoria | null) ?? null,
    inDb: true,
    deepAnalyzed: !(rec as Record<string, unknown>).shallow,
  };
}

/**
 * Manda o content script pintar, DIRETO na página do OLX, a borda de cada
 * card visível: verde (já analisado a fundo, com o score) ou amarela (ainda
 * aguarda o "Analisar selecionados"). Best-effort — se a aba já mudou de
 * página, simplesmente não encontra os cards e não faz nada.
 */
async function markCardsOnPage(tabId: number, items: Item[]): Promise<void> {
  const marks = items
    .filter((it): it is Item & { id: string } => typeof it.id === "string")
    .map((it) => ({
      id: it.id,
      status: it.deepAnalyzed ? "done" : "pending",
      score: scoreOf(it.categoria),
    }));
  if (marks.length === 0) return;
  await chrome.tabs.sendMessage(tabId, { action: "markCards", marks }).catch(() => {
    /* aba sem o content script (navegou pra outro lugar) — ignora */
  });
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
  /** total de páginas que a paginação do OLX oferece (null se não deu pra ler). */
  lastPage?: number | null;
  perPage: Array<{ page: number; novos: number; noDb: number; repetidos: number; total: number }>;
}

/** Teto rígido de páginas por varredura, independente do que o usuário pedir. */
const CRAWL_MAX_PAGES = 10;

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
      lastPage,
      perPage,
    };
  }

  progress(`Categorizando ${allCards.length} anúncio(s) novo(s) no DeepSeek...`, { state: "running" });
  const { categorias, error } = await categorizeInChunks(allCards);
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

/* ------------------------------------------------------------------ *
 *  Ação: analyzeSelected (páginas dos anúncios -> DB)                 *
 * ------------------------------------------------------------------ */

interface SelectedResult {
  analyzed: DbRecord[];
  errors: Array<{ id: string; error: string }>;
  /** ids ignorados por já terem os dados da página no db.json. */
  skipped: string[];
  /** ids ignorados por não serem carro (moto, caminhão, náutica, ...). */
  nonCar: string[];
}

async function analyzeSelected(targets: Target[], force = false): Promise<SelectedResult> {
  await ensureProxy();

  const analyzed: DbRecord[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  const skipped: string[] = [];
  const nonCar: string[] = [];

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

      if (!isCarro(categoria)) {
        nonCar.push(t.id);
        progress(`↷ ${t.id} ignorado — não é carro (${pos})`, { id: t.id, state: "error" });
        continue;
      }

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

  return { analyzed, errors, skipped, nonCar };
}

/* ------------------------------------------------------------------ *
 *  Roteador de mensagens                                              *
 * ------------------------------------------------------------------ */

interface InMessage {
  action:
    | "analyze"
    | "autoScroll"
    | "analyzeSelected"
    | "crawlListing"
    | "getDb"
    | "clearDb"
    | "checkKnown"
    | "showIndicators"
    | "hideIndicators"
    | "loadPending";
  targets?: Target[];
  force?: boolean;
  maxPages?: number;
  scrollEach?: boolean;
  skipKnown?: boolean;
  saveToDb?: boolean;
  /** só para "checkKnown": ids dos cards visíveis na página. */
  ids?: string[];
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
      case "checkKnown":
        return { ok: true, marks: await checkKnown(message.ids ?? []) };
      case "showIndicators":
        return { ok: true, result: await showIndicators() };
      case "hideIndicators":
        await hideIndicators();
        return { ok: true };
      case "loadPending":
        return { ok: true, result: await loadPending() };
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
