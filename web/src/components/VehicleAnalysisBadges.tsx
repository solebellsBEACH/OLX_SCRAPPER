// Blocos compartilhados de UI pro resumo de análise (VehicleAnalysisSummary), usados por
// VehicleSummary (Detail), Listing e Compare — pra manter a linguagem/tons consistentes
// nos três lugares sem duplicar os mapeamentos de texto.
import { AlertTriangle } from "lucide-react";
import type { VehicleAnalysisSummary } from "@/types";
import { Badge } from "@/components/ui/badge";
import { getPriceTone } from "@/lib/colors";
import { relevantAlerts } from "@/lib/rows";

/**
 * Dois números diferentes, dois nomes diferentes em toda a UI:
 *   "Oportunidade"  = opportunityScore (preço vs mercado + ajustes) — calculado no painel
 *   "Condição (IA)" = categoria.score (condição estimada pela IA a partir do anúncio) —
 *                     o mesmo número do selo na página da OLX
 */
export const CONDITION_LABEL = "Condição (IA)";

/** "85/100" ou "—" quando a IA não deu nota. */
export function conditionText(score: number | null | undefined): string {
  return score != null ? `${score}/100` : "—";
}

type Tone = "ok" | "neutral" | "warn";

export const OPPORTUNITY_TEXT: Record<
  NonNullable<VehicleAnalysisSummary["opportunityLabel"]>,
  { title: string; short: string; tone: Tone }
> = {
  excellent: { title: "Excelente oportunidade pelos dados disponíveis", short: "Excelente", tone: "ok" },
  good: { title: "Boa oportunidade pelos dados disponíveis", short: "Boa", tone: "ok" },
  fair: { title: "Dentro do esperado", short: "Dentro do esperado", tone: "neutral" },
  poor: { title: "Pouco atrativo pelos dados disponíveis", short: "Pouco atrativa", tone: "warn" },
};

export const CONFIDENCE_TEXT: Record<NonNullable<VehicleAnalysisSummary["confidenceLabel"]>, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

/** "12% abaixo", "Dentro da média", "8% acima", "Sem dados suficientes". */
export function marketPhrase(analysis: VehicleAnalysisSummary): string {
  if (analysis.priceStatus == null) return "Sem dados suficientes";
  const pct = Math.round(Math.abs(analysis.priceDifferencePercent ?? 0));
  if (analysis.priceStatus === "market") return "Dentro da média";
  if (getPriceTone(analysis) === "verify") return `${pct}% abaixo — verificar`;
  if (analysis.priceStatus === "below" || analysis.priceStatus === "well_below") return `${pct}% abaixo`;
  return `${pct}% acima`;
}

function marketTone(analysis: VehicleAnalysisSummary): Tone {
  if (analysis.priceStatus == null) return "neutral";
  if (getPriceTone(analysis) === "verify") return "warn";
  if (analysis.priceStatus === "below" || analysis.priceStatus === "well_below") return "ok";
  if (analysis.priceStatus === "market") return "neutral";
  return "warn";
}

/** Badge compacto pro status de preço vs mercado — nunca mostra o enum bruto. */
export function MarketStatusBadge({ analysis }: { analysis: VehicleAnalysisSummary }) {
  return <Badge tone={marketTone(analysis)}>{marketPhrase(analysis)}</Badge>;
}

/**
 * Badge compacto pra oportunidade: rótulo em texto simples é o principal, score numérico
 * (opcional) fica só como detalhe secundário — nunca o inverso.
 */
export function OpportunityBadge({
  analysis,
  showScore = false,
}: {
  analysis: VehicleAnalysisSummary;
  showScore?: boolean;
}) {
  if (!analysis.opportunityLabel) return <span className="text-subtle">—</span>;
  const { short, tone } = OPPORTUNITY_TEXT[analysis.opportunityLabel];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={tone}>{short}</Badge>
      {showScore && analysis.opportunityScore != null && (
        <span className="text-xs text-subtle tnum">{analysis.opportunityScore}/100</span>
      )}
    </span>
  );
}

/** "2 alertas" / "1 alerta" / "Sem alertas relevantes", com os títulos no title (tooltip). */
export function alertsSummaryText(analysis: VehicleAnalysisSummary): string {
  const n = relevantAlerts(analysis).length;
  if (n === 0) return "Sem alertas relevantes";
  return n === 1 ? "1 alerta" : `${n} alertas`;
}

/** Badge compacto de alertas — ícone + texto + tom, títulos completos só no tooltip (title). */
export function AlertsBadge({ analysis }: { analysis: VehicleAnalysisSummary }) {
  const alerts = relevantAlerts(analysis);
  if (alerts.length === 0) {
    return <span className="text-xs text-subtle">Sem alertas relevantes</span>;
  }
  const hasDanger = alerts.some((a) => a.severity === "danger");
  const title = alerts.map((a) => a.title).join(" · ");
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <Badge tone={hasDanger ? "danger" : "warn"}>
        <AlertTriangle className="mr-1 h-3 w-3" />
        {alertsSummaryText(analysis)}
      </Badge>
    </span>
  );
}
