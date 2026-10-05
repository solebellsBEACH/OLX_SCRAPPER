// Semântica de cor única do painel. Toda cor de "quão bom é o preço" passa por aqui.
//
//   good      verde     bom negócio  — preço ≥ 5% abaixo do mercado (priceStatus below/well_below)
//   normal    amarelo   dentro do esperado (±5%)
//   expensive laranja   caro — preço ≥ 5% acima do mercado (above/well_above)
//   verify    atenção   verificar preço — muito abaixo do mercado (alerta price_far_below_market);
//                       preço bom demais não é "bom negócio" até ser conferido
//   nodata    cinza     sem amostra de mercado suficiente
//
// Os limiares vêm do priceStatus calculado em rows.ts (fonte única); aqui só se traduz
// o status em tom. Cor nunca aparece sozinha: o StatusBadge sempre junta ícone + texto.
// Contraste dos pares texto/fundo abaixo ≥ 4.5:1 (WCAG AA).

import type { VehicleAnalysisSummary } from "@/types";

export type PriceTone = "good" | "normal" | "expensive" | "verify" | "nodata";

export function getPriceTone(analysis: VehicleAnalysisSummary): PriceTone {
  if (analysis.alerts.some((a) => a.type === "price_far_below_market")) return "verify";
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

/** "Bom negócio" de verdade: preço abaixo do mercado e sem alerta de preço suspeito. */
export function isGoodDeal(analysis: VehicleAnalysisSummary): boolean {
  return getPriceTone(analysis) === "good";
}

export const TONE_LABEL: Record<PriceTone, string> = {
  good: "Bom negócio",
  normal: "Normal",
  expensive: "Caro",
  verify: "Verificar preço",
  nodata: "Sem dados",
};

/** Mesmo tom do Badge (ui/badge.tsx). */
export const TONE_BADGE: Record<PriceTone, "ok" | "caution" | "orange" | "warn" | "neutral"> = {
  good: "ok",
  normal: "caution",
  expensive: "orange",
  verify: "warn",
  nodata: "neutral",
};

export const TONE_LEGEND: Array<{ tone: PriceTone; title: string; hint: string }> = [
  { tone: "good", title: "Verde — bom negócio", hint: "Preço pelo menos 5% abaixo da média de anúncios parecidos." },
  { tone: "normal", title: "Amarelo — normal", hint: "Preço dentro do esperado (±5% da média)." },
  { tone: "expensive", title: "Laranja — caro", hint: "Preço pelo menos 5% acima da média de anúncios parecidos." },
  { tone: "verify", title: "Atenção — verificar preço", hint: "Preço 25% ou mais abaixo da média — bom demais, vale conferir antes." },
  { tone: "nodata", title: "Cinza — sem dados", hint: "Poucos anúncios semelhantes para comparar o preço." },
];
