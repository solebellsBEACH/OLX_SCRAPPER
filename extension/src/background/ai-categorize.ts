import { PROXY_URL } from "./constants";
import { progress } from "./progress";
import type { Card, Categoria } from "./types";

export async function categorize(
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
