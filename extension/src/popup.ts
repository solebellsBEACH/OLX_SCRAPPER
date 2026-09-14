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
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  ano?: number | null;
  motor?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  portas?: number | null;
  carroceria?: string | null;
  /** 0-100: condição estimada do carro pela IA (só em itens já analisados a fundo). */
  score?: number | null;
  scoreMotivo?: string | null;
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
  deepAnalyzed?: boolean;
}

interface AnalyzeResult {
  count: number;
  items: Item[];
  categorias?: unknown[] | null;
  raw?: string | null;
  aiError?: string;
  /** anúncios descartados por não serem carro (moto, caminhão, náutica, ...). */
  nonCar?: number;
  /** só no "Varrer páginas": quantas páginas foram lidas. */
  pages?: number;
  /** total de páginas que a paginação do OLX oferece (limite da varredura). */
  lastPage?: number | null;
  newCount?: number;
  skipped?: number;
  duplicates?: number;
  savedToDb?: number;
  saveError?: string;
  perPage?: Array<{
    page: number;
    novos: number;
    noDb: number;
    repetidos: number;
    total: number;
  }>;
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
const showIndicatorsBtn = $<HTMLButtonElement>("showIndicatorsBtn");
const crawlBtn = $<HTMLButtonElement>("crawlBtn");
const maxPagesEl = $<HTMLInputElement>("maxPages");
const scrollEachEl = $<HTMLInputElement>("scrollEach");
const skipKnownEl = $<HTMLInputElement>("skipKnown");
const saveToDbEl = $<HTMLInputElement>("saveToDb");
const prevBtn = $<HTMLButtonElement>("prevBtn");
const nextBtn = $<HTMLButtonElement>("nextBtn");
const selAllBtn = $<HTMLInputElement>("selAllBtn");
const selectAllBtn = $<HTMLButtonElement>("selectAllBtn");
const clearSelBtn = $<HTMLButtonElement>("clearSelBtn");
const analyzeSelBtn = $<HTMLButtonElement>("analyzeSelBtn");
const viewDbBtn = $<HTMLButtonElement>("viewDbBtn");
const clearDbBtn = $<HTMLButtonElement>("clearDbBtn");
const tabCrawlBtn = $<HTMLButtonElement>("tabCrawlBtn");
const tabAnalyzeBtn = $<HTMLButtonElement>("tabAnalyzeBtn");
const panelCrawl = $<HTMLElement>("panelCrawl");
const panelAnalyze = $<HTMLElement>("panelAnalyze");

if (new URLSearchParams(location.search).has("tab")) {
  document.body.classList.add("as-tab");
}

/* ---------- páginas do popup: "Varrer páginas" / "Analisar página" ---------- */

function showTab(tab: "crawl" | "analyze"): void {
  const isCrawl = tab === "crawl";
  panelCrawl.hidden = !isCrawl;
  panelAnalyze.hidden = isCrawl;
  tabCrawlBtn.setAttribute("aria-selected", String(isCrawl));
  tabAnalyzeBtn.setAttribute("aria-selected", String(!isCrawl));
}

tabCrawlBtn.addEventListener("click", () => showTab("crawl"));
tabAnalyzeBtn.addEventListener("click", () => showTab("analyze"));

let items: Item[] = [];
let page = 0;
const selected = new Set<string>();
const rowState = new Map<string, "running" | "done" | "error">();

function setStatus(text: string): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("has-error", /^[❌⚠]/u.test(text));
}

async function send(action: string, extra: Record<string, unknown> = {}): Promise<DispatchResponse> {
  try {
    const response = (await chrome.runtime.sendMessage({ action, ...extra })) as
      | DispatchResponse
      | undefined;
    return response ?? { ok: false, error: "A extensão não respondeu. Recarregue a extensão e tente novamente." };
  } catch {
    return { ok: false, error: "A comunicação com a extensão foi interrompida. Recarregue a extensão e tente novamente." };
  }
}

function lockButtons(lock: boolean): void {
  statusEl.classList.toggle("is-loading", lock);
  analyzeBtn.textContent = lock ? "Processando..." : "Analisar página";
  analyzeBtn.disabled = lock;
  scrollBtn.disabled = lock;
  showIndicatorsBtn.disabled = lock;
  crawlBtn.disabled = lock;
  selectAllBtn.disabled = lock || items.length === 0;
  clearSelBtn.disabled = lock || selected.size === 0;
  analyzeSelBtn.disabled = lock || selected.size === 0;
}

/** itens ainda sem os dados da página (não passaram pelo "Analisar selecionados"). */
function pendingItems(): Item[] {
  return items.filter((it) => it.id && !it.deepAnalyzed);
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
  row.classList.add(it.deepAnalyzed ? "done" : "pending");

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
  const score = it.categoria?.score;
  if (state === "running") body.appendChild(badge("run", "⏳ analisando…"));
  else if (state === "error") body.appendChild(badge("err", "✖ falhou"));
  else if (state === "done" || it.deepAnalyzed) {
    body.appendChild(badge("db", "✔ analisado"));
    if (typeof score === "number") body.appendChild(scoreBadge(score));
  } else if (it.inDb) body.appendChild(badge("db", "🗃️ no DB (raso)"));

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

/** Badge do score de condição (0-100): mesmo esquema de cor usado nos cards do OLX. */
function scoreBadge(score: number): HTMLSpanElement {
  const b = document.createElement("span");
  b.className = "badge score";
  if (score < 50) b.dataset.tier = "low";
  else if (score < 80) b.dataset.tier = "mid";
  b.textContent = `Score ${Math.round(score)}`;
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
  const pend = pendingItems().length;
  selectAllBtn.textContent = `selecionar todas (${pend})`;
  selectAllBtn.disabled = analyzeBtn.disabled || pend === 0;
  clearSelBtn.disabled = analyzeBtn.disabled || selected.size === 0;
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
      // "Analisar página" já pinta os cards no OLX (background chama markCardsOnPage) —
      // sincroniza o rótulo do botão pra refletir isso.
      indicatorsShown = true;
      setIndicatorsButtonLabel();
      const naoCarro = result.nonCar ? ` · ${result.nonCar} não-carro(s) ocultado(s)` : "";
      setStatus(
        result.aiError
          ? `⚠️ ${result.count} carro(s) listado(s)${naoCarro}. IA: ${result.aiError}`
          : `✅ ${result.count} carro(s) categorizado(s)${naoCarro} (console F12 + lista abaixo)`,
      );
    } finally {
      lockButtons(false);
    }
  })();
});

crawlBtn.addEventListener("click", () => {
  void (async () => {
    const maxPages = Math.max(1, Math.min(Number(maxPagesEl.value) || 5, 50));
    const scrollEach = scrollEachEl.checked;
    const skipKnown = skipKnownEl.checked;
    const saveToDb = saveToDbEl.checked;
    lockButtons(true);
    setStatus(`⏳ Varrendo até ${maxPages} página(s)... (não feche esta janela)`);
    try {
      const response = await send("crawlListing", { maxPages, scrollEach, skipKnown, saveToDb });
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
      if (result.perPage?.length) console.table(result.perPage);
      await refreshDbFlags();
      renderPage();
      const pgs = result.pages ?? 0;
      const extra = [
        result.lastPage ? `paginação: ${result.lastPage} página(s)` : "",
        result.savedToDb ? `${result.savedToDb} salvos no DB` : "",
        result.saveError ? `NÃO salvo no DB: ${result.saveError}` : "",
        result.nonCar ? `${result.nonCar} não-carro(s) ignorado(s)` : "",
        result.skipped ? `${result.skipped} já no DB (pulados)` : "",
        result.duplicates ? `${result.duplicates} repetidos na paginação` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const suffix = extra ? ` — ${extra}` : "";
      if (result.count === 0) {
        setStatus(
          `ℹ️ Nenhum anúncio novo em ${pgs} página(s)${suffix}.`,
        );
      } else {
        setStatus(
          result.aiError
            ? `⚠️ ${result.count} novo(s) em ${pgs} página(s)${suffix}. IA: ${result.aiError}`
            : `✅ ${result.count} novo(s) de ${pgs} página(s) categorizados${suffix} (console F12 + lista abaixo)`,
        );
      }
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

/** Estado do botão "Exibir/Ocultar indicadores" — só liga quando o usuário clica em exibir. */
let indicatorsShown = false;

function setIndicatorsButtonLabel(): void {
  showIndicatorsBtn.innerHTML = indicatorsShown
    ? '<span class="btn-ico">🚫</span> Ocultar indicadores'
    : '<span class="btn-ico">🟢</span> Exibir indicadores';
}

async function showIndicatorsClick(): Promise<void> {
  lockButtons(true);
  setStatus("⏳ Verificando indicadores já salvos no DB...");
  try {
    const response = await send("showIndicators");
    if (!response.ok) {
      setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
      return;
    }
    const r = response.result as unknown as { count: number; done: number; pending: number };
    indicatorsShown = true;
    setIndicatorsButtonLabel();
    setStatus(
      r.count === 0
        ? "ℹ️ Nenhum card encontrado nesta página."
        : `✅ ${r.count} card(s) na tela — ${r.done} já analisado(s) (verde) · ${r.pending} pendente(s) (amarelo).`,
    );
  } finally {
    lockButtons(false);
  }
}

async function hideIndicatorsClick(): Promise<void> {
  lockButtons(true);
  setStatus("⏳ Ocultando indicadores...");
  try {
    const response = await send("hideIndicators");
    indicatorsShown = false;
    setIndicatorsButtonLabel();
    setStatus(response.ok ? "✅ Indicadores ocultados." : `❌ ${response.error ?? "Erro."}`);
  } finally {
    lockButtons(false);
  }
}

showIndicatorsBtn.addEventListener("click", () => {
  void (indicatorsShown ? hideIndicatorsClick() : showIndicatorsClick());
});

selAllBtn.addEventListener("change", () => {
  for (const it of pageItems()) {
    if (!it.id) continue;
    if (selAllBtn.checked) selected.add(it.id);
    else selected.delete(it.id);
  }
  renderPage();
});

// Seleciona TODOS os itens da varredura (todas as páginas da lista), pulando os
// que já passaram pelo "Analisar selecionados" — assim não se refaz o que já foi feito.
selectAllBtn.addEventListener("click", () => {
  const pend = pendingItems();
  for (const it of pend) if (it.id) selected.add(it.id);
  const done = items.length - pend.length;
  setStatus(
    `Selecionados ${pend.length} anúncio(s)` +
      (done ? ` · ${done} já analisado(s), fora da seleção` : ""),
  );
  renderPage();
});

clearSelBtn.addEventListener("click", () => {
  selected.clear();
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
        skipped?: string[];
        nonCar?: string[];
      };

      console.log("%c=== ANÁLISE DOS ANÚNCIOS (páginas) ===", "font-weight:bold");
      for (const rec of result.analyzed) {
        console.groupCollapsed(`anúncio ${rec.id} — ${String(rec.url ?? "")}`);
        console.log("detail:", rec.detail);
        console.log("categoria:", rec.categoria);
        console.groupEnd();
      }
      if (result.errors.length) console.warn("erros:", result.errors);

      // tira da seleção o que já foi analisado com sucesso (não refazer)
      for (const rec of result.analyzed) selected.delete(rec.id);
      for (const id of result.skipped ?? []) selected.delete(id);
      for (const id of result.nonCar ?? []) selected.delete(id);

      await refreshDbFlags();
      rowState.clear();
      renderPage();
      const okN = result.analyzed.length;
      const errN = result.errors.length;
      const skN = result.skipped?.length ?? 0;
      const ncN = result.nonCar?.length ?? 0;
      setStatus(
        `✅ ${okN} salvo(s) no DB` +
          (skN ? ` · ${skN} já analisado(s) (pulados)` : "") +
          (ncN ? ` · ${ncN} não-carro(s) ignorado(s)` : "") +
          (errN ? ` · ${errN} com erro` : "") +
          `. Use "Ver DB" para conferir.`,
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
  const db = (response.db ?? {}) as Record<string, { shallow?: boolean }>;
  for (const it of items) {
    const rec = it.id ? db[it.id] : undefined;
    it.inDb = Boolean(rec);
    it.deepAnalyzed = Boolean(rec && !rec.shallow);
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
