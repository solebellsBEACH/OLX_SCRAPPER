import { clearPageLoading, setPageLoading } from "../loading";
import { quickCategorize } from "../quick-score";
import { getActiveOlxTab, injectContent } from "../tabs";
import type { AnalyzeResult, Card, Item } from "../types";

/**
 * "Análise rápida": varre os cards da página e dá um score SÓ com os dados
 * que já estão no componente do card (título, km, detalhes) — sem chamar a
 * IA nem visitar a página do anúncio. Bem mais rápido que "Analisar página",
 * mas o score é só uma estimativa matemática de km/ano (ver `quick-score.ts`);
 * marca/modelo/versão continuam vazios porque isso exige IA de verdade.
 */
export async function quickAnalyze(): Promise<AnalyzeResult> {
  const tab = await getActiveOlxTab({ requireCarSearch: true });
  await injectContent(tab.id);
  await setPageLoading(tab.id, "Análise rápida (sem IA)...");

  try {
    const extracted = (await chrome.tabs.sendMessage(tab.id, { action: "extractSections" })) as
      | { ok: boolean; count: number; cards: Card[] }
      | undefined;
    const cards = extracted?.cards ?? [];

    const items: Item[] = cards.map((card) => ({
      ...card,
      categoria: quickCategorize(card),
      inDb: false,
      deepAnalyzed: false,
    }));

    const marks = items
      .filter((it): it is Item & { id: string } => typeof it.id === "string")
      .map((it) => ({
        id: it.id,
        status: "quick" as const,
        score: typeof it.categoria?.score === "number" ? it.categoria.score : null,
      }));
    await chrome.tabs.sendMessage(tab.id, { action: "markCards", marks }).catch(() => {
      /* aba sem o content script (navegou pra outro lugar) — ignora */
    });

    const suspicious = items.filter((it) => Boolean(it.categoria?.kmSuspeito)).length;

    return {
      count: items.length,
      items,
      categorias: null,
      raw: null,
      suspicious,
    };
  } finally {
    await clearPageLoading(tab.id);
  }
}
