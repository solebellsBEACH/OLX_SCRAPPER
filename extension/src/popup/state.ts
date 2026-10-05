import type { Item } from "./types";

export const PAGE_SIZE = 5;

/** Estado mutável compartilhado entre os módulos de render/ações do popup. */
export const state = {
  items: [] as Item[],
  page: 0,
  selected: new Set<string>(),
  rowState: new Map<string, "running" | "done" | "error">(),
  /** Estado do botão "Exibir/Ocultar indicadores". Começa ligado: a página já marca os cards sozinha. */
  indicatorsShown: true,
};

/** itens ainda sem os dados da página (não passaram pelo "Analisar selecionados"). */
export function pendingItems(): Item[] {
  return state.items.filter((it) => it.id && !it.deepAnalyzed);
}
