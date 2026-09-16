// Resumo compacto por veículo pra telas que comparam vários anúncios lado a lado
// (Compare.tsx). Reaproveita os mesmos badges/textos do VehicleSummary (Detail), só que
// num formato menor — sem descrições longas de alerta/sinal, sem <details> de breakdown.
import type { AdRow } from "@/types";
import { formatBRL, formatKm } from "@/lib/format";
import {
  AlertsBadge,
  CONFIDENCE_TEXT,
  MarketStatusBadge,
  OpportunityBadge,
} from "@/components/VehicleAnalysisBadges";

export function VehicleCompactSummary({ row, title }: { row: AdRow; title: string }) {
  const { analysis } = row;
  const confidenceText = analysis.confidenceLabel ? CONFIDENCE_TEXT[analysis.confidenceLabel] : "—";

  return (
    <div className="flex flex-col gap-2 border border-border bg-surface p-3">
      <p className="truncate text-sm font-semibold" title={title}>
        {title}
      </p>

      <div>
        <p className="tnum text-base font-semibold">{formatBRL(row.price)}</p>
        <p className="tnum text-xs text-muted">
          {row.ano ?? "ano —"} · {formatKm(row.km)}
        </p>
      </div>

      <dl className="mt-1 flex flex-col gap-1 text-xs">
        <Row label="Preço">
          <MarketStatusBadge analysis={analysis} />
        </Row>
        <Row label="Oportunidade">
          <OpportunityBadge analysis={analysis} />
        </Row>
        <Row label="Confiança">
          <span>{confidenceText}</span>
        </Row>
        <Row label="Alertas">
          <AlertsBadge analysis={analysis} />
        </Row>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-subtle">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
