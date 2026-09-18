import { Minus, TrendingDown, TrendingUp, CircleSlash } from "lucide-react";
import type { VehicleAnalysisSummary } from "@/types";
import { Badge } from "@/components/ui/badge";
import { getPriceTone, TONE_BADGE, TONE_LABEL, type PriceTone } from "@/lib/colors";

const ICON: Record<PriceTone, typeof Minus> = {
  good: TrendingDown,
  normal: Minus,
  expensive: TrendingUp,
  nodata: CircleSlash,
};

/** Cor + ícone + texto: a cor nunca é a única pista. */
export function StatusBadge({ analysis }: { analysis: VehicleAnalysisSummary }) {
  const tone = getPriceTone(analysis);
  const Icon = ICON[tone];
  return (
    <Badge tone={TONE_BADGE[tone]} className="gap-1 px-2 py-1">
      <Icon aria-hidden className="h-3 w-3" />
      {TONE_LABEL[tone]}
    </Badge>
  );
}

/** "14% abaixo do esperado" / "Dentro do esperado" / "Sem dados suficientes". */
export function opportunityPhrase(analysis: VehicleAnalysisSummary): string {
  if (analysis.priceStatus == null) return "Sem dados suficientes";
  if (analysis.priceStatus === "market") return "Dentro do esperado";
  const pct = Math.round(Math.abs(analysis.priceDifferencePercent ?? 0));
  const below = analysis.priceStatus === "below" || analysis.priceStatus === "well_below";
  return `${pct}% ${below ? "abaixo" : "acima"} do esperado`;
}
