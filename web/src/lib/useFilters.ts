// Filtros da Listagem persistidos na querystring. Uma chave por filtro; vazio some da URL.

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { AdRow } from "@/types";

export interface Filters {
  q: string;
  marca: string;
  ano: string;
  precoMin: string;
  precoMax: string;
  kmMin: string;
  kmMax: string;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  marca: "",
  ano: "",
  precoMin: "",
  precoMax: "",
  kmMin: "",
  kmMax: "",
};

const KEYS = Object.keys(EMPTY_FILTERS) as (keyof Filters)[];

export function useFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<Filters>(() => {
    const f = { ...EMPTY_FILTERS };
    for (const k of KEYS) f[k] = params.get(k) ?? "";
    return f;
  }, [params]);

  const setFilter = useCallback(
    (key: keyof Filters, value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of KEYS) next.delete(k);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const active = KEYS.filter((k) => filters[k] !== "").length;

  return { filters, setFilter, reset, active };
}

export function applyFilters(rows: AdRow[], f: Filters): AdRow[] {
  const q = f.q.trim().toLowerCase();
  const precoMin = f.precoMin ? Number(f.precoMin) : null;
  const precoMax = f.precoMax ? Number(f.precoMax) : null;
  const kmMin = f.kmMin ? Number(f.kmMin) : null;
  const kmMax = f.kmMax ? Number(f.kmMax) : null;

  return rows.filter((r) => {
    if (f.marca && (r.marca ?? "").toLowerCase() !== f.marca.toLowerCase()) return false;
    if (f.ano && String(r.ano ?? "") !== f.ano) return false;
    if (precoMin != null && (r.price == null || r.price < precoMin)) return false;
    if (precoMax != null && (r.price == null || r.price > precoMax)) return false;
    if (kmMin != null && (r.km == null || r.km < kmMin)) return false;
    if (kmMax != null && (r.km == null || r.km > kmMax)) return false;
    if (q) {
      const hay = [
        r.marca,
        r.modelo,
        r.versao,
        r.location,
        r.record.detail?.title,
        String(r.ano ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
