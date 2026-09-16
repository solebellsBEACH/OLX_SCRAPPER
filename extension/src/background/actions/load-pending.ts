import { dbAll } from "../db";
import { recordToItem } from "../items";
import type { AnalyzeResult, Item } from "../types";

/**
 * Ação do botão "Carregar pendentes": lê o db.json e devolve os registros
 * RASOS (categorizados na listagem, mas que ainda não passaram pela página do
 * anúncio) como itens prontos pra lista do popup — dá pra selecionar e rodar
 * "Analisar selecionados" neles mesmo em uma sessão nova da extensão, sem
 * precisar estar na página de listagem onde foram vistos originalmente (usa
 * a `url` salva no registro pra navegar até o anúncio).
 */
export async function loadPending(): Promise<AnalyzeResult> {
  const db = await dbAll();
  const items: Item[] = Object.values(db)
    .filter((rec) => Boolean((rec as Record<string, unknown>).shallow))
    .map((rec) => recordToItem(rec));
  return { count: items.length, items, categorias: null, raw: null };
}
