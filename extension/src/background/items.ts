import type { Card, Categoria, DbRecord, Item } from "./types";

/** Score (0-100) de condição do carro, se a categoria já tiver um. */
export function scoreOf(cat: unknown): number | null {
  const v = cat && typeof cat === "object" ? (cat as Record<string, unknown>).score : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Um registro foi analisado a fundo (visitou a página do anúncio) quando `shallow` é
 * false — MAS o merge do proxy é raso (spread por cima do registro existente) e, antes
 * desta checagem existir, `analyzeSelected` não reenviava `shallow: false` ao concluir,
 * então o flag ficava preso em `true` pra sempre mesmo após a análise completa. Como
 * fallback (e pra registros antigos já afetados, sem precisar de migração manual), usa
 * `detail.description`: `itemToRecord` sempre grava `null` ali pra registros rasos, e
 * quem visita a página de verdade quase sempre tem descrição (ld+json ou meta), então é
 * um sinal confiável de análise completa mesmo quando o flag mentiu.
 */
export function isDeepAnalyzed(rec: unknown): boolean {
  if (!rec || typeof rec !== "object") return false;
  const r = rec as Record<string, unknown>;
  if (!r.shallow) return true;
  const detail = r.detail as Record<string, unknown> | undefined;
  return typeof detail?.description === "string" && detail.description.length > 0;
}

export function mergeItems(cards: Card[], categorias: unknown[] | null, db: Record<string, DbRecord>): Item[] {
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
    const deepAnalyzed = isDeepAnalyzed(rec);
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
export function itemToRecord(item: Item): DbRecord | null {
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

/** Converte um registro do db.json (raso ou completo) pro shape `Item` da lista do popup. */
export function recordToItem(rec: DbRecord): Item {
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
    deepAnalyzed: isDeepAnalyzed(rec),
  };
}

/** Formato "section" (título/preço/descrição/detalhes) a partir do `detail` salvo no DB. */
export function detailToSection(id: string, data: Record<string, unknown> | null): Record<string, unknown> {
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
