import type { Categoria, Item } from "../types";

export function catLine(c: Categoria | null | undefined): string {
  if (!c) return "— (sem categorização)";
  const head = [c.marca, c.modelo, c.versao].filter(Boolean).join(" ");
  const rest = [
    c.ano ? String(c.ano) : null,
    [c.motor, c.combustivel].filter(Boolean).join(" ") || null,
    c.cambio,
    c.portas ? `${c.portas}p` : null,
    c.carroceria,
  ].filter(Boolean);
  return [head, ...rest].filter(Boolean).join(" · ") || "—";
}

export function metaLine(it: Item): string {
  return [
    it.kmText ?? (it.km != null ? `${it.km.toLocaleString("pt-BR")} km` : null),
    it.color,
    it.location,
    it.date,
  ]
    .filter(Boolean)
    .join(" · ");
}
