import type { Card, Categoria } from "./types";

const ANO_ATUAL = new Date().getFullYear();

/** Ano-modelo a partir do título do card (ex.: "... 2026", "... 2020/2021" → 2021). */
function parseYearFromTitle(title: unknown): number | null {
  if (typeof title !== "string") return null;
  const matches = title.match(/\b(19[5-9]\d|20[0-4]\d)\b/g);
  if (!matches) return null;
  const anos = matches.map(Number).filter((a) => a <= ANO_ATUAL + 1);
  return anos.length ? anos[anos.length - 1] : null;
}

/** Valor de um `detail` do card cujo label bate com `re` (ex.: "Motor 1.5" → "1.5"). */
function detailValue(details: unknown, re: RegExp): string | null {
  if (!Array.isArray(details)) return null;
  const hit = (details as Array<Record<string, unknown>>).find((d) => re.test(String(d?.label ?? "")));
  const value = hit ? String(hit.value ?? "").trim() : "";
  return value || null;
}

/**
 * Categoriza e dá um score (0-100) usando SÓ os dados já visíveis no card da
 * listagem (título, km, detalhes) — sem chamar IA nem visitar a página do
 * anúncio. Serve pro botão "Análise rápida": marca/modelo/versão continuam
 * `null` (isso exige IA), mas ano/motor/câmbio/combustível/carroceria dá pra
 * ler direto dos `details[]`, e o score é uma estimativa puramente
 * matemática de km rodada por ano de uso — mesma lógica de "km suspeita" que
 * a IA já usa (`ai-client.ts`), só que calculada aqui em vez de pedida à IA.
 */
export function quickCategorize(card: Card): Categoria & { quick: true } {
  const c = card as Record<string, unknown>;
  const ano = parseYearFromTitle(c.title);
  const motor = detailValue(c.details, /^motor\b/i);
  const carroceria = detailValue(c.details, /^carro tipo\b/i);
  const combustivel = detailValue(c.details, /^combust[ií]vel\b/i);
  const cambio = detailValue(c.details, /^c[aâ]mbio\b/i);
  const portasText = detailValue(c.details, /portas?\b/i);
  const portas = portasText ? Number(portasText.replace(/\D+/g, "")) || null : null;
  const km = typeof c.km === "number" ? c.km : null;

  let score: number | null = null;
  let scoreMotivo: string | null = null;
  let kmSuspeito: boolean | null = null;
  let kmSuspeitoMotivo: string | null = null;

  if (km != null && ano != null) {
    const idade = Math.max(1, ANO_ATUAL - ano + 1);
    const kmPorAno = km / idade;
    if (idade <= 1) {
      score = 70;
      scoreMotivo = `carro ${ano}, km ainda normal pra idade`;
    } else if (kmPorAno < 3000) {
      score = 45;
      kmSuspeito = true;
      kmSuspeitoMotivo = `~${Math.round(kmPorAno)} km/ano em ${idade} ano(s) — muito baixo, possível odômetro adulterado`;
      scoreMotivo = kmSuspeitoMotivo;
    } else if (kmPorAno < 8000) {
      score = 80;
      scoreMotivo = `uso baixo: ~${Math.round(kmPorAno)} km/ano em ${idade} ano(s)`;
    } else if (kmPorAno < 15000) {
      score = 65;
      scoreMotivo = `uso médio: ~${Math.round(kmPorAno)} km/ano em ${idade} ano(s)`;
    } else if (kmPorAno < 25000) {
      score = 45;
      scoreMotivo = `uso alto: ~${Math.round(kmPorAno)} km/ano em ${idade} ano(s)`;
    } else {
      score = 25;
      scoreMotivo = `uso muito alto: ~${Math.round(kmPorAno)} km/ano em ${idade} ano(s)`;
    }
  }

  return {
    tipo: null,
    marca: null,
    modelo: null,
    versao: null,
    ano,
    motor,
    combustivel,
    cambio,
    portas,
    carroceria,
    score,
    scoreMotivo,
    kmSuspeito,
    kmSuspeitoMotivo,
    quick: true,
  };
}
