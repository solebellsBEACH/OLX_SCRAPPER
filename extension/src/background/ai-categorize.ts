import { analyzeSections } from "./ai-client";
import { progress } from "./progress";
import type { Card, Categoria } from "./types";

export async function categorize(
  sections: unknown[],
  label?: string,
): Promise<{ categorias: unknown[] | null; raw: string | null; error?: string }> {
  progress(`${label ?? `Analisando ${sections.length} anúncio(s)`} · aguardando IA (alguns minutos por lote)...`);
  try {
    const { categorias, raw } = await analyzeSections(sections as Parameters<typeof analyzeSections>[0]);
    return { categorias, raw };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { categorias: null, raw: null, error: msg };
  }
}

/**
 * Categoriza em lotes para não estourar o prompt / o JSON de resposta quando a
 * varredura junta muitas páginas. Cada card já leva `index` global; a IA é
 * pedida para manter esse index, então basta concatenar os retornos.
 */
export async function categorizeInChunks(
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
