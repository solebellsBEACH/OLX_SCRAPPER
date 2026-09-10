import type { AdRow, Db } from "@/types";

function download(name: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const COLS: Array<[string, (r: AdRow) => string | number | null]> = [
  ["id", (r) => r.id],
  ["marca", (r) => r.marca],
  ["modelo", (r) => r.modelo],
  ["versao", (r) => r.versao],
  ["ano", (r) => r.ano],
  ["km", (r) => r.km],
  ["preco", (r) => r.price],
  ["preco_antigo", (r) => r.priceOld],
  ["rs_por_km", (r) => (r.pricePerKm != null ? Number(r.pricePerKm.toFixed(2)) : null)],
  ["local", (r) => r.location],
  ["data", (r) => (r.date ? new Date(r.date).toISOString() : null)],
  ["url", (r) => r.url],
];

function csvCell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportRowsCsv(rows: AdRow[], name = "olx-db.csv") {
  const head = COLS.map(([h]) => h).join(";");
  const body = rows.map((r) => COLS.map(([, get]) => csvCell(get(r))).join(";")).join("\n");
  download(name, "text/csv;charset=utf-8", `${head}\n${body}\n`);
}

export function exportRowsJson(rows: AdRow[], name = "olx-db.json") {
  download(name, "application/json", JSON.stringify(rows.map((r) => r.record), null, 2));
}

export function exportDbJson(db: Db, name = "db.json") {
  download(name, "application/json", JSON.stringify(db, null, 2));
}
