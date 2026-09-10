// Formatação e parsing. Tudo que é número na UI passa por aqui.

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("pt-BR");
const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return BRL.format(v);
}

export function formatNumber(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return NUM.format(v);
}

export function formatKm(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${NUM.format(v)} km`;
}

export function formatPricePerKm(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function formatDate(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  return DATE.format(new Date(ms));
}

/** "R$ 33.000" | "R$ 1.234,56" -> 33000 | 1234.56 */
export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;
  // pt-BR: ponto = milhar, vírgula = decimal
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** "121.000 km" | "121000" -> 121000 */
export function parseKm(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}
