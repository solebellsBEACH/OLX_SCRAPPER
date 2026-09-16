// Deriva as linhas achatadas (AdRow) e os agregados do dashboard a partir do Db.

import type {
  AdRow,
  Db,
  DbRecord,
  VehicleAlert,
  VehicleAnalysisSummary,
  VehicleScoreBreakdown,
  VehicleSignal,
} from "@/types";
import { parseKm, parsePrice } from "./format";

// --- score de oportunidade/confiança v1: constantes nomeadas ---------------------------
// Ver CLAUDE.md "Primary metrics"/"Status semantics". Cada ajuste é um número fixo,
// não um modelo estatístico — o dataset ainda é pequeno demais pra sustentar mais que isso.

const OPPORTUNITY_BASELINE = 50;
const CONFIDENCE_BASELINE = 50;

/** mínimo de OUTROS anúncios com preço válido no grupo marca+modelo+ano pra comparar com o mercado. */
const MIN_MARKET_SAMPLE = 2;
/** amostra considerada "razoável" pra dar um bônus extra de confiança. */
const REASONABLE_MARKET_SAMPLE = 5;

// diferença percentual vs. média do grupo -> ajuste de oportunidade
const PRICE_DIFF_STRONG_BELOW = -20; // diff <= isso
const PRICE_DIFF_BELOW = -10;
const PRICE_DIFF_SLIGHTLY_BELOW = -5;
const PRICE_DIFF_SLIGHTLY_ABOVE = 5; // diff <  isso
const PRICE_DIFF_ABOVE = 10;
const PRICE_DIFF_STRONG_ABOVE = 20;

const OPPORTUNITY_ADJ_STRONG_BELOW = 30;
const OPPORTUNITY_ADJ_BELOW = 20;
const OPPORTUNITY_ADJ_SLIGHTLY_BELOW = 10;
const OPPORTUNITY_ADJ_IN_RANGE = 0;
const OPPORTUNITY_ADJ_SLIGHTLY_ABOVE = -10;
const OPPORTUNITY_ADJ_ABOVE = -20;
const OPPORTUNITY_ADJ_STRONG_ABOVE = -30;

// diferença percentual -> priceStatus (faixas próprias, só calculadas com amostra suficiente)
const PRICE_STATUS_WELL_BELOW = -15;
const PRICE_STATUS_BELOW = -5;
const PRICE_STATUS_ABOVE = 5;
const PRICE_STATUS_WELL_ABOVE = 15;

/**
 * Abaixo disso, o preço é baixo demais pra comemorar sem verificar — vira alerta, e o
 * bônus de oportunidade é amortecido (ver EXTREME_LOW_PRICE_ADJUSTMENT) em vez do bônus
 * cheio de OPPORTUNITY_ADJ_STRONG_BELOW, pra nunca contradizer o próprio alerta.
 */
const EXTREME_LOW_PRICE_THRESHOLD = -25;
/** bônus amortecido (bem menor que OPPORTUNITY_ADJ_STRONG_BELOW) pra preço extremamente abaixo do mercado. */
const EXTREME_LOW_PRICE_ADJUSTMENT = 15;

/** acima disso, vale avisar que o preço está bem acima do que anúncios semelhantes pedem. */
const EXTREME_HIGH_PRICE_THRESHOLD = 25;

// score de condição da IA (secundário, não domina o preço)
const AI_SCORE_HIGH = 85;
const AI_SCORE_GOOD = 70;
const AI_SCORE_FAIR = 50;
const AI_CONDITION_ADJ_HIGH = 10;
const AI_CONDITION_ADJ_GOOD = 5;
const AI_CONDITION_ADJ_FAIR = 0;
const AI_CONDITION_ADJ_LOW = -5;

// km suspeita
const KM_SUSPEITO_OPPORTUNITY_PENALTY = -5;
const KM_SUSPEITO_CONFIDENCE_PENALTY = -15;

// confiança — disponibilidade de dados estruturados
const CONFIDENCE_ADJ_VALID_PRICE = 10;
const CONFIDENCE_ADJ_VALID_ANO = 5;
const CONFIDENCE_ADJ_VALID_KM = 10;
const CONFIDENCE_ADJ_MARCA_MODELO = 5;
const CONFIDENCE_ADJ_AI_SCORE_AVAILABLE = 5;
// confiança — comparação de mercado
const CONFIDENCE_ADJ_MARKET_AVAILABLE = 15;
const CONFIDENCE_ADJ_REASONABLE_SAMPLE = 10;

// rótulos
const OPPORTUNITY_LABEL_EXCELLENT = 85;
const OPPORTUNITY_LABEL_GOOD = 70;
const OPPORTUNITY_LABEL_FAIR = 50;

const CONFIDENCE_LABEL_HIGH = 75;
const CONFIDENCE_LABEL_MEDIUM = 50;

function prop(rec: DbRecord, label: string): string | null {
  const p = rec.detail?.properties?.find(
    (x) => x.label.toLowerCase() === label.toLowerCase(),
  );
  return p?.value ?? null;
}

function recordKm(rec: DbRecord): number | null {
  if (typeof rec.detail?.km === "number") return rec.detail.km;
  return parseKm(prop(rec, "Quilometragem"));
}

function recordAno(rec: DbRecord): number | null {
  const fromAi = rec.categoria?.ano;
  if (typeof fromAi === "number") return fromAi;
  const raw = prop(rec, "Ano");
  const n = raw ? Number(raw.replace(/[^\d]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

function recordDate(rec: DbRecord): number | null {
  if (rec.savedAt) {
    const t = Date.parse(rec.savedAt);
    if (Number.isFinite(t)) return t;
  }
  if (typeof rec.analyzedAt === "number") return rec.analyzedAt;
  if (rec.detail?.publishedAt) {
    const t = Date.parse(rec.detail.publishedAt);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function groupKey(marca: string | null, modelo: string | null, ano: number | null): string {
  return `${(marca ?? "?").toLowerCase()}|${(modelo ?? "?").toLowerCase()}|${ano ?? "?"}`;
}

/** Parcela da confiança que vem da disponibilidade de dados estruturados do próprio anúncio. */
function computeDataConfidence(params: {
  price: number | null;
  ano: number | null;
  km: number | null;
  marca: string | null;
  modelo: string | null;
  aiScoreAvailable: boolean;
  kmSuspeito: boolean;
}): number {
  let c = 0;
  if (params.price != null) c += CONFIDENCE_ADJ_VALID_PRICE;
  if (params.ano != null) c += CONFIDENCE_ADJ_VALID_ANO;
  if (params.km != null) c += CONFIDENCE_ADJ_VALID_KM;
  if (params.marca != null && params.modelo != null) c += CONFIDENCE_ADJ_MARCA_MODELO;
  if (params.aiScoreAvailable) c += CONFIDENCE_ADJ_AI_SCORE_AVAILABLE;
  if (params.kmSuspeito) c += KM_SUSPEITO_CONFIDENCE_PENALTY;
  return c;
}

/** Parcela da confiança que vem de termos ou não uma comparação de mercado utilizável. */
function computeMarketConfidence(market: { avg: number; sampleSize: number } | null): number {
  if (!market) return 0;
  let c = CONFIDENCE_ADJ_MARKET_AVAILABLE;
  if (market.sampleSize >= REASONABLE_MARKET_SAMPLE) c += CONFIDENCE_ADJ_REASONABLE_SAMPLE;
  return c;
}

/**
 * Score de oportunidade v1 — só usa dado já disponível no frontend (preço, km, categoria
 * da IA, comparação com o grupo marca+modelo+ano). Ver CLAUDE.md "Primary metrics"/"Status
 * semantics". Mantido determinístico e explicável: cada ajuste é um número fixo, não um
 * modelo estatístico — o dataset ainda é pequeno demais pra sustentar mais que isso.
 *
 * confidenceScore é hoje um único valor v1, mas já é somado a partir de duas parcelas
 * separadas (computeDataConfidence/computeMarketConfidence) pra facilitar expor as duas
 * separadamente no futuro sem reescrever a lógica.
 */
export function computeVehicleAnalysis(
  rec: DbRecord,
  price: number | null,
  ano: number | null,
  km: number | null,
  marca: string | null,
  modelo: string | null,
  market: { avg: number; sampleSize: number } | null,
): VehicleAnalysisSummary {
  const cat = rec.categoria;
  const alerts: VehicleAlert[] = [];
  const positiveSignals: VehicleSignal[] = [];

  const hasMarketSample = price != null && market != null && market.sampleSize >= MIN_MARKET_SAMPLE;

  let priceDifferencePercent: number | undefined;
  let priceStatus: VehicleAnalysisSummary["priceStatus"];
  let priceAdjustment: number | undefined;

  // --- componente de preço (dominante) — só existe com amostra de mercado suficiente ---
  if (hasMarketSample) {
    const diff = ((price! - market!.avg) / market!.avg) * 100;
    priceDifferencePercent = diff;

    // preço extremamente abaixo do mercado: bônus amortecido (não o +30 cheio), pra nunca
    // contradizer o alerta de verificação que esse mesmo caso dispara logo abaixo.
    if (diff <= EXTREME_LOW_PRICE_THRESHOLD) priceAdjustment = EXTREME_LOW_PRICE_ADJUSTMENT;
    else if (diff <= PRICE_DIFF_STRONG_BELOW) priceAdjustment = OPPORTUNITY_ADJ_STRONG_BELOW;
    else if (diff <= PRICE_DIFF_BELOW) priceAdjustment = OPPORTUNITY_ADJ_BELOW;
    else if (diff <= PRICE_DIFF_SLIGHTLY_BELOW) priceAdjustment = OPPORTUNITY_ADJ_SLIGHTLY_BELOW;
    else if (diff < PRICE_DIFF_SLIGHTLY_ABOVE) priceAdjustment = OPPORTUNITY_ADJ_IN_RANGE;
    else if (diff < PRICE_DIFF_ABOVE) priceAdjustment = OPPORTUNITY_ADJ_SLIGHTLY_ABOVE;
    else if (diff < PRICE_DIFF_STRONG_ABOVE) priceAdjustment = OPPORTUNITY_ADJ_ABOVE;
    else priceAdjustment = OPPORTUNITY_ADJ_STRONG_ABOVE;

    if (diff <= PRICE_STATUS_WELL_BELOW) priceStatus = "well_below";
    else if (diff <= PRICE_STATUS_BELOW) priceStatus = "below";
    else if (diff < PRICE_STATUS_ABOVE) priceStatus = "market";
    else if (diff < PRICE_STATUS_WELL_ABOVE) priceStatus = "above";
    else priceStatus = "well_above";

    if (diff <= EXTREME_LOW_PRICE_THRESHOLD) {
      alerts.push({
        type: "price_far_below_market",
        severity: "attention",
        title: "Preço muito abaixo do padrão",
        description:
          "O preço está muito abaixo dos veículos semelhantes e merece verificação.",
      });
    } else if (diff <= PRICE_STATUS_BELOW) {
      positiveSignals.push({
        type: "price_below_market",
        title: "Preço abaixo do mercado",
        description: `Cerca de ${Math.round(Math.abs(diff))}% abaixo da média de anúncios semelhantes.`,
      });
    }

    if (diff >= EXTREME_HIGH_PRICE_THRESHOLD) {
      alerts.push({
        type: "price_far_above_market",
        severity: "attention",
        title: "Preço bem acima do mercado",
        description: "O preço está bem acima dos veículos semelhantes — vale negociar ou comparar outras opções.",
      });
    }
  } else if (price != null) {
    alerts.push({
      type: "insufficient_market_sample",
      severity: "attention",
      title: "Poucos veículos para comparação",
      description:
        "Ainda não há anúncios semelhantes suficientes (mesma marca, modelo e ano) pra comparar o preço com confiança.",
    });
  }

  // --- score de condição da IA (secundário, não domina o preço) ---
  const aiScore = cat?.score ?? null;
  let conditionAdjustment: number | undefined;
  if (aiScore != null) {
    if (aiScore >= AI_SCORE_HIGH) conditionAdjustment = AI_CONDITION_ADJ_HIGH;
    else if (aiScore >= AI_SCORE_GOOD) conditionAdjustment = AI_CONDITION_ADJ_GOOD;
    else if (aiScore >= AI_SCORE_FAIR) conditionAdjustment = AI_CONDITION_ADJ_FAIR;
    else conditionAdjustment = AI_CONDITION_ADJ_LOW;

    if (aiScore >= AI_SCORE_HIGH) {
      positiveSignals.push({
        type: "high_ai_condition_score",
        title: "Boa condição estimada",
        description: "A IA estimou uma condição acima da média a partir do anúncio.",
      });
    }
  }

  // --- km suspeita: não penaliza pesado a oportunidade, mas reduz confiança e vira alerta ---
  const kmSuspeito = cat?.kmSuspeito === true;
  const mileageAdjustment = kmSuspeito ? KM_SUSPEITO_OPPORTUNITY_PENALTY : undefined;
  if (kmSuspeito) {
    alerts.push({
      type: "km_suspicious",
      severity: "attention",
      title: "Quilometragem fora do padrão",
      description:
        cat?.kmSuspeitoMotivo ??
        "Quilometragem muito baixa pra idade do carro — estatisticamente incomum, vale confirmar.",
    });
  } else if (cat?.kmSuspeito === false) {
    // só é um sinal positivo quando a IA de fato avaliou a km (kmSuspeito === false), não
    // quando simplesmente não há dado suficiente pra avaliar (kmSuspeito null/undefined).
    positiveSignals.push({
      type: "mileage_within_pattern",
      title: "Quilometragem sem anomalias detectadas",
      description: "A quilometragem informada está dentro do esperado pra idade do carro.",
    });
  }

  const opportunity = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        OPPORTUNITY_BASELINE + (priceAdjustment ?? 0) + (conditionAdjustment ?? 0) + (mileageAdjustment ?? 0),
      ),
    ),
  );

  const dataConfidence = computeDataConfidence({
    price,
    ano,
    km,
    marca,
    modelo,
    aiScoreAvailable: aiScore != null,
    kmSuspeito,
  });
  const marketConfidence = computeMarketConfidence(hasMarketSample ? market : null);
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(CONFIDENCE_BASELINE + dataConfidence + marketConfidence)),
  );

  const opportunityLabel: VehicleAnalysisSummary["opportunityLabel"] =
    opportunity >= OPPORTUNITY_LABEL_EXCELLENT
      ? "excellent"
      : opportunity >= OPPORTUNITY_LABEL_GOOD
        ? "good"
        : opportunity >= OPPORTUNITY_LABEL_FAIR
          ? "fair"
          : "poor";

  const confidenceLabel: VehicleAnalysisSummary["confidenceLabel"] =
    confidence >= CONFIDENCE_LABEL_HIGH ? "high" : confidence >= CONFIDENCE_LABEL_MEDIUM ? "medium" : "low";

  const scoreBreakdown: VehicleScoreBreakdown = {
    base: OPPORTUNITY_BASELINE,
    priceAdjustment,
    conditionAdjustment,
    mileageAdjustment,
    final: opportunity,
  };

  return {
    opportunityScore: opportunity,
    opportunityLabel,
    confidenceScore: confidence,
    confidenceLabel,
    priceStatus: hasMarketSample ? priceStatus : undefined,
    priceDifferencePercent: hasMarketSample ? priceDifferencePercent : undefined,
    marketAveragePrice: hasMarketSample ? market?.avg : undefined,
    marketSampleSize: hasMarketSample ? market?.sampleSize : undefined,
    alerts,
    positiveSignals,
    scoreBreakdown,
  };
}

export function toRows(db: Db): AdRow[] {
  const records = Object.values(db);

  // média de preço por marca+modelo+ano (só grupos com 2+ preços válidos)
  const groups = new Map<string, number[]>();
  for (const rec of records) {
    const price = parsePrice(rec.detail?.price);
    if (price == null) continue;
    const key = groupKey(rec.categoria?.marca ?? null, rec.categoria?.modelo ?? null, recordAno(rec));
    const arr = groups.get(key) ?? [];
    arr.push(price);
    groups.set(key, arr);
  }
  const groupAvg = new Map<string, number>();
  for (const [key, arr] of groups) {
    if (arr.length >= 2) groupAvg.set(key, arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  // igual ao mapa acima, mas guardando id junto — usado pelo resumo de análise (v1), que
  // exige pelo menos 2 OUTROS anúncios com preço válido no grupo (exclui o próprio anúncio
  // da média, pra não enviesar a comparação).
  const groupEntries = new Map<string, Array<{ id: string; price: number }>>();
  for (const rec of records) {
    const price = parsePrice(rec.detail?.price);
    if (price == null) continue;
    const key = groupKey(rec.categoria?.marca ?? null, rec.categoria?.modelo ?? null, recordAno(rec));
    const arr = groupEntries.get(key) ?? [];
    arr.push({ id: rec.id, price });
    groupEntries.set(key, arr);
  }
  function marketComparison(
    id: string,
    key: string,
  ): { avg: number; sampleSize: number } | null {
    const others = (groupEntries.get(key) ?? []).filter((e) => e.id !== id).map((e) => e.price);
    if (others.length < MIN_MARKET_SAMPLE) return null;
    return { avg: others.reduce((a, b) => a + b, 0) / others.length, sampleSize: others.length };
  }

  return records
    .map((rec): AdRow => {
      const marca = rec.categoria?.marca ?? prop(rec, "Marca");
      const modelo = rec.categoria?.modelo ?? null;
      const versao = rec.categoria?.versao ?? null;
      const ano = recordAno(rec);
      const km = recordKm(rec);
      const price = parsePrice(rec.detail?.price);
      const priceOld = parsePrice(rec.detail?.priceOld ?? rec.detail?.oldPrice ?? null);
      const key = groupKey(marca, modelo, ano);
      const avg = groupAvg.get(key);
      return {
        id: rec.id,
        url: rec.url ?? rec.detail?.url,
        record: rec,
        marca,
        modelo,
        versao,
        modeloVersao: [modelo, versao].filter(Boolean).join(" ") || (rec.detail?.title ?? "—"),
        ano,
        km,
        price,
        priceOld,
        pricePerKm: price != null && km ? price / km : null,
        location: rec.detail?.location ?? null,
        date: recordDate(rec),
        thumb: rec.detail?.images?.[0] ?? null,
        opportunity: price != null && avg != null && price < avg,
        analysis: computeVehicleAnalysis(rec, price, ano, km, marca, modelo, marketComparison(rec.id, key)),
      };
    })
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

export interface DashboardStats {
  total: number;
  withPrice: number;
  avgPrice: number | null;
  medianPrice: number | null;
  priceDrops: number;
  opportunities: number;
  byMarca: Array<{ label: string; count: number }>;
  byAno: Array<{ label: string; count: number }>;
}

export function computeStats(rows: AdRow[]): DashboardStats {
  const prices = rows.map((r) => r.price).filter((p): p is number => p != null);
  const sorted = [...prices].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const tally = (get: (r: AdRow) => string | number | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = get(r);
      const key = v == null || v === "" ? "—" : String(v);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  return {
    total: rows.length,
    withPrice: prices.length,
    avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
    medianPrice: median,
    priceDrops: rows.filter((r) => r.priceOld != null && r.price != null && r.priceOld > r.price)
      .length,
    opportunities: rows.filter((r) => r.opportunity).length,
    byMarca: tally((r) => r.marca),
    byAno: tally((r) => r.ano),
  };
}
