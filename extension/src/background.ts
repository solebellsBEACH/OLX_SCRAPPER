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
type Item = Card & { categoria: Categoria | null; inDb: boolean };

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
  return cards.map((card, i) => ({
    ...card,
    categoria: byIndex.get(typeof card.index === "number" ? card.index : i) ?? null,
    inDb: typeof card.id === "string" && card.id in db,
  }));
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
 *  Ação: analyzeSelected (páginas dos anúncios -> DB)                 *
 * ------------------------------------------------------------------ */

interface SelectedResult {
  analyzed: DbRecord[];
  errors: Array<{ id: string; error: string }>;
}

async function analyzeSelected(targets: Target[]): Promise<SelectedResult> {
  await ensureProxy();

  const analyzed: DbRecord[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  const tab = await getActiveOlxTab();
  const tabId = tab.id;
  const originalUrl = tab.url ?? null;

  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    const pos = `${i + 1}/${targets.length}`;
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
  if (originalUrl && targets.length > 0) {
    await chrome.tabs.update(tabId, { url: originalUrl }).catch(() => {});
  }

  return { analyzed, errors };
}

/* ------------------------------------------------------------------ *
 *  Roteador de mensagens                                              *
 * ------------------------------------------------------------------ */

interface InMessage {
  action: "analyze" | "autoScroll" | "analyzeSelected" | "getDb" | "clearDb";
  targets?: Target[];
}

chrome.runtime.onMessage.addListener((message: InMessage, _sender, sendResponse) => {
  (async (): Promise<unknown> => {
    switch (message.action) {
      case "analyze":
        return { ok: true, result: await analyze() };
      case "autoScroll":
        return { ok: true, result: await autoScroll() };
      case "analyzeSelected":
        return { ok: true, result: await analyzeSelected(message.targets ?? []) };
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
