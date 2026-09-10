// Deriva as linhas achatadas (AdRow) e os agregados do dashboard a partir do Db.

import type { AdRow, Db, DbRecord } from "@/types";
import { parseKm, parsePrice } from "./format";

function prop(rec: DbRecord, label: string): string | null {
  const p = rec.detail?.properties?.find(
    (x) => x.label.toLowerCase() === label.toLowerCase(),
  );
  return p?.value ?? null;
}

function recordKm(rec: DbRecord): number | null {
  if (typeof rec.detail?.km === "number") return rec.detail.km;
  return parseKm(prop(rec, "Quilometragem"));
}

function recordAno(rec: DbRecord): number | null {
  const fromAi = rec.categoria?.ano;
  if (typeof fromAi === "number") return fromAi;
  const raw = prop(rec, "Ano");
  const n = raw ? Number(raw.replace(/[^\d]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

function recordDate(rec: DbRecord): number | null {
  if (rec.savedAt) {
    const t = Date.parse(rec.savedAt);
    if (Number.isFinite(t)) return t;
  }
  if (typeof rec.analyzedAt === "number") return rec.analyzedAt;
  if (rec.detail?.publishedAt) {
    const t = Date.parse(rec.detail.publishedAt);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function groupKey(marca: string | null, modelo: string | null, ano: number | null): string {
  return `${(marca ?? "?").toLowerCase()}|${(modelo ?? "?").toLowerCase()}|${ano ?? "?"}`;
}

export function toRows(db: Db): AdRow[] {
  const records = Object.values(db);

  // média de preço por marca+modelo+ano (só grupos com 2+ preços válidos)
  const groups = new Map<string, number[]>();
  for (const rec of records) {
    const price = parsePrice(rec.detail?.price);
    if (price == null) continue;
    const key = groupKey(rec.categoria?.marca ?? null, rec.categoria?.modelo ?? null, recordAno(rec));
    const arr = groups.get(key) ?? [];
    arr.push(price);
    groups.set(key, arr);
  }
  const groupAvg = new Map<string, number>();
  for (const [key, arr] of groups) {
    if (arr.length >= 2) groupAvg.set(key, arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  return records
    .map((rec): AdRow => {
      const marca = rec.categoria?.marca ?? prop(rec, "Marca");
      const modelo = rec.categoria?.modelo ?? null;
      const versao = rec.categoria?.versao ?? null;
      const ano = recordAno(rec);
      const km = recordKm(rec);
      const price = parsePrice(rec.detail?.price);
      const priceOld = parsePrice(rec.detail?.priceOld ?? rec.detail?.oldPrice ?? null);
      const avg = groupAvg.get(groupKey(marca, modelo, ano));
      return {
        id: rec.id,
        url: rec.url ?? rec.detail?.url,
        record: rec,
        marca,
        modelo,
        versao,
        modeloVersao: [modelo, versao].filter(Boolean).join(" ") || (rec.detail?.title ?? "—"),
        ano,
        km,
        price,
        priceOld,
        pricePerKm: price != null && km ? price / km : null,
        location: rec.detail?.location ?? null,
        date: recordDate(rec),
        thumb: rec.detail?.images?.[0] ?? null,
        opportunity: price != null && avg != null && price < avg,
      };
    })
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

export interface DashboardStats {
  total: number;
  withPrice: number;
  avgPrice: number | null;
  medianPrice: number | null;
  priceDrops: number;
  opportunities: number;
  byMarca: Array<{ label: string; count: number }>;
  byAno: Array<{ label: string; count: number }>;
}

export function computeStats(rows: AdRow[]): DashboardStats {
  const prices = rows.map((r) => r.price).filter((p): p is number => p != null);
  const sorted = [...prices].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const tally = (get: (r: AdRow) => string | number | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = get(r);
      const key = v == null || v === "" ? "—" : String(v);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  return {
    total: rows.length,
    withPrice: prices.length,
    avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
    medianPrice: median,
    priceDrops: rows.filter((r) => r.priceOld != null && r.price != null && r.priceOld > r.price)
      .length,
    opportunities: rows.filter((r) => r.opportunity).length,
    byMarca: tally((r) => r.marca),
    byAno: tally((r) => r.ano),
  };
}
