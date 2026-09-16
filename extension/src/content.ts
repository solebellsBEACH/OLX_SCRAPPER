/**
 * Content script do OLX Workspace.
 *
 * Injetado sob demanda pelo background via `chrome.scripting.executeScript`
 * ({ files: ["content.js"] }). Como a injeção pode se repetir na mesma aba,
 * o registro de listeners é protegido por um guard em `window`.
 *
 * Ações:
 *   - "extractSections": lê as <section class="olx-adcard"> da listagem.
 *   - "extractAdPage": lê a PÁGINA de um anúncio (título, preço, descrição,
 *     propriedades, imagens, JSON-LD, tamanho do HTML).
 *   - "autoScroll": rola a página suavemente até o fim em ~3s.
 *
 * NÃO usa console.* — todos os dados voltam para o service worker / popup,
 * que fazem o log no console da PRÓPRIA extensão.
 */

declare global {
  interface Window {
    __olxWorkspaceInjected?: boolean;
    __olxWorkspaceStyled?: boolean;
  }
}

type ContentAction =
  | "extractSections"
  | "extractAdPage"
  | "autoScroll"
  | "extractPagination"
  | "markCards"
  | "hideIndicators";

interface ContentMessage {
  action: ContentAction;
  /** só para "autoScroll": duração da rolagem em ms (padrão 3000). */
  duration?: number;
  /** só para "markCards": estado + score de cada anúncio visível na página. */
  marks?: MarkItem[];
}

/** Item da lista mandado pelo background após "Analisar página": borda + score. */
interface MarkItem {
  id: string;
  /** "done" = já analisado a fundo (borda verde + score); "pending" = ainda aguarda. */
  status: "done" | "pending";
  score?: number | null;
}

interface AdDetail {
  label: string;
  value: string;
}

interface AdCard {
  index: number;
  id: string | null;
  title: string | null;
  url: string | null;
  price: string | null;
  oldPrice: string | null;
  km: number | null;
  kmText: string | null;
  color: string | null;
  location: string | null;
  date: string | null;
  image: string | null;
  photos: number;
  details: AdDetail[];
}

interface AdPageData {
  url: string;
  id: string | null;
  title: string | null;
  price: string | null;
  description: string | null;
  location: string | null;
  publishedAt: string | null;
  properties: AdDetail[];
  images: string[];
  htmlLength: number;
  ldjson: unknown[];
}

interface ExtractResult {
  ok: true;
  count: number;
  cards: AdCard[];
}

interface PaginationResult {
  ok: true;
  /** maior número de página oferecido pela paginação do OLX (null se não achar). */
  lastPage: number | null;
}

interface AdPageResult {
  ok: true;
  data: AdPageData;
}

interface OkResult {
  ok: true;
}

function textOf(el: Element | null | undefined): string | null {
  const value = el?.textContent?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}

function parseSection(section: Element, index: number): AdCard {
  const link = section.querySelector<HTMLAnchorElement>(
    "a.olx-adcard__link, a[data-testid='adcard-link']",
  );
  const url = link?.href ?? null;
  const id = url ? (url.split("-").pop()?.split(/[?#]/)[0] ?? null) : null;
  // Marca a section com o id pra "markCards" achar o card na hora de pintar a borda.
  if (id) section.setAttribute("data-olxw-id", id);

  const details: AdDetail[] = Array.from(section.querySelectorAll(".olx-adcard__detail")).map(
    (node) => ({
      label: node.getAttribute("aria-label")?.replace(/\s+/g, " ").trim() ?? "",
      value: textOf(node) ?? "",
    }),
  );

  // Quilometragem: aria-label "103000 quilômetros rodados" / texto "103.000 km".
  const kmDetail = details.find((d) => /quil[oô]metro|(^|\s)km(\s|$)/i.test(`${d.label} ${d.value}`));
  const kmDigits = kmDetail?.value.replace(/\D+/g, "") ?? "";
  const km = kmDigits ? Number(kmDigits) : null;

  // Cor: aria-label começa com "Cor " (ex.: "Cor Prata") e o texto é a cor.
  const colorDetail = details.find((d) => /^cor\b/i.test(d.label));
  const color = colorDetail
    ? colorDetail.value || colorDetail.label.replace(/^cor\s+/i, "").trim()
    : null;

  return {
    index,
    id,
    title: textOf(section.querySelector(".olx-adcard__title")) ?? link?.title?.trim() ?? null,
    url,
    price: textOf(section.querySelector(".olx-adcard__price")),
    oldPrice: textOf(section.querySelector(".olx-adcard__old-price")),
    km,
    kmText: kmDetail?.value ?? null,
    color,
    location: textOf(section.querySelector(".olx-adcard__location")),
    date: textOf(section.querySelector(".olx-adcard__date")),
    image: section.querySelector<HTMLImageElement>("picture img")?.src ?? null,
    photos: section.querySelectorAll(".olx-adcard__carousel--bullet").length,
    details,
  };
}

function extractSections(): AdCard[] {
  const sections = Array.from(document.querySelectorAll("section.olx-adcard"));
  return sections.map(parseSection);
}

/**
 * Lê o widget de paginação do OLX e devolve o MAIOR número de página oferecido.
 * O nome da classe tem um hash gerado no build (`Pagination-...__wrapper`), então
 * casamos por prefixo. Fallback: qualquer <a> cujo href tenha `?o=N` na mesma
 * listagem. O link "Última página" costuma trazer o total real (ex.: `?o=23`).
 */
function extractPagination(): number | null {
  const wrapper =
    document.querySelector('[class*="Pagination"][class*="wrapper"]') ??
    document.querySelector('[class*="pagination" i]');
  const links = Array.from(
    (wrapper ?? document).querySelectorAll<HTMLAnchorElement>("a[href*='o=']"),
  );
  let last = 0;
  for (const a of links) {
    let o = 0;
    try {
      o = Number(new URL(a.href).searchParams.get("o") ?? "0");
    } catch {
      o = 0;
    }
    if (Number.isFinite(o) && o > last) last = o;
  }
  return last > 0 ? last : null;
}

/* ------------------------------------------------------------------ *
 *  Página do anúncio (detalhe)                                        *
 * ------------------------------------------------------------------ */

function parseLdJson(): unknown[] {
  const out: unknown[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      out.push(JSON.parse(s.textContent ?? ""));
    } catch {
      /* ignora bloco inválido */
    }
  });
  return out;
}

/** OLX embute o anúncio num <script id="initial-data" data-json="..."> ou similar. */
function parseInitialData(): unknown {
  const candidates = [
    document.getElementById("initial-data"),
    document.querySelector("script[data-json]"),
  ];
  for (const el of candidates) {
    const raw = el?.getAttribute("data-json");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        /* tenta próximo */
      }
    }
  }
  for (const s of Array.from(document.querySelectorAll("script:not([src])"))) {
    const m = s.textContent?.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*$/);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch {
        /* ignora */
      }
    }
  }
  return null;
}

/** Procura, dentro de um objeto grande, o nó do anúncio (tem "subject" + specs). */
function deepFindAd(root: unknown): Record<string, unknown> | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [root];
  let steps = 0;
  while (queue.length > 0 && steps < 8000) {
    steps += 1;
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const obj = cur as Record<string, unknown>;
    const hasSubject = typeof obj.subject === "string";
    if (hasSubject && (Array.isArray(obj.properties) || "body" in obj || "priceValue" in obj)) {
      return obj;
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}

function extractAdPage(): AdPageData {
  const initial = parseInitialData();
  const ad = (initial ? deepFindAd(initial) : null) as Record<string, any> | null;

  const properties: AdDetail[] = Array.isArray(ad?.properties)
    ? (ad!.properties as any[]).map((p) => ({
        label: String(p?.label ?? p?.name ?? ""),
        value: String(p?.value ?? p?.values ?? ""),
      }))
    : Array.from(document.querySelectorAll('[class*="sc-"] dt, [data-testid] dt')).map((dt) => ({
        label: textOf(dt) ?? "",
        value: textOf(dt.nextElementSibling) ?? "",
      }));

  const imagesFromAd: string[] = Array.isArray(ad?.images)
    ? (ad!.images as any[]).map((i) => i?.original ?? i?.originalAlternative ?? i?.url).filter(Boolean)
    : [];
  const images =
    imagesFromAd.length > 0
      ? imagesFromAd
      : Array.from(document.querySelectorAll<HTMLImageElement>("img"))
          .map((i) => i.src)
          .filter((s) => s.includes("img.olx.com.br"))
          .slice(0, 20);

  const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null;
  const loc = ad?.location as Record<string, any> | undefined;

  const data: AdPageData = {
    url: location.href,
    id: location.href.split(/[?#]/)[0].split("-").pop() ?? null,
    title: (ad?.subject as string | undefined) ?? textOf(document.querySelector("h1")),
    price:
      (ad?.priceValue as string | undefined) ??
      (typeof ad?.price === "number" ? `R$ ${ad.price}` : (ad?.price as string | undefined)) ??
      textOf(document.querySelector('[class*="price" i] h2, [class*="Price" i]')),
    description: (ad?.body as string | undefined) ?? metaDesc,
    location: loc
      ? [loc.municipality, loc.neighbourhood].filter(Boolean).join(" - ") || null
      : textOf(document.querySelector('[class*="location" i]')),
    publishedAt: (ad?.listTime as string | undefined) ?? (ad?.oldPrice ? null : null),
    properties,
    images,
    htmlLength: document.documentElement.outerHTML.length,
    ldjson: parseLdJson(),
  };

  return data;
}

function reportScroll(text: string): void {
  chrome.runtime.sendMessage({ type: "scrollProgress", text }).catch(() => {
    /* popup fechado */
  });
}

function scrollAutomatic(duration: number): Promise<number> {
  return new Promise<number>((resolve) => {
    const startY = window.scrollY;
    const maxY = (): number =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const start = performance.now();
    let lastBucket = -1;

    const step = (now: number): void => {
      const t = Math.min((now - start) / duration, 1);
      const target = maxY();
      window.scrollTo({ top: startY + (target - startY) * t, behavior: "auto" });

      const pct = Math.round(t * 100);
      const bucket = Math.floor(pct / 10);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        reportScroll(`Scroll: ${pct}% concluído`);
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        reportScroll("✅ Scroll concluído");
        resolve(Math.round(window.scrollY));
      }
    };

    requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------------------ *
 *  markCards — borda verde/amarela + score direto nos cards do OLX   *
 * ------------------------------------------------------------------ */

const MARK_STYLE_ID = "olxw-mark-style";

/** Injeta o CSS da marcação uma única vez por página. */
function ensureMarkStyle(): void {
  if (window.__olxWorkspaceStyled) return;
  window.__olxWorkspaceStyled = true;
  const style = document.createElement("style");
  style.id = MARK_STYLE_ID;
  style.textContent = `
    section.olx-adcard[data-olxw-status] { position: relative !important; }
    section.olx-adcard[data-olxw-status="done"] {
      outline: 3px solid #16a34a !important;
      outline-offset: -3px;
      border-radius: 8px;
    }
    section.olx-adcard[data-olxw-status="pending"] {
      outline: 3px solid #eab308 !important;
      outline-offset: -3px;
      border-radius: 8px;
    }
    .olxw-score-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      z-index: 20;
      min-width: 30px;
      padding: 3px 7px;
      border-radius: 999px;
      background: #16a34a;
      color: #fff;
      font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      pointer-events: none;
    }
    .olxw-score-badge[data-tier="low"] { background: #dc2626; }
    .olxw-score-badge[data-tier="mid"] { background: #d97706; }
  `;
  document.head.appendChild(style);
}

/** score >=80 verde, 50-79 laranja, <50 vermelho. */
function scoreTier(score: number): "low" | "mid" | "high" {
  if (score < 50) return "low";
  if (score < 80) return "mid";
  return "high";
}

/**
 * Enquanto true, `autoMarkVisibleCards()` não faz nada — é assim que "Ocultar
 * indicadores" impede que o auto-mark (rodando a cada mutação do DOM) pinte
 * tudo de novo 1s depois de ocultado. Volta a false em qualquer `markCards()`
 * (seja pelo auto-mark, pelo "Analisar página" ou pelo "Exibir indicadores").
 */
let indicatorsHidden = false;

function markCards(marks: MarkItem[]): void {
  indicatorsHidden = false;
  ensureMarkStyle();
  for (const mark of marks) {
    if (!mark.id) continue;
    const section = document.querySelector<HTMLElement>(`section.olx-adcard[data-olxw-id="${CSS.escape(mark.id)}"]`);
    if (!section) continue; // card não está (mais) visível nesta página

    section.setAttribute("data-olxw-status", mark.status);

    const existingBadge = section.querySelector<HTMLDivElement>(".olxw-score-badge");
    const hasScore = mark.status === "done" && typeof mark.score === "number" && Number.isFinite(mark.score);
    if (!hasScore) {
      existingBadge?.remove();
      continue;
    }
    const score = Math.round(mark.score as number);
    const badge = existingBadge ?? document.createElement("div");
    badge.className = "olxw-score-badge";
    const tier = scoreTier(score);
    if (tier === "high") badge.removeAttribute("data-tier");
    else badge.setAttribute("data-tier", tier);
    badge.textContent = `${score}`;
    badge.title = `Score de condição estimado pela IA: ${score}/100`;
    if (!existingBadge) section.appendChild(badge);
  }
}

/** Remove toda borda/score pintados e pausa o auto-mark até o próximo "Exibir". */
function hideIndicators(): void {
  indicatorsHidden = true;
  document.querySelectorAll<HTMLElement>("section.olx-adcard[data-olxw-status]").forEach((section) => {
    section.removeAttribute("data-olxw-status");
    section.querySelector(".olxw-score-badge")?.remove();
  });
}

if (!window.__olxWorkspaceInjected) {
  window.__olxWorkspaceInjected = true;

  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (
        response: ExtractResult | AdPageResult | OkResult | PaginationResult,
      ) => void,
    ): boolean => {
      if (message.action === "extractSections") {
        const cards = extractSections();
        sendResponse({ ok: true, count: cards.length, cards });
        return false;
      }

      if (message.action === "extractPagination") {
        sendResponse({ ok: true, lastPage: extractPagination() });
        return false;
      }

      if (message.action === "extractAdPage") {
        sendResponse({ ok: true, data: extractAdPage() });
        return false;
      }

      if (message.action === "autoScroll") {
        const ms = typeof message.duration === "number" && message.duration > 0 ? message.duration : 3000;
        void scrollAutomatic(ms).then(() => sendResponse({ ok: true }));
        return true; // resposta assíncrona
      }

      if (message.action === "markCards") {
        markCards(message.marks ?? []);
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "hideIndicators") {
        hideIndicators();
        sendResponse({ ok: true });
        return false;
      }

      return false;
    },
  );

  /* ------------------------------------------------------------------ *
   *  Auto-marcação ao abrir a página (sem esperar clique no popup)     *
   * ------------------------------------------------------------------ */

  /**
   * Varredura BARATA: só lê o id de cada `section.olx-adcard` (via o link, sem
   * parsear título/preço/km/cor/local/data/fotos como `extractSections()` faz)
   * e devolve os que ainda não têm `data-olxw-status`. É a que roda a cada
   * mutação do DOM — precisa ser leve, `extractSections()` completo aqui era o
   * motivo da aba travar em listagens grandes (centenas de cards após "Varrer
   * páginas"/scroll longo, revarridos por inteiro a cada ~1s pra sempre).
   */
  function collectPendingIds(): string[] {
    const pending: string[] = [];
    document.querySelectorAll<HTMLElement>("section.olx-adcard").forEach((section) => {
      let id = section.getAttribute("data-olxw-id");
      if (!id) {
        const link = section.querySelector<HTMLAnchorElement>(
          "a.olx-adcard__link, a[data-testid='adcard-link']",
        );
        id = link?.href ? (link.href.split("-").pop()?.split(/[?#]/)[0] ?? null) : null;
        if (id) section.setAttribute("data-olxw-id", id);
      }
      if (id && !section.hasAttribute("data-olxw-status")) pending.push(id);
    });
    return pending;
  }

  /**
   * Consulta o background (leitura rasa do db.json, sem IA) pra saber o
   * status dos cards ainda sem marcação e pinta borda verde/amarela + score.
   * Roda ao carregar a página e de novo (throttled) sempre que a listagem
   * ganha cards novos (scroll infinito, troca de filtro, etc.).
   */
  function autoMarkVisibleCards(): void {
    if (indicatorsHidden) return;
    const pendingIds = collectPendingIds();
    if (pendingIds.length === 0) return;
    chrome.runtime
      .sendMessage({ action: "checkKnown", ids: pendingIds })
      .then((resp: { ok?: boolean; marks?: MarkItem[] } | undefined) => {
        if (resp?.ok && Array.isArray(resp.marks)) markCards(resp.marks);
      })
      .catch(() => {
        /* background/proxy fora do ar — tenta de novo na próxima mutação do DOM */
      });
  }

  // Throttle (não debounce puro): garante que roda pelo menos 1x a cada 1.5s
  // mesmo com mutações contínuas na página (ads, animações), em vez de esperar
  // a página parar de vez pra sempre — o que em algumas páginas nunca acontece.
  const AUTO_MARK_INTERVAL_MS = 1500;
  let autoMarkTimer: ReturnType<typeof setTimeout> | undefined;
  let lastAutoMark = 0;
  function scheduleAutoMark(): void {
    if (autoMarkTimer) return; // já tem uma rodada agendada
    const wait = Math.max(0, AUTO_MARK_INTERVAL_MS - (Date.now() - lastAutoMark));
    autoMarkTimer = setTimeout(() => {
      autoMarkTimer = undefined;
      lastAutoMark = Date.now();
      autoMarkVisibleCards();
    }, wait);
  }

  /**
   * true se TODAS as mutações do lote foram causadas por nós mesmos (o badge
   * de score sendo inserido/atualizado por `markCards()`), pra não reagendar
   * uma varredura por causa da nossa própria marcação — sem isso, marcar um
   * card dispara o observer, que agenda nova varredura, que (mesmo achando 0
   * pendentes) já é chamada pra sempre em loop a cada mutação nossa.
   */
  function isOwnMutation(mutations: MutationRecord[]): boolean {
    return mutations.every((m) =>
      [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)].every(
        (n) => n instanceof HTMLElement && n.classList.contains("olxw-score-badge"),
      ),
    );
  }

  scheduleAutoMark();
  new MutationObserver((mutations) => {
    if (isOwnMutation(mutations)) return;
    scheduleAutoMark();
  }).observe(document.body, { childList: true, subtree: true });
}

export {};
