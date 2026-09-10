import { X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import type { Filters } from "@/lib/useFilters";

interface Props {
  filters: Filters;
  setFilter: (k: keyof Filters, v: string) => void;
  reset: () => void;
  active: number;
  marcas: string[];
  anos: number[];
  right?: React.ReactNode;
}

export function Toolbar({ filters, setFilter, reset, active, marcas, anos, right }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3 border border-border bg-surface p-3">
      <Field label="Busca">
        <Input
          value={filters.q}
          onChange={(e) => setFilter("q", e.target.value)}
          placeholder="marca, modelo, local…"
          className="w-[220px]"
        />
      </Field>

      <Field label="Marca">
        <Select value={filters.marca} onChange={(e) => setFilter("marca", e.target.value)}>
          <option value="">Todas</option>
          {marcas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Ano">
        <Select value={filters.ano} onChange={(e) => setFilter("ano", e.target.value)}>
          <option value="">Todos</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Preço (R$)">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            value={filters.precoMin}
            onChange={(e) => setFilter("precoMin", e.target.value)}
            placeholder="min"
            className="w-[92px] tnum"
          />
          <span className="text-subtle">–</span>
          <Input
            type="number"
            inputMode="numeric"
            value={filters.precoMax}
            onChange={(e) => setFilter("precoMax", e.target.value)}
            placeholder="max"
            className="w-[92px] tnum"
          />
        </div>
      </Field>

      <Field label="Km">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            value={filters.kmMin}
            onChange={(e) => setFilter("kmMin", e.target.value)}
            placeholder="min"
            className="w-[92px] tnum"
          />
          <span className="text-subtle">–</span>
          <Input
            type="number"
            inputMode="numeric"
            value={filters.kmMax}
            onChange={(e) => setFilter("kmMax", e.target.value)}
            placeholder="max"
            className="w-[92px] tnum"
          />
        </div>
      </Field>

      {active > 0 && (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X className="h-3 w-3" />
          Limpar ({active})
        </Button>
      )}

      <div className="ml-auto flex items-end gap-2">{right}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
