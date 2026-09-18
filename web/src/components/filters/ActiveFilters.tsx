import { X } from "lucide-react";
import type { Filters } from "@/lib/useFilters";
import { formatBRL, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";

const LABEL: Record<keyof Filters, (v: string) => string> = {
  q: (v) => `Busca: ${v}`,
  marca: (v) => `Marca: ${v}`,
  ano: (v) => `Ano: ${v}`,
  precoMin: (v) => `Preço mín.: ${formatBRL(Number(v))}`,
  precoMax: (v) => `Preço máx.: ${formatBRL(Number(v))}`,
  kmMin: (v) => `Km mín.: ${formatNumber(Number(v))}`,
  kmMax: (v) => `Km máx.: ${formatNumber(Number(v))}`,
};

interface Props {
  filters: Filters;
  setFilter: (k: keyof Filters, v: string) => void;
  reset: () => void;
}

/** Chips dos filtros ativos, cada um removível, + "Limpar tudo". Some quando não há filtro. */
export function ActiveFilters({ filters, setFilter, reset }: Props) {
  const entries = (Object.keys(LABEL) as (keyof Filters)[]).filter((k) => filters[k] !== "");
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
      {entries.map((k) => (
        <li key={k}>
          <button
            type="button"
            onClick={() => setFilter(k, "")}
            aria-label={`Remover filtro ${LABEL[k](filters[k])}`}
            className="inline-flex h-[32px] items-center gap-1 rounded-full border border-[#c9dbff] bg-accent-weak px-3 text-xs font-semibold text-accent transition-colors duration-DEFAULT hover:bg-[#dbe7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {LABEL[k](filters[k])}
            <X aria-hidden className="h-3 w-3" />
          </button>
        </li>
      ))}
      <li>
        <Button variant="ghost" size="sm" onClick={reset} className="h-[32px]">
          Limpar tudo
        </Button>
      </li>
    </ul>
  );
}
