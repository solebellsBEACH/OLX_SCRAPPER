import { categorizeInChunks } from "../ai-categorize";
import { dbAll, dbUpsertMany } from "../db";
import { markCardsOnPage } from "../indicators";
import { itemToRecord, mergeItems } from "../items";
import { progress } from "../progress";
import { ensureProxy } from "../proxy";
import { backfillScores } from "../scores";
import { getActiveOlxTab, injectContent } from "../tabs";
import type { AnalyzeResult, Card, DbRecord } from "../types";
import { isCarro } from "../vehicle-filter";

export async function analyze(): Promise<AnalyzeResult> {
  await ensureProxy();
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);

  const extracted = (await chrome.tabs.sendMessage(tab.id, { action: "extractSections" })) as
    | { ok: boolean; count: number; cards: Card[] }
    | undefined;
  const cards = extracted?.cards ?? [];
  const db = await dbAll();

  const { categorias, error } = await categorizeInChunks(cards);
  const raw = null;

  const merged = mergeItems(cards, categorias, db);
  const items = merged.filter((it) => isCarro(it.categoria));
  const nonCar = merged.length - items.length;

  await backfillScores(items, db);
  await markCardsOnPage(tab.id, items);

  // Grava um rascunho raso de cada carro NOVO no db.json — sem isso, o que o
  // "Analisar página" categoriza só existe na memória da janela da extensão e
  // some ao fechá-la, sem chance de rodar o "Analisar selecionados" depois.
  // Nunca sobrescreve quem já está no DB (raso ou completo).
  let savedToDb = 0;
  const newRecords = items
    .filter((it) => typeof it.id === "string" && !(it.id in db))
    .map(itemToRecord)
    .filter((r): r is DbRecord => r !== null);
  if (newRecords.length > 0) {
    try {
      savedToDb = await dbUpsertMany(newRecords);
      for (const r of newRecords) db[r.id] = r;
    } catch (err) {
      progress(`⚠️ Não deu pra salvar rascunho no db.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    count: items.length,
    items,
    categorias,
    raw,
    nonCar,
    savedToDb,
    aiError: error ?? (categorias ? undefined : "IA não retornou JSON válido (veja 'raw')."),
  };
}
