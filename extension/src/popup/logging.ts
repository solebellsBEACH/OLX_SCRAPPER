import type { Item } from "./types";

/** Log no console DESTA janela (a da extensão), nunca no console do OLX. */
export function logSections(items: Item[]): void {
  console.log("%c=== DADOS DAS SECTIONS ===", "font-weight:bold");
  console.log(`Total de anúncios: ${items.length}`);
  console.table(
    items.map((c) => ({
      título: c.title,
      preço: c.price,
      "preço antigo": c.oldPrice,
      km: c.km,
      cor: c.color,
      local: c.location,
      data: c.date,
    })),
  );
  console.log(items);
}

export function logCategorias(categorias: unknown[] | null | undefined, raw: string | null | undefined): void {
  console.log("%c=== CATEGORIZAÇÃO IA (marca / modelo / ano / motor ...) ===", "font-weight:bold");
  if (Array.isArray(categorias)) {
    console.table(categorias);
    console.log(categorias);
  } else {
    console.warn("IA não retornou JSON válido. Resposta bruta:");
    console.log(raw ?? "(vazio)");
  }
}
