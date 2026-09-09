/**
 * UI do OLX Workspace (janela separada, popup.html?tab=1).
 *
 * - "Executar Análise": lista os anúncios categorizados pela IA, paginado 5/5.
 * - Seleção por checkbox -> "Analisar selecionados": abre a página de cada
 *   anúncio, extrai o HTML/dados, categoriza e grava no JSON DB.
 * - "Ver DB": mostra o conteúdo do chrome.storage.local (olx_db).
 */

const PAGE_SIZE = 5;

interface Categoria {
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  ano?: number | null;
  motor?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  portas?: number | null;
  carroceria?: string | null;
}

interface Item {
  id?: string | null;
  title?: string | null;
  url?: string | null;
  image?: string | null;
  price?: string | null;
  oldPrice?: string | null;
  km?: number | null;
  kmText?: string | null;
  color?: string | null;
  location?: string | null;
  date?: string | null;
  categoria?: Categoria | null;
  inDb?: boolean;
}

interface AnalyzeResult {
  count: number;
  items: Item[];
  categorias?: unknown[] | null;
  raw?: string | null;
  aiError?: string;
}

interface DispatchResponse {
  ok: boolean;
  result?: AnalyzeResult;
  db?: Record<string, unknown>;
  error?: string;
}

interface ProgressMessage {
  type: "progress" | "scrollProgress";
  text: string;
  id?: string;
  state?: "running" | "done" | "error";
}

/** Log no console DESTA janela (a da extensão), nunca no console do OLX. */
function logSections(items: Item[]): void {
  console.log("%c=== DADOS DAS SECTIONS ===", "font-weight:bold");
  console.log(`Total de anúncios: ${items.length}`);
  console.table(
    items.map((c) => ({
      título: c.title,
      preço: c.price,
      "preço antigo": c.oldPrice,
      km: c.km,
      cor: c.color,
      local: c.location,
      data: c.date,
    })),
  );
  console.log(items);
}

function logCategorias(categorias: unknown[] | null | undefined, raw: string | null | undefined): void {
  console.log("%c=== CATEGORIZAÇÃO IA (marca / modelo / ano / motor ...) ===", "font-weight:bold");
  if (Array.isArray(categorias)) {
    console.table(categorias);
    console.log(categorias);
  } else {
    console.warn("IA não retornou JSON válido. Resposta bruta:");
    console.log(raw ?? "(vazio)");
  }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} não encontrado`);
  return el as T;
};

const statusEl = $<HTMLDivElement>("status");
const listEl = $<HTMLDivElement>("list");
const pagerEl = $<HTMLDivElement>("pager");
const pageInfoEl = $<HTMLSpanElement>("pageInfo");
const toolbarEl = $<HTMLDivElement>("toolbar");
const dbDumpEl = $<HTMLPreElement>("dbDump");
const analyzeBtn = $<HTMLButtonElement>("analyzeBtn");
const scrollBtn = $<HTMLButtonElement>("scrollBtn");
const prevBtn = $<HTMLButtonElement>("prevBtn");
const nextBtn = $<HTMLButtonElement>("nextBtn");
const selAllBtn = $<HTMLInputElement>("selAllBtn");
const analyzeSelBtn = $<HTMLButtonElement>("analyzeSelBtn");
const viewDbBtn = $<HTMLButtonElement>("viewDbBtn");
const clearDbBtn = $<HTMLButtonElement>("clearDbBtn");

if (new URLSearchParams(location.search).has("tab")) {
  document.body.classList.add("as-tab");
}

let items: Item[] = [];
let page = 0;
const selected = new Set<string>();
const rowState = new Map<string, "running" | "done" | "error">();

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function send(action: string, extra: Record<string, unknown> = {}): Promise<DispatchResponse> {
  const response = (await chrome.runtime.sendMessage({ action, ...extra })) as
    | DispatchResponse
    | undefined;
  return response ?? { ok: false, error: "Sem resposta do service worker." };
}

function lockButtons(lock: boolean): void {
  analyzeBtn.disabled = lock;
  scrollBtn.disabled = lock;
  analyzeSelBtn.disabled = lock || selected.size === 0;
}

/* ---------- render ---------- */

function catLine(c: Categoria | null | undefined): string {
  if (!c) return "— (sem categorização)";
  const head = [c.marca, c.modelo, c.versao].filter(Boolean).join(" ");
  const rest = [
    c.ano ? String(c.ano) : null,
    [c.motor, c.combustivel].filter(Boolean).join(" ") || null,
    c.cambio,
    c.portas ? `${c.portas}p` : null,
    c.carroceria,
  ].filter(Boolean);
  return [head, ...rest].filter(Boolean).join(" · ") || "—";
}

function metaLine(it: Item): string {
  return [
    it.kmText ?? (it.km != null ? `${it.km.toLocaleString("pt-BR")} km` : null),
    it.color,
    it.location,
    it.date,
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderItem(it: Item): HTMLDivElement {
  const id = it.id ?? "";
  const row = document.createElement("div");
  row.className = "item";
  row.dataset.id = id;
  if (id && selected.has(id)) row.classList.add("sel");

  const pick = document.createElement("div");
  pick.className = "pick";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = id ? selected.has(id) : false;
  cb.disabled = !id;
  cb.addEventListener("change", () => {
    if (!id) return;
    if (cb.checked) selected.add(id);
    else selected.delete(id);
    row.classList.toggle("sel", cb.checked);
    syncSelectionUi();
  });
  pick.appendChild(cb);
  row.appendChild(pick);

  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = "";
  img.loading = "lazy";
  if (it.image) img.src = it.image;
  row.appendChild(img);

  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = it.title ?? "(sem título)";
  body.appendChild(title);

  const cat = document.createElement("div");
  cat.className = "cat";
  cat.textContent = catLine(it.categoria);
  body.appendChild(cat);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = metaLine(it);
  body.appendChild(meta);

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = it.price ?? "Preço não informado";
  if (it.oldPrice) {
    const old = document.createElement("span");
    old.className = "old";
    old.textContent = it.oldPrice;
    price.appendChild(old);
  }
  body.appendChild(price);

  const state = id ? rowState.get(id) : undefined;
  if (state === "running") body.appendChild(badge("run", "⏳ analisando…"));
  else if (state === "error") body.appendChild(badge("err", "✖ falhou"));
  else if (it.inDb) body.appendChild(badge("db", "🗃️ no DB"));

  if (it.url) {
    const link = document.createElement("a");
    link.href = it.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Ver no OLX ↗";
    body.appendChild(document.createElement("br"));
    body.appendChild(link);
  }

  row.appendChild(body);
  return row;
}

function badge(kind: "db" | "run" | "err", text: string): HTMLSpanElement {
  const b = document.createElement("span");
  b.className = `badge ${kind}`;
  b.textContent = text;
  return b;
}

function pageItems(): Item[] {
  const start = page * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

function renderPage(): void {
  listEl.replaceChildren();
  if (items.length === 0) {
    pagerEl.hidden = true;
    toolbarEl.hidden = true;
    return;
  }
  toolbarEl.hidden = false;

  const pages = Math.ceil(items.length / PAGE_SIZE);
  page = Math.min(Math.max(page, 0), pages - 1);

  for (const it of pageItems()) listEl.appendChild(renderItem(it));

  pagerEl.hidden = pages <= 1;
  pageInfoEl.textContent = `Página ${page + 1} de ${pages} · ${items.length} anúncios`;
  prevBtn.disabled = page === 0;
  nextBtn.disabled = page >= pages - 1;

  const ids = pageItems().map((i) => i.id).filter(Boolean) as string[];
  selAllBtn.checked = ids.length > 0 && ids.every((id) => selected.has(id));
  syncSelectionUi();
}

function syncSelectionUi(): void {
  analyzeSelBtn.textContent = `🔎 Analisar selecionados (${selected.size})`;
  analyzeSelBtn.disabled = selected.size === 0 || analyzeBtn.disabled;
}

/* ---------- ações ---------- */

analyzeBtn.addEventListener("click", () => {
  void (async () => {
    lockButtons(true);
    setStatus("⏳ Lendo sections + DeepSeek...");
    try {
      const response = await send("analyze");
      if (!response.ok) {
        setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
        return;
      }
      const result = response.result ?? { count: 0, items: [] };
      items = result.items;
      page = 0;
      selected.clear();
      rowState.clear();
      renderPage();
      logSections(items);
      logCategorias(result.categorias, result.raw);
      setStatus(
        result.aiError
          ? `⚠️ ${result.count} anúncios listados. IA: ${result.aiError}`
          : `✅ ${result.count} anúncios categorizados (console F12 + lista abaixo)`,
      );
    } finally {
      lockButtons(false);
    }
  })();
});

scrollBtn.addEventListener("click", () => {
  void (async () => {
    lockButtons(true);
    setStatus("⏳ Rolando a página...");
    try {
      const response = await send("autoScroll");
      setStatus(response.ok ? "✅ Scroll concluído" : `❌ ${response.error ?? "Erro."}`);
    } finally {
      lockButtons(false);
    }
  })();
});

selAllBtn.addEventListener("change", () => {
  for (const it of pageItems()) {
    if (!it.id) continue;
    if (selAllBtn.checked) selected.add(it.id);
    else selected.delete(it.id);
  }
  renderPage();
});

prevBtn.addEventListener("click", () => {
  page -= 1;
  renderPage();
});

nextBtn.addEventListener("click", () => {
  page += 1;
  renderPage();
});

analyzeSelBtn.addEventListener("click", () => {
  void (async () => {
    const targets = items
      .filter((it) => it.id && it.url && selected.has(it.id))
      .map((it) => ({ id: it.id as string, url: it.url as string }));
    if (targets.length === 0) return;

    lockButtons(true);
    analyzeSelBtn.disabled = true;
    setStatus(`⏳ Analisando ${targets.length} anúncio(s)... (não feche esta janela)`);
    try {
      const response = await send("analyzeSelected", { targets });
      if (!response.ok) {
        setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
        return;
      }
      const result = response.result as unknown as {
        analyzed: Array<Record<string, unknown> & { id: string; url?: string }>;
        errors: Array<{ id: string; error: string }>;
      };

      console.log("%c=== ANÁLISE DOS ANÚNCIOS (páginas) ===", "font-weight:bold");
      for (const rec of result.analyzed) {
        console.groupCollapsed(`anúncio ${rec.id} — ${String(rec.url ?? "")}`);
        console.log("detail:", rec.detail);
        console.log("categoria:", rec.categoria);
        console.groupEnd();
      }
      if (result.errors.length) console.warn("erros:", result.errors);

      await refreshDbFlags();
      rowState.clear();
      renderPage();
      const okN = result.analyzed.length;
      const errN = result.errors.length;
      setStatus(
        `✅ ${okN} salvo(s) no DB${errN ? ` · ${errN} com erro` : ""}. Use "Ver DB" para conferir.`,
      );
    } finally {
      lockButtons(false);
      syncSelectionUi();
    }
  })();
});

viewDbBtn.addEventListener("click", () => {
  void (async () => {
    if (!dbDumpEl.hidden) {
      dbDumpEl.hidden = true;
      return;
    }
    const response = await send("getDb");
    dbDumpEl.textContent = JSON.stringify(response.db ?? {}, null, 2);
    dbDumpEl.hidden = false;
  })();
});

clearDbBtn.addEventListener("click", () => {
  void (async () => {
    await send("clearDb");
    await refreshDbFlags();
    renderPage();
    if (!dbDumpEl.hidden) dbDumpEl.textContent = "{}";
    setStatus("🗑️ DB limpo.");
  })();
});

async function refreshDbFlags(): Promise<void> {
  const response = await send("getDb");
  const db = response.db ?? {};
  for (const it of items) {
    it.inDb = Boolean(it.id && it.id in db);
  }
}

/* ---------- progresso do analyzeSelected ---------- */

chrome.runtime.onMessage.addListener((msg: ProgressMessage) => {
  if (msg?.type === "scrollProgress") {
    console.log(`[OLX Workspace] ${msg.text}`);
    setStatus(msg.text);
    return;
  }
  if (msg?.type !== "progress") return;
  console.log(`[OLX Workspace] ${msg.text}`);
  setStatus(msg.text);
  if (msg.id && msg.state) {
    rowState.set(msg.id, msg.state);
    const row = listEl.querySelector<HTMLDivElement>(`.item[data-id="${CSS.escape(msg.id)}"]`);
    if (row) {
      const fresh = renderItem(items.find((i) => i.id === msg.id) ?? {});
      row.replaceWith(fresh);
    }
  }
});

export {};
