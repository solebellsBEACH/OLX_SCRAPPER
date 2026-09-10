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
  }
}

type ContentAction = "extractSections" | "extractAdPage" | "autoScroll";

interface ContentMessage {
  action: ContentAction;
  /** só para "autoScroll": duração da rolagem em ms (padrão 3000). */
  duration?: number;
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

if (!window.__olxWorkspaceInjected) {
  window.__olxWorkspaceInjected = true;

  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: ExtractResult | AdPageResult | OkResult) => void,
    ): boolean => {
      if (message.action === "extractSections") {
        const cards = extractSections();
        sendResponse({ ok: true, count: cards.length, cards });
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

      return false;
    },
  );
}

export {};
