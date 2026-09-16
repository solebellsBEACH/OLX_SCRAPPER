import { dbAll } from "./db";
import { scoreOf } from "./items";
import { getActiveOlxTab, injectContent } from "./tabs";
import type { Card, Item, ShowIndicatorsResult } from "./types";

/**
 * Consulta rasa (sem IA) do db.json pra um lote de ids — usada pelo content
 * script assim que a página do OLX abre, pra já pintar borda+score nos cards
 * que já foram analisados antes, sem esperar o clique em "Analisar página".
 * Nunca lança: se o proxy estiver fora do ar, devolve lista vazia (o content
 * script simplesmente não marca nada e tenta de novo na próxima checagem).
 */
export async function checkKnown(ids: string[]): Promise<Array<{ id: string; status: "done" | "pending"; score: number | null }>> {
  if (ids.length === 0) return [];
  const db = await dbAll();
  return ids.map((id) => {
    const rec = db[id];
    const deepAnalyzed = Boolean(rec && !(rec as Record<string, unknown>).shallow);
    return {
      id,
      status: deepAnalyzed ? "done" : "pending",
      score: deepAnalyzed ? scoreOf((rec as Record<string, unknown>).categoria) : null,
    };
  });
}

/**
 * Ação do botão "Exibir indicadores": força a marcação (borda verde/amarela +
 * score) na aba do OLX aberta AGORA, sem esperar a injeção automática do
 * content script — útil quando a extensão foi recarregada (ou a aba já
 * estava aberta antes de instalar/atualizar) e o `content_scripts` do
 * manifest não rodou nela. Não chama IA: só lê o db.json (via `checkKnown`).
 */
export async function showIndicators(): Promise<ShowIndicatorsResult> {
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);

  const extracted = (await chrome.tabs.sendMessage(tab.id, { action: "extractSections" })) as
    | { ok: boolean; count: number; cards: Card[] }
    | undefined;
  const cards = extracted?.cards ?? [];
  const ids = cards
    .map((c) => (typeof c.id === "string" ? c.id : null))
    .filter((id): id is string => Boolean(id));

  const marks = await checkKnown(ids);
  await chrome.tabs.sendMessage(tab.id, { action: "markCards", marks }).catch(() => {
    /* content script ainda não respondeu — tenta de novo no próximo clique */
  });

  return {
    count: marks.length,
    done: marks.filter((m) => m.status === "done").length,
    pending: marks.filter((m) => m.status === "pending").length,
  };
}

/** Ação do botão "Ocultar indicadores": limpa borda/score da aba do OLX aberta agora. */
export async function hideIndicators(): Promise<void> {
  const tab = await getActiveOlxTab();
  await chrome.tabs.sendMessage(tab.id, { action: "hideIndicators" }).catch(() => {
    /* sem content script na aba — nada pra ocultar */
  });
}

/**
 * Manda o content script pintar, DIRETO na página do OLX, a borda de cada
 * card visível: verde (já analisado a fundo, com o score) ou amarela (ainda
 * aguarda o "Analisar selecionados"). Best-effort — se a aba já mudou de
 * página, simplesmente não encontra os cards e não faz nada.
 */
export async function markCardsOnPage(tabId: number, items: Item[]): Promise<void> {
  const marks = items
    .filter((it): it is Item & { id: string } => typeof it.id === "string")
    .map((it) => ({
      id: it.id,
      status: it.deepAnalyzed ? "done" : "pending",
      score: scoreOf(it.categoria),
    }));
  if (marks.length === 0) return;
  await chrome.tabs.sendMessage(tabId, { action: "markCards", marks }).catch(() => {
    /* aba sem o content script (navegou pra outro lugar) — ignora */
  });
}
