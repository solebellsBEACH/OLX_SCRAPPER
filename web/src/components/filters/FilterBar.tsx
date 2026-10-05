import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { Filters } from "@/lib/useFilters";
import { SearchInput } from "./SearchInput";

interface Props {
  filters: Filters;
  setFilter: (k: keyof Filters, v: string) => void;
  active: number;
  marcas: string[];
  anos: number[];
  suggestions: string[];
  right?: React.ReactNode;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function Range({ k, filters, setFilter }: { k: "preco" | "km"; filters: Filters; setFilter: Props["setFilter"] }) {
  const min = `${k}Min` as keyof Filters;
  const max = `${k}Max` as keyof Filters;
  return (
    <div className="flex items-center gap-1">
      <Input type="number" inputMode="numeric" value={filters[min]} onChange={(e) => setFilter(min, e.target.value)} placeholder="min" className="tnum sm:w-[92px]" />
      <span className="text-subtle">–</span>
      <Input type="number" inputMode="numeric" value={filters[max]} onChange={(e) => setFilter(max, e.target.value)} placeholder="máx" className="tnum sm:w-[92px]" />
    </div>
  );
}

export function FilterBar({ filters, setFilter, active, marcas, anos, suggestions, right }: Props) {
  // Mobile: os filtros avançados ficam recolhidos atrás de um botão; a busca fica sempre visível.
  const [open, setOpen] = useState(false);
  const advancedActive = active - (filters.q ? 1 : 0);

  return (
    <section aria-label="Busca avançada" className="flex flex-col gap-3 border border-border bg-surface p-3">
      <SearchInput value={filters.q} onChange={(v) => setFilter("q", v)} suggestions={suggestions} />

      <Button
        className="h-[44px] w-full sm:hidden"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal className="h-3 w-3" />
        Filtros{advancedActive > 0 ? ` (${advancedActive})` : ""}
      </Button>

      <div className={cn("grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap", open ? "grid" : "hidden sm:flex")}>
        <Field label="Marca">
          <Select value={filters.marca} onChange={(e) => setFilter("marca", e.target.value)}>
            <option value="">Todas</option>
            {marcas.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Ano">
          <Select value={filters.ano} onChange={(e) => setFilter("ano", e.target.value)}>
            <option value="">Todos</option>
            {anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2 sm:col-auto">
          <Field label="Preço (R$)"><Range k="preco" filters={filters} setFilter={setFilter} /></Field>
        </div>
        <div className="col-span-2 sm:col-auto">
          <Field label="Km"><Range k="km" filters={filters} setFilter={setFilter} /></Field>
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:ml-auto sm:col-auto">{right}</div>
      </div>
    </section>
  );
}
