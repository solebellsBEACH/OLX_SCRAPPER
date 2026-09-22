import { ChevronRight, AlertTriangle } from "lucide-react";
import type { AdRow } from "@/types";
import { formatBRL, formatKm } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { HELP, HelpTip } from "@/components/ui/tooltip";
import { opportunityPhrase, StatusBadge } from "./StatusBadge";
import { ResultDetails } from "./ResultDetails";

export const vehicleName = (r: AdRow) => [r.marca, r.modelo].filter(Boolean).join(" ") || r.modeloVersao;

interface Props {
  row: AdRow;
  selected: boolean;
  expanded: boolean;
  onSelect: (v: boolean) => void;
  onToggle: () => void;
}

/** Duas <tr>: a linha principal (5 colunas) e, abaixo, a linha secundária + detalhes. */
export function ResultRow({ row, selected, expanded, onSelect, onToggle }: Props) {
  const alerts = row.analysis.alerts.length;
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer transition-colors duration-DEFAULT",
          selected ? "bg-accent-weak" : "hover:bg-bg",
        )}
      >
        <td className="w-[44px] px-3 pt-3" onClick={(e) => e.stopPropagation()}>
          <Checkbox aria-label={`Selecionar ${vehicleName(row)}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        </td>
        <td className="px-3 pt-3 font-semibold">{vehicleName(row)}</td>
        <td className="tnum px-3 pt-3 text-right">{row.ano ?? "—"}</td>
        <td className="tnum px-3 pt-3 text-right">{formatKm(row.km)}</td>
        <td className="px-3 pt-3 text-right">
          <span className="tnum font-semibold">{formatBRL(row.price)}</span>
        </td>
        <td className="px-3 pt-3">
          <StatusBadge analysis={row.analysis} />
        </td>
        <td className="w-[44px] px-1 pt-1 text-right">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher detalhes" : "Expandir detalhes"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-sm text-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform duration-DEFAULT", expanded && "rotate-90")} />
          </button>
        </td>
      </tr>
      <tr
        onClick={onToggle}
        className={cn("cursor-pointer border-b border-border", selected && "bg-accent-weak")}
      >
        <td />
        <td colSpan={5} className="px-3 pb-3 pt-1 text-xs text-muted">
          <span className="block truncate">{row.versao ? `Descrição: ${row.versao}` : "Descrição: —"}</span>
          <span className="flex flex-wrap items-center gap-x-3">
            <span className="inline-flex items-center gap-1">
              Oportunidade: {opportunityPhrase(row.analysis)}
              <HelpTip text={HELP.oportunidade} />
            </span>
            {alerts > 0 && (
              <span className="inline-flex items-center gap-1 text-warn" title={row.analysis.alerts.map((a) => a.title).join(" · ")}>
                <AlertTriangle aria-hidden className="h-3 w-3" />
                {alerts === 1 ? "1 alerta" : `${alerts} alertas`}
              </span>
            )}
          </span>
        </td>
        <td />
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-bg">
          <td />
          <td colSpan={5} className="px-3 py-4">
            <ResultDetails row={row} />
          </td>
          <td />
        </tr>
      )}
    </>
  );
}
