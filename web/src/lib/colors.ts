// Semântica de cor única do painel. Toda cor de "quão bom é o preço" passa por aqui.
//
//   good      verde     bom negócio  — preço ≥ 5% abaixo do mercado (priceStatus below/well_below)
//   normal    amarelo   dentro do esperado (±5%)
//   expensive laranja   caro — preço ≥ 5% acima do mercado (above/well_above)
//   nodata    cinza     sem amostra de mercado suficiente
//
// Os limiares vêm do priceStatus calculado em rows.ts (fonte única); aqui só se traduz
// o status em tom. Cor nunca aparece sozinha: o StatusBadge sempre junta ícone + texto.
// Contraste dos pares texto/fundo abaixo ≥ 4.5:1 (WCAG AA).

import type { VehicleAnalysisSummary } from "@/types";

export type PriceTone = "good" | "normal" | "expensive" | "nodata";

export function getPriceTone(analysis: VehicleAnalysisSummary): PriceTone {
  switch (analysis.priceStatus) {
    case "below":
    case "well_below":
      return "good";
    case "market":
      return "normal";
    case "above":
    case "well_above":
      return "expensive";
    default:
      return "nodata";
  }
}

export const TONE_LABEL: Record<PriceTone, string> = {
  good: "Bom negócio",
  normal: "Normal",
  expensive: "Caro",
  nodata: "Sem dados",
};

/** Mesmo tom do Badge (ui/badge.tsx). */
export const TONE_BADGE: Record<PriceTone, "ok" | "caution" | "orange" | "neutral"> = {
  good: "ok",
  normal: "caution",
  expensive: "orange",
  nodata: "neutral",
};

export const TONE_LEGEND: Array<{ tone: PriceTone; title: string; hint: string }> = [
  { tone: "good", title: "Verde — bom negócio", hint: "Preço pelo menos 5% abaixo da média de anúncios parecidos." },
  { tone: "normal", title: "Amarelo — normal", hint: "Preço dentro do esperado (±5% da média)." },
  { tone: "expensive", title: "Laranja — caro", hint: "Preço pelo menos 5% acima da média de anúncios parecidos." },
  { tone: "nodata", title: "Cinza — sem dados", hint: "Poucos anúncios semelhantes para comparar o preço." },
];
