import { textOf } from "./dom-utils";
import type { AdDetail, AdPageData } from "./types";

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

export function extractAdPage(): AdPageData {
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
