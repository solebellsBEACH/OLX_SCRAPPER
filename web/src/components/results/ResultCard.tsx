import { ChevronDown } from "lucide-react";
import type { AdRow } from "@/types";
import { formatBRL, formatKm } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, opportunityPhrase } from "./StatusBadge";
import { ResultDetails } from "./ResultDetails";
import { vehicleName } from "./ResultRow";
import { CONDITION_LABEL, conditionText } from "@/components/VehicleAnalysisBadges";

interface Props {
  row: AdRow;
  selected: boolean;
  expanded: boolean;
  onSelect: (v: boolean) => void;
  onToggle: () => void;
}

/** Mobile/tablet (<1024px): card empilhado, foto 16/9 no topo, preço em destaque. */
export function ResultCard({ row, selected, expanded, onSelect, onToggle }: Props) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-border bg-surface transition-colors duration-DEFAULT",
        selected ? "border-accent bg-accent-weak" : "hover:border-accent-border",
      )}
    >
      {row.thumb && (
        <img
          src={row.thumb}
          alt=""
          loading="lazy"
          className="aspect-video w-full object-cover sm:max-h-[200px]"
        />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold">{vehicleName(row)}</h3>
            <p className="text-sm text-muted">
              {row.ano ?? "—"} • {formatKm(row.km)}
            </p>
            {row.versao && <p className="truncate text-xs text-subtle">{row.versao}</p>}
          </div>
          <label className="-m-3 flex h-[44px] w-[44px] shrink-0 items-center justify-center">
            <Checkbox aria-label={`Selecionar ${vehicleName(row)}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
          </label>
        </div>

        <p className="tnum text-[24px] font-semibold leading-[32px]">{formatBRL(row.price)}</p>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge analysis={row.analysis} />
          <span className="text-xs text-muted">{opportunityPhrase(row.analysis)}</span>
        </div>
        <p className="tnum text-xs text-muted">
          {CONDITION_LABEL}: {conditionText(row.record.categoria?.score)}
        </p>

        {expanded && (
          <div className="border-t border-border pt-3">
            <ResultDetails row={row} />
          </div>
        )}

        <Button className="mt-auto h-[44px] w-full" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? "Ocultar detalhes" : "Ver detalhes"}
          <ChevronDown className={cn("h-3 w-3 transition-transform duration-DEFAULT", expanded && "rotate-180")} />
        </Button>
      </div>
    </article>
  );
}
