// Resumo de análise em linguagem simples (Nível 1/2 do CLAUDE.md). Scores brutos e o
// scoreBreakdown só aparecem dentro do <details> "Ver como essa análise foi calculada"
// (Nível 3) — não devem dominar a UI.
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { VehicleAlert, VehicleAnalysisSummary, VehicleSignal } from "@/types";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CONFIDENCE_TEXT, OPPORTUNITY_TEXT } from "@/components/VehicleAnalysisBadges";

const MAX_POSITIVE_SIGNALS = 3;

function pricePhrase(status: NonNullable<VehicleAnalysisSummary["priceStatus"]>, pct: number): string {
  const rounded = Math.round(Math.abs(pct));
  if (status === "market") return "Dentro da faixa do mercado";
  if (status === "below" || status === "well_below") return `${rounded}% abaixo do mercado`;
  return `${rounded}% acima do mercado`;
}

export function VehicleSummary({
  analysis,
  price,
}: {
  analysis: VehicleAnalysisSummary;
  price?: number | null;
}) {
  const opp = analysis.opportunityLabel ? OPPORTUNITY_TEXT[analysis.opportunityLabel] : null;
  const confidenceText = analysis.confidenceLabel ? CONFIDENCE_TEXT[analysis.confidenceLabel] : null;
  const hasMarketData = analysis.priceStatus != null;
  const topAlerts = analysis.alerts;
  const topSignals = analysis.positiveSignals.slice(0, MAX_POSITIVE_SIGNALS);

  return (
    <div className="border border-border bg-surface">
      <p className="border-b border-border px-3 py-2 text-sm font-semibold">Análise do anúncio</p>
      <div className="flex flex-col gap-4 p-3">
        {/* Oportunidade */}
        <div>
          <p className="text-xs font-semibold text-muted">Oportunidade</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {opp && (
              <Badge tone={opp.tone} className="px-2 py-1 text-sm">
                {opp.title}
              </Badge>
            )}
            {analysis.opportunityScore != null && (
              <span className="text-xs text-subtle tnum">score {analysis.opportunityScore}/100</span>
            )}
          </div>
        </div>

        {/* Confiança da análise */}
        <div>
          <p className="text-xs font-semibold text-muted">Confiança da análise</p>
          <p className="mt-1 text-sm">
            {confidenceText ?? "—"}
            <span className="ml-2 text-xs text-subtle">
              Indica quanto os dados disponíveis sustentam esta análise — não é sobre a confiabilidade do
              vendedor.
            </span>
          </p>
        </div>

        {/* Preço vs mercado */}
        <div>
          <p className="text-xs font-semibold text-muted">Preço vs mercado</p>
          {hasMarketData ? (
            <div className="mt-1 text-sm">
              <p>{pricePhrase(analysis.priceStatus!, analysis.priceDifferencePercent ?? 0)}</p>
              {(price != null || analysis.marketAveragePrice != null) && (
                <p className="mt-1 text-xs text-subtle">
                  {price != null && <>Preço anunciado: {formatBRL(price)}</>}
                  {price != null && analysis.marketAveragePrice != null && " · "}
                  {analysis.marketAveragePrice != null && (
                    <>Média de similares: {formatBRL(analysis.marketAveragePrice)}</>
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-subtle">Poucos dados para comparar o preço.</p>
          )}
        </div>

        {topAlerts.length > 0 && <AlertList alerts={topAlerts} />}
        {topSignals.length > 0 && <SignalList signals={topSignals} />}

        {analysis.scoreBreakdown && <ScoreBreakdownDetails breakdown={analysis.scoreBreakdown} />}
      </div>
    </div>
  );
}

function AlertList({ alerts }: { alerts: VehicleAlert[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">
        {alerts.length === 1 ? "1 alerta para verificar" : `${alerts.length} alertas para verificar`}
      </p>
      <ul className="mt-1 flex flex-col gap-2">
        {alerts.map((a, i) => (
          <li
            key={`${a.type}-${i}`}
            className={cn(
              "flex items-start gap-2 border p-2 text-sm",
              a.severity === "danger"
                ? "border-danger-border bg-danger-bg text-danger"
                : "border-warn-border bg-warn-bg text-warn",
            )}
          >
            {a.severity === "danger" ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              <Badge tone={a.severity === "danger" ? "danger" : "warn"} className="mr-1 align-middle">
                {a.severity === "danger" ? "risco" : "atenção"}
              </Badge>
              <strong>{a.title}.</strong> <span className="text-fg">{a.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalList({ signals }: { signals: VehicleSignal[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">Pontos positivos</p>
      <ul className="mt-1 flex flex-col gap-2">
        {signals.map((s, i) => (
          <li
            key={`${s.type}-${i}`}
            className="flex items-start gap-2 border border-ok-border bg-ok-bg p-2 text-sm text-ok"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>{s.title}.</strong> <span className="text-fg">{s.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function ScoreBreakdownDetails({
  breakdown,
}: {
  breakdown: NonNullable<VehicleAnalysisSummary["scoreBreakdown"]>;
}) {
  const lines: Array<{ label: string; value: number }> = [{ label: "Base", value: breakdown.base }];
  if (breakdown.priceAdjustment != null) lines.push({ label: "Preço", value: breakdown.priceAdjustment });
  if (breakdown.conditionAdjustment != null)
    lines.push({ label: "Condição estimada", value: breakdown.conditionAdjustment });
  if (breakdown.mileageAdjustment != null)
    lines.push({ label: "Quilometragem", value: breakdown.mileageAdjustment });

  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer select-none text-subtle hover:text-fg">
        Ver como essa análise foi calculada
      </summary>
      <dl className="mt-2 flex flex-col gap-1">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-3 border-b border-border py-1 last:border-0">
            <dt>{l.label}</dt>
            <dd className="tnum">{l.label === "Base" ? l.value : signed(l.value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 py-1 font-semibold text-fg">
          <dt>Resultado</dt>
          <dd className="tnum">{breakdown.final}</dd>
        </div>
      </dl>
    </details>
  );
}
