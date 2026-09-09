/**
 * UI do OLX Workspace (roda em janela/aba separada, popup.html?tab=1).
 * Depois de "Executar Análise", mostra a listagem dos anúncios categorizados
 * pela IA, paginada de 5 em 5.
 */

type Action = "analyze" | "autoScroll";
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
}

interface AnalyzeResult {
  count: number;
  items: Item[];
  aiError?: string;
}

interface DispatchResponse {
  ok: boolean;
  result?: AnalyzeResult;
  error?: string;
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
const analyzeBtn = $<HTMLButtonElement>("analyzeBtn");
const scrollBtn = $<HTMLButtonElement>("scrollBtn");
const prevBtn = $<HTMLButtonElement>("prevBtn");
const nextBtn = $<HTMLButtonElement>("nextBtn");

if (new URLSearchParams(location.search).has("tab")) {
  document.body.classList.add("as-tab");
}

let items: Item[] = [];
let page = 0;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function sendAction(action: Action): Promise<DispatchResponse> {
  const response = (await chrome.runtime.sendMessage({ action })) as DispatchResponse | undefined;
  return response ?? { ok: false, error: "Sem resposta do service worker." };
}

async function withButtonsDisabled(fn: () => Promise<void>): Promise<void> {
  analyzeBtn.disabled = true;
  scrollBtn.disabled = true;
  try {
    await fn();
  } finally {
    analyzeBtn.disabled = false;
    scrollBtn.disabled = false;
  }
}

function catLine(c: Categoria | null | undefined): string {
  if (!c) return "—";
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
  const row = document.createElement("div");
  row.className = "item";

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

  if (it.url) {
    const link = document.createElement("a");
    link.href = it.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Ver no OLX ↗";
    body.appendChild(link);
  }

  row.appendChild(body);
  return row;
}

function renderPage(): void {
  listEl.replaceChildren();

  if (items.length === 0) {
    pagerEl.hidden = true;
    return;
  }

  const pages = Math.ceil(items.length / PAGE_SIZE);
  page = Math.min(Math.max(page, 0), pages - 1);

  const start = page * PAGE_SIZE;
  for (const it of items.slice(start, start + PAGE_SIZE)) {
    listEl.appendChild(renderItem(it));
  }

  pagerEl.hidden = pages <= 1;
  pageInfoEl.textContent = `Página ${page + 1} de ${pages} · ${items.length} anúncios`;
  prevBtn.disabled = page === 0;
  nextBtn.disabled = page >= pages - 1;
}

prevBtn.addEventListener("click", () => {
  page -= 1;
  renderPage();
});

nextBtn.addEventListener("click", () => {
  page += 1;
  renderPage();
});

analyzeBtn.addEventListener("click", () => {
  void withButtonsDisabled(async () => {
    setStatus("⏳ Lendo sections + DeepSeek...");
    const response = await sendAction("analyze");
    if (!response.ok) {
      setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
      return;
    }
    const result = response.result ?? { count: 0, items: [] };
    items = result.items;
    page = 0;
    renderPage();
    setStatus(
      result.aiError
        ? `⚠️ ${result.count} anúncios listados. IA: ${result.aiError}`
        : `✅ ${result.count} anúncios categorizados (console F12 + lista abaixo)`,
    );
  });
});

scrollBtn.addEventListener("click", () => {
  void withButtonsDisabled(async () => {
    setStatus("⏳ Rolando a página...");
    const response = await sendAction("autoScroll");
    setStatus(response.ok ? "✅ Scroll concluído" : `❌ ${response.error ?? "Erro desconhecido."}`);
  });
});

export {};
