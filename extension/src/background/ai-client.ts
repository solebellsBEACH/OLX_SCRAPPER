// Porta a lógica de proxy/server.mjs: chama DeepSeek/OpenAI direto do background
// da extensão (mesmo formato "chat/completions" da OpenAI para os dois).

import { activeProviderConfig } from "./ai-config";
import { cancelSignal } from "./cancel";

interface AiSection {
  index?: number;
  title?: unknown;
  description?: unknown;
  details?: unknown;
  km?: unknown;
}

interface CarInput {
  id?: string | null;
  titulo?: string | null;
  title?: string | null;
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  ano?: number | null;
  motor?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  carroceria?: string | null;
  km?: number | null;
  preco?: number | null;
  price?: number | null;
  score?: number | null;
}

function buildPrompt(sections: AiSection[]): string {
  const anoAtual = new Date().getFullYear();
  return [
    "Categorize CADA anúncio de veículo do OLX abaixo a partir do título e dos detalhes.",
    "A extensão analisa SOMENTE CARROS de passeio: classifique o campo 'tipo' para que",
    "moto, caminhão, ônibus, van, náutica, etc. possam ser descartados depois.",
    "Responda SOMENTE com um objeto JSON válido, sem texto fora do JSON, no formato:",
    '{ "anuncios": [ {',
    '  "index": number,',
    '  "tipo": string|null,            // "carro", "moto", "caminhao", "onibus", "van", "nautica", "outro"',
    '  "marca": string|null,           // ex.: "Honda"',
    '  "modelo": string|null,          // ex.: "HR-V"',
    '  "versao": string|null,          // ex.: "EX", "EXL", "Touring"',
    '  "ano": number|null,             // ano-modelo, ex.: 2016',
    '  "motor": string|null,           // ex.: "1.8"',
    '  "combustivel": string|null,     // "Flex", "Gasolina", "Diesel", "Elétrico", "Híbrido"',
    '  "cambio": string|null,          // "Automático" ou "Manual"',
    '  "portas": number|null,          // ex.: 5',
    '  "carroceria": string|null,      // "SUV", "Hatch", "Sedã", "Picape", etc.',
    '  "score": number|null,           // 0 a 100: condição estimada do carro (100 = ótimo estado, 0 = sucata/muitos problemas)',
    '  "scoreMotivo": string|null,     // frase curta (máx. ~15 palavras) justificando o score',
    '  "kmSuspeito": boolean|null,     // true = km muito baixa pra idade do carro (possível odômetro adulterado)',
    '  "kmSuspeitoMotivo": string|null // frase curta explicando (ex.: "9.000km em 6 anos = 1.500km/ano")',
    "} ] }",
    "Use null quando o dado não aparecer. Não invente. Mantenha 'index' igual ao do input.",
    "Em 'tipo' use \"carro\" para automóveis de passeio (hatch, sedã, SUV, picape leve).",
    "Se houver o campo 'description', use-o também como fonte.",
    "Para 'score': baseie-se em sinais explícitos do título/descrição/detalhes — revisões em dia,",
    "único dono, garantia de fábrica, 'sem detalhes', 'estado de novo' sobem o score; 'batido',",
    "'sucata', 'motor fundido', 'necessita reparos', km muito alta pra idade, muitas trocas de",
    "dono, ou falta total de informação sobre o estado descem/limitam o score. Sem qualquer sinal",
    "sobre o estado do carro, responda score: null (não invente uma nota sem base).",
    `Para 'kmSuspeito': use o ano atual (${anoAtual}) e o campo 'km' de cada anúncio (quando vier)`,
    "pra estimar km/ano rodado = km ÷ (ano_atual - ano_do_carro + 1, mínimo 1). Marque",
    "kmSuspeito: true quando essa média for MUITO baixa pra um carro de passeio de uso normal",
    "(bem abaixo de ~3.000 km/ano) — pode indicar odômetro voltado/adulterado, sinistro rodado",
    "escondido, ou km real maior que o anunciado. NÃO marque suspeito carros muito novos (0-1",
    "ano de uso, onde pouca km ainda é normal) nem quando faltar 'km' ou 'ano' pra calcular —",
    "nesses casos responda kmSuspeito: null. Km muito ALTA pra idade não é 'kmSuspeito' (isso",
    "já é considerado no 'score' acima); este campo é só pra km anormalmente BAIXA.",
    "",
    "ANÚNCIOS:",
    JSON.stringify(
      sections.map((section, index) => ({
        index: section.index ?? index,
        title: section.title,
        description: section.description,
        details: section.details,
        km: section.km ?? null,
      })),
    ),
  ].join("\n");
}

function carSummary(car: CarInput) {
  return {
    id: car.id ?? null,
    titulo: car.titulo ?? car.title ?? null,
    marca: car.marca ?? null,
    modelo: car.modelo ?? null,
    versao: car.versao ?? null,
    ano: car.ano ?? null,
    motor: car.motor ?? null,
    combustivel: car.combustivel ?? null,
    cambio: car.cambio ?? null,
    carroceria: car.carroceria ?? null,
    km: car.km ?? null,
    preco: car.preco ?? car.price ?? null,
    score: car.score ?? null,
  };
}

function normalizeCars(cars: CarInput[]): ReturnType<typeof carSummary>[] | null {
  if (!Array.isArray(cars) || cars.length < 2) return null;
  return cars.slice(0, 6).map(carSummary);
}

function buildComparePrompt(cars: ReturnType<typeof carSummary>[]): string {
  return [
    "Compare os carros abaixo (dados de anúncios do OLX) e ordene do MELHOR pro pior",
    "custo-benefício geral, considerando preço, km, ano, score de condição (se houver) e",
    "o que se sabe sobre confiabilidade/custo de manutenção do modelo.",
    "Responda SOMENTE com um objeto JSON válido, no formato:",
    '{ "ranking": [ { "id": string, "posicao": number, "texto": string } ] }',
    "Um item por carro (mesma quantidade recebida), ordenado do 1º (melhor) ao último.",
    "'texto': 1-2 frases em português, objetivas, tipo \"é o melhor pois...\" pro 1º colocado",
    "e comparando com os de cima pros demais (ex.: \"fica atrás do 1º por ter mais km...\").",
    "Use 'id' EXATAMENTE como veio no input. Não invente dados que não foram informados.",
    "",
    "CARROS:",
    JSON.stringify(cars),
  ].join("\n");
}

function buildMetricsPrompt(cars: ReturnType<typeof carSummary>[]): string {
  return [
    "Para CADA carro abaixo (marca/modelo/versão/ano/motor), estime métricas técnicas",
    "TÍPICAS de fábrica para essa versão específica, usando seu conhecimento geral sobre",
    "o modelo (não há descrição de anúncio aqui, então não invente estado de conservação).",
    "Responda SOMENTE com um objeto JSON válido, no formato:",
    '{ "metrics": [ {',
    '  "id": string,',
    '  "consumoCidadeGasolina": number|null,   // km/l, cidade, gasolina',
    '  "consumoEstradaGasolina": number|null,  // km/l, estrada, gasolina',
    '  "consumoCidadeAlcool": number|null,     // km/l, cidade, etanol (null se não for flex)',
    '  "consumoEstradaAlcool": number|null,    // km/l, estrada, etanol (null se não for flex)',
    '  "potenciaCv": number|null,              // cavalos (gasolina; se flex, use o maior)',
    '  "pesoKg": number|null,                  // peso em ordem de marcha, kg',
    '  "nota": string|null                     // 1 frase: ressalva/observação, se houver',
    "} ] }",
    "Use 'id' EXATAMENTE como veio no input. Se não souber a versão com confiança, responda",
    "os campos numéricos como null em vez de chutar — não invente números sem base nenhuma.",
    "",
    "CARROS:",
    JSON.stringify(cars),
  ].join("\n");
}

function extractJsonArray(content: string, ...keys: string[]): { value: unknown[] | null; raw: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { value: null, raw: content };
  }
  if (Array.isArray(parsed)) return { value: parsed, raw: null };
  for (const key of keys) {
    const value = (parsed as Record<string, unknown> | null)?.[key];
    if (Array.isArray(value)) return { value, raw: null };
  }
  return { value: null, raw: content };
}

export class AiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "AiError";
  }
}

async function callAi(messages: Array<{ role: string; content: string }>): Promise<{ content: string; usage: unknown }> {
  const { def, cfg } = await activeProviderConfig();
  if (!cfg.apiKey) {
    throw new AiError(`Chave da ${def.label} não configurada. Adicione em Config → Chaves de IA.`, 500);
  }

  let upstream: Response;
  try {
    upstream = await fetch(cfg.apiUrl, {
      signal: AbortSignal.any([AbortSignal.timeout(cfg.timeoutMs), cancelSignal()]),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        stream: false,
        response_format: { type: "json_object" },
        messages,
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new AiError(
      timedOut
        ? `A ${def.label} não concluiu a resposta em ${cfg.timeoutMs / 1000} segundos. Aguarde e tente novamente.`
        : `Não foi possível conectar à ${def.label}. Verifique a conexão e tente novamente.`,
      timedOut ? 504 : 502,
      timedOut ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
    );
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
    error?: { message?: string };
  };

  if (!upstream.ok) {
    const byStatus: Record<number, string> = {
      401: `Chave da ${def.label} inválida. Confira em Config → Chaves de IA e tente de novo.`,
      402: `Saldo insuficiente na ${def.label}. Recarregue a conta para continuar.`,
      403: `Acesso à ${def.label} negado. Confira as permissões da sua chave.`,
      429: `A ${def.label} recebeu muitas solicitações. Aguarde um pouco e tente novamente.`,
    };
    const detail = byStatus[upstream.status] ?? data?.error?.message ?? `O serviço ${def.label} está indisponível. Tente novamente em instantes.`;
    throw new AiError(detail, upstream.status);
  }

  return { content: data?.choices?.[0]?.message?.content ?? "", usage: data?.usage ?? null };
}

export async function analyzeSections(sections: AiSection[]): Promise<{
  categorias: unknown[] | null;
  raw: string | null;
  usage: unknown;
}> {
  if (sections.length === 0) return { categorias: [], raw: null, usage: null };
  const result = await callAi([
    { role: "system", content: "Você categoriza anúncios de veículos e responde apenas com JSON válido." },
    { role: "user", content: buildPrompt(sections) },
  ]);
  const { value: categorias, raw } = extractJsonArray(result.content, "anuncios", "data", "items");
  if (!categorias) {
    throw new AiError("A IA retornou uma resposta inválida. Tente analisar menos anúncios por vez.", 502);
  }
  return { categorias, raw, usage: result.usage };
}

export async function compareCars(cars: CarInput[]): Promise<{ ranking: unknown[] | null; raw: string | null }> {
  const normalized = normalizeCars(cars);
  if (!normalized) throw new AiError("envie ao menos 2 carros para comparar", 400);
  const result = await callAi([
    { role: "system", content: "Você compara carros anunciados e responde apenas com JSON válido." },
    { role: "user", content: buildComparePrompt(normalized) },
  ]);
  const { value: ranking, raw } = extractJsonArray(result.content, "ranking", "data", "items");
  if (!ranking) throw new AiError("A IA retornou uma resposta inválida.", 502);
  return { ranking, raw };
}

export async function carMetrics(cars: CarInput[]): Promise<{ metrics: unknown[] | null; raw: string | null }> {
  const normalized = cars.slice(0, 6).map(carSummary);
  if (normalized.length === 0) throw new AiError("envie ao menos 1 carro", 400);
  const result = await callAi([
    { role: "system", content: "Você estima especificações técnicas de carros e responde apenas com JSON válido." },
    { role: "user", content: buildMetricsPrompt(normalized) },
  ]);
  const { value: metrics, raw } = extractJsonArray(result.content, "metrics", "data", "items");
  if (!metrics) throw new AiError("A IA retornou uma resposta inválida.", 502);
  return { metrics, raw };
}
