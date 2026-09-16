/**
 * Proxy local do OLX Workspace.
 *
 * A extensão manda os dados já extraídos das <section class="olx-adcard"> para
 * cá; este servidor injeta a chave da IA (lida de proxy/.env) e encaminha para
 * a API. A chave nunca sai da sua máquina nem entra no bundle da extensão.
 *
 * Suporta mais de um provedor de IA (DeepSeek, OpenAI — ambos falam a mesma
 * API "chat/completions" no formato OpenAI). Um fica "ativo" por vez; o painel
 * troca entre eles em runtime, sem reiniciar o proxy.
 *
 * Rotas:
 *   GET    /health   -> status + se a chave do provedor ativo está configurada
 *   GET    /config   -> provedor ativo + configuração de cada um (chave mascarada)
 *   POST   /config   -> troca o provedor ativo e/ou atualiza apiUrl/model/timeoutMs/apiKey
 *                       de um provedor específico; grava em proxy/.env
 *   POST   /analyze  -> { sections: AdCard[] }  ->  { ok, categorias, raw, usage }
 *   POST   /compare  -> { cars: CarInfo[] }     ->  { ok, ranking, raw, usage } (comparador)
 *   POST   /metrics  -> { cars: CarInfo[] }     ->  { ok, metrics, raw, usage } (consumo/cv/peso)
 *   GET    /db       -> { ok, db }              (conteúdo de <raiz>/db.json)
 *   POST   /db       -> { records:[{id,...}] } | { id, record } | { db:{...} }
 *                       faz merge por id, grava em <raiz>/db.json, devolve { ok, db }
 *   DELETE /db       -> zera <raiz>/db.json     -> { ok, db:{} }
 *   GET    /img?u=   -> baixa a imagem do OLX no servidor e devolve os bytes.
 *                       Contorna adblock / bloqueio de terceiros no navegador
 *                       (o painel só precisa falar com localhost).
 *
 * Requisitos: Node >= 18.17 (usa fetch global). Sem dependências externas.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Arquivo JSON usado como "banco" — fica na RAIZ do projeto. */
const DB_PATH = join(HERE, "..", "db.json");

function readDb() {
  try {
    const raw = readFileSync(DB_PATH, "utf8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

/** Escrita atômica: grava num .tmp e renomeia por cima. */
function writeDb(obj) {
  const tmp = `${DB_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, DB_PATH);
}

/** Parser mínimo de .env (sem dependências). Não sobrescreve variáveis já definidas. */
function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    const key = match[1];
    let value = (match[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const ENV_PATH = join(HERE, ".env");
loadEnv(ENV_PATH);

const PORT = Number(process.env.PROXY_PORT ?? 8787);

function clampTimeout(ms) {
  return Number.isFinite(ms) ? Math.min(300_000, Math.max(10_000, ms)) : 180_000;
}

/** Um provedor por prefixo de env var. Ambos falam o formato "chat/completions" da OpenAI. */
const PROVIDER_DEFS = {
  deepseek: { label: "DeepSeek", envPrefix: "DEEPSEEK", defaultApiUrl: "https://api.deepseek.com/chat/completions", defaultModel: "deepseek-flash" },
  openai: { label: "OpenAI", envPrefix: "OPENAI", defaultApiUrl: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" },
};
const PROVIDER_IDS = Object.keys(PROVIDER_DEFS);

/** Config de cada provedor: mutável em runtime via POST /config (persistida em proxy/.env). */
const providers = Object.fromEntries(
  PROVIDER_IDS.map((id) => {
    const def = PROVIDER_DEFS[id];
    return [id, {
      apiUrl: process.env[`${def.envPrefix}_API_URL`] ?? def.defaultApiUrl,
      apiKey: process.env[`${def.envPrefix}_API_KEY`] ?? "",
      model: process.env[`${def.envPrefix}_MODEL`] ?? def.defaultModel,
      timeoutMs: clampTimeout(Number(process.env[`${def.envPrefix}_TIMEOUT_MS`] ?? 180_000)),
    }];
  }),
);

/** Provedor ativo (usado por /analyze e /health). Trocável via POST /config { provider }. */
let ACTIVE_PROVIDER = PROVIDER_IDS.includes(process.env.AI_PROVIDER?.trim().toLowerCase())
  ? process.env.AI_PROVIDER.trim().toLowerCase()
  : "deepseek";

function activeConfig() {
  return providers[ACTIVE_PROVIDER];
}

/** Mostra só os últimos 4 caracteres da chave, pra confirmar qual está ativa sem expor tudo. */
function maskKey(key) {
  if (!key) return null;
  return key.length <= 4 ? "•".repeat(key.length) : `${"•".repeat(Math.min(8, key.length - 4))}${key.slice(-4)}`;
}

function configSnapshot() {
  return {
    provider: ACTIVE_PROVIDER,
    providers: Object.fromEntries(
      PROVIDER_IDS.map((id) => {
        const c = providers[id];
        return [id, {
          label: PROVIDER_DEFS[id].label,
          apiUrl: c.apiUrl,
          model: c.model,
          timeoutMs: c.timeoutMs,
          hasKey: Boolean(c.apiKey),
          keyPreview: maskKey(c.apiKey),
        }];
      }),
    ),
  };
}

/**
 * Atualiza variáveis em proxy/.env, preservando as demais linhas (inclusive
 * comentários). Reescreve a chave se já existir, senão acrescenta.
 */
function persistEnv(updates) {
  let raw = "";
  try {
    raw = readFileSync(ENV_PATH, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const lines = raw.length ? raw.split(/\r?\n/) : [];
  const pending = new Map(Object.entries(updates));
  const next = lines.map((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=/);
    if (match && pending.has(match[1])) {
      const key = match[1];
      const value = pending.get(key);
      pending.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  while (next.length && next[next.length - 1] === "") next.pop();
  for (const [key, value] of pending) next.push(`${key}=${value}`);
  writeFileSync(ENV_PATH, `${next.join("\n")}\n`, "utf8");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJSON(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function buildPrompt(sections) {
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
    JSON.stringify(sections.map((section, index) => ({
      index: section.index ?? index,
      title: section.title,
      description: section.description,
      details: section.details,
      km: section.km ?? null,
    }))),
  ].join("\n");
}

function extractJsonArray(content, ...keys) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { value: null, raw: content };
  }
  if (Array.isArray(parsed)) return { value: parsed, raw: null };
  for (const key of keys) {
    if (Array.isArray(parsed?.[key])) return { value: parsed[key], raw: null };
  }
  return { value: null, raw: content };
}

/**
 * Chama o provedor de IA ativo (DeepSeek/OpenAI — mesmo formato "chat/completions")
 * com uma lista de `messages` e devolve o texto da resposta já extraído. Concentra
 * timeout, erros de rede/HTTP e mensagens de erro amigáveis num só lugar — usado por
 * /analyze, /compare e /metrics.
 */
async function callAi(messages, { label = "ia" } = {}) {
  const providerId = ACTIVE_PROVIDER;
  const def = PROVIDER_DEFS[providerId];
  const cfg = activeConfig();
  if (!cfg.apiKey) {
    return { ok: false, status: 500, error: `${def.envPrefix}_API_KEY ausente em proxy/.env (provedor ativo: ${def.label})` };
  }

  const started = Date.now();
  let phase = "awaiting_headers";
  console.info(`[${label}] início: provedor=${providerId}, modelo=${cfg.model}, limite=${cfg.timeoutMs}ms`);
  try {
    const upstream = await fetch(cfg.apiUrl, {
      signal: AbortSignal.timeout(cfg.timeoutMs),
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

    phase = "reading_response";
    const data = await upstream.json().catch((err) => {
      if (err.name === "TimeoutError" || err.name === "AbortError") throw err;
      return {};
    });
    if (!upstream.ok) {
      const apiMsg = data?.error?.message;
      const detail = ({
        401: `Chave da ${def.label} inválida. Confira ${def.envPrefix}_API_KEY em proxy/.env e tente de novo.`,
        402: `Saldo insuficiente na ${def.label}. Recarregue a conta para continuar.`,
        403: `Acesso à ${def.label} negado. Confira as permissões da sua chave.`,
        429: `A ${def.label} recebeu muitas solicitações. Aguarde um pouco e tente novamente.`,
      })[upstream.status] ?? apiMsg ?? `O serviço ${def.label} está indisponível. Tente novamente em instantes.`;
      return { ok: false, status: upstream.status, error: detail };
    }

    return {
      ok: true,
      provider: providerId,
      model: cfg.model,
      content: data?.choices?.[0]?.message?.content ?? "",
      usage: data?.usage ?? null,
    };
  } catch (err) {
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    console.error(`[${label}] falha: fase=${phase}, duração=${Date.now() - started}ms, tipo=${err.name}, causa=${err.cause?.code ?? "nenhuma"}`);
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      code: timedOut ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
      phase,
      elapsedMs: Date.now() - started,
      error: timedOut
        ? `A ${def.label} não concluiu a resposta em ${cfg.timeoutMs / 1000} segundos. Pode haver lentidão no serviço ou na conexão. Aguarde e tente novamente.`
        : `Não foi possível conectar à ${def.label}. Verifique a conexão e tente novamente.`,
    };
  }
}

async function handleAnalyze(req, res) {
  let sections;
  try {
    const parsed = JSON.parse(await readBody(req));
    sections = Array.isArray(parsed) ? parsed : parsed?.sections;
    if (!Array.isArray(sections)) throw new Error("esperado um array em 'sections'");
  } catch (err) {
    return sendJSON(res, 400, { ok: false, error: `JSON inválido: ${err.message}` });
  }

  if (sections.length === 0) {
    return sendJSON(res, 200, { ok: true, provider: ACTIVE_PROVIDER, model: activeConfig().model, count: 0, categorias: [] });
  }

  const result = await callAi(
    [
      { role: "system", content: "Você categoriza anúncios de veículos e responde apenas com JSON válido." },
      { role: "user", content: buildPrompt(sections) },
    ],
    { label: "analyze" },
  );
  if (!result.ok) {
    return sendJSON(res, result.status, { ok: false, code: result.code, phase: result.phase, elapsedMs: result.elapsedMs, error: result.error });
  }

  const { value: categorias, raw } = extractJsonArray(result.content, "anuncios", "data", "items");
  if (!categorias) {
    return sendJSON(res, 502, { ok: false, error: "A IA retornou uma resposta inválida. Tente analisar menos anúncios por vez." });
  }

  return sendJSON(res, 200, {
    ok: true,
    provider: result.provider,
    model: result.model,
    count: sections.length,
    categorias,
    raw,
    usage: result.usage,
  });
}

/** Resumo enxuto de um carro pra mandar pro prompt (evita reenviar o registro inteiro). */
function carSummary(car) {
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

function normalizeCars(body) {
  const cars = Array.isArray(body?.cars) ? body.cars : null;
  if (!cars || cars.length < 2) return null;
  return cars.slice(0, 6).map(carSummary);
}

function buildComparePrompt(cars) {
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

function buildMetricsPrompt(cars) {
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

async function handleCompare(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJSON(res, 400, { ok: false, error: `JSON inválido: ${err.message}` });
  }
  const cars = normalizeCars(payload);
  if (!cars) return sendJSON(res, 400, { ok: false, error: "envie { cars: [...] } com pelo menos 2 carros" });

  const result = await callAi(
    [
      { role: "system", content: "Você compara carros anunciados e responde apenas com JSON válido." },
      { role: "user", content: buildComparePrompt(cars) },
    ],
    { label: "compare" },
  );
  if (!result.ok) {
    return sendJSON(res, result.status, { ok: false, code: result.code, error: result.error });
  }

  const { value: ranking, raw } = extractJsonArray(result.content, "ranking", "data", "items");
  if (!ranking) {
    return sendJSON(res, 502, { ok: false, error: "A IA retornou uma resposta inválida." });
  }
  return sendJSON(res, 200, { ok: true, provider: result.provider, model: result.model, ranking, raw, usage: result.usage });
}

async function handleMetrics(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJSON(res, 400, { ok: false, error: `JSON inválido: ${err.message}` });
  }
  const cars = Array.isArray(payload?.cars) ? payload.cars.slice(0, 6).map(carSummary) : null;
  if (!cars || cars.length === 0) return sendJSON(res, 400, { ok: false, error: "envie { cars: [...] } com pelo menos 1 carro" });

  const result = await callAi(
    [
      { role: "system", content: "Você estima especificações técnicas de carros e responde apenas com JSON válido." },
      { role: "user", content: buildMetricsPrompt(cars) },
    ],
    { label: "metrics" },
  );
  if (!result.ok) {
    return sendJSON(res, result.status, { ok: false, code: result.code, error: result.error });
  }

  const { value: metrics, raw } = extractJsonArray(result.content, "metrics", "data", "items");
  if (!metrics) {
    return sendJSON(res, 502, { ok: false, error: "A IA retornou uma resposta inválida." });
  }
  return sendJSON(res, 200, { ok: true, provider: result.provider, model: result.model, metrics, raw, usage: result.usage });
}

/**
 * POST /config — body: { provider?: "deepseek"|"openai", deepseek?: {...}, openai?: {...} }
 * onde cada bloco de provedor aceita { apiUrl?, model?, timeoutMs?, apiKey? }.
 * `provider` troca o provedor ativo. Campos omitidos ou vazios mantêm o valor
 * atual (a chave nunca é apagada por engano só por deixar o campo em branco no
 * front). Tudo é persistido em proxy/.env.
 */
async function handleConfigWrite(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJSON(res, 400, { ok: false, error: `JSON inválido: ${err.message}` });
  }

  const updates = {};

  for (const id of PROVIDER_IDS) {
    const patch = payload?.[id];
    if (!patch || typeof patch !== "object") continue;
    const def = PROVIDER_DEFS[id];
    const cfg = providers[id];
    if (typeof patch.apiUrl === "string" && patch.apiUrl.trim()) {
      cfg.apiUrl = patch.apiUrl.trim();
      updates[`${def.envPrefix}_API_URL`] = cfg.apiUrl;
    }
    if (typeof patch.model === "string" && patch.model.trim()) {
      cfg.model = patch.model.trim();
      updates[`${def.envPrefix}_MODEL`] = cfg.model;
    }
    if (patch.timeoutMs !== undefined && patch.timeoutMs !== null && patch.timeoutMs !== "") {
      cfg.timeoutMs = clampTimeout(Number(patch.timeoutMs));
      updates[`${def.envPrefix}_TIMEOUT_MS`] = String(cfg.timeoutMs);
    }
    if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
      cfg.apiKey = patch.apiKey.trim();
      updates[`${def.envPrefix}_API_KEY`] = cfg.apiKey;
    }
  }

  if (typeof payload?.provider === "string") {
    const id = payload.provider.trim().toLowerCase();
    if (!PROVIDER_IDS.includes(id)) {
      return sendJSON(res, 400, { ok: false, error: `provider inválido: ${payload.provider}` });
    }
    ACTIVE_PROVIDER = id;
    updates.AI_PROVIDER = id;
  }

  try {
    if (Object.keys(updates).length) persistEnv(updates);
  } catch (err) {
    return sendJSON(res, 500, { ok: false, error: `Falha ao gravar proxy/.env: ${err.message}` });
  }
  return sendJSON(res, 200, { ok: true, config: configSnapshot() });
}

async function handleDbWrite(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJSON(res, 400, { ok: false, error: `JSON inválido: ${err.message}` });
  }

  const db = readDb();
  let records = [];
  if (Array.isArray(payload?.records)) records = payload.records;
  else if (payload?.id) records = [{ id: payload.id, ...(payload.record ?? {}) }];
  else if (payload?.db && typeof payload.db === "object") records = Object.values(payload.db);
  else return sendJSON(res, 400, { ok: false, error: "envie { records:[...] } ou { id, record } ou { db }" });

  for (const rec of records) {
    if (!rec || typeof rec !== "object" || !rec.id) continue;
    const id = String(rec.id);
    db[id] = { ...(db[id] ?? {}), ...rec, id, savedAt: new Date().toISOString() };
  }

  try {
    writeDb(db);
  } catch (err) {
    return sendJSON(res, 500, { ok: false, error: `Falha ao gravar db.json: ${err.message}` });
  }
  return sendJSON(res, 200, { ok: true, count: Object.keys(db).length, db });
}

/**
 * GET /img?u=<url> — baixa a imagem no servidor e devolve os bytes.
 * Só aceita host `*.olx.com.br` em https. Serve pra quando o navegador não
 * carrega `img.olx.com.br` direto (adblock, proteção anti-rastreio, DNS, etc.):
 * o painel passa a pedir a imagem só pro localhost.
 */
async function handleImg(req, res) {
  const raw = new URL(req.url, "http://localhost").searchParams.get("u");
  if (!raw) return sendJSON(res, 400, { ok: false, error: "faltou o parâmetro ?u=" });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return sendJSON(res, 400, { ok: false, error: "URL inválida em ?u=" });
  }
  if (target.protocol !== "https:" || !/(^|\.)olx\.com\.br$/i.test(target.hostname)) {
    return sendJSON(res, 400, { ok: false, error: "só imagens https de *.olx.com.br" });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        Referer: "https://www.olx.com.br/",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });
    if (!upstream.ok || !upstream.body) {
      res.writeHead(upstream.status || 502, CORS);
      return res.end();
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=604800",
      ...CORS,
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", ...CORS });
    res.end(`Falha ao baixar imagem: ${err.message}`);
  }
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    const cfg = activeConfig();
    return sendJSON(res, 200, {
      ok: true,
      hasKey: Boolean(cfg.apiKey),
      model: cfg.model,
      provider: ACTIVE_PROVIDER,
      port: PORT,
      dbPath: DB_PATH,
    });
  }
  if (req.method === "GET" && req.url === "/config") {
    return sendJSON(res, 200, { ok: true, config: configSnapshot() });
  }
  if (req.method === "POST" && req.url === "/config") {
    return void handleConfigWrite(req, res);
  }
  if (req.method === "POST" && req.url === "/analyze") {
    return void handleAnalyze(req, res);
  }
  if (req.method === "POST" && req.url === "/compare") {
    return void handleCompare(req, res);
  }
  if (req.method === "POST" && req.url === "/metrics") {
    return void handleMetrics(req, res);
  }
  if (req.method === "GET" && req.url === "/db") {
    try {
      return sendJSON(res, 200, { ok: true, db: readDb() });
    } catch (err) {
      return sendJSON(res, 500, { ok: false, error: `Falha ao ler db.json: ${err.message}` });
    }
  }
  if (req.method === "POST" && req.url === "/db") {
    return void handleDbWrite(req, res);
  }
  if (req.method === "GET" && req.url.startsWith("/img")) {
    return void handleImg(req, res);
  }
  if (req.method === "DELETE" && req.url === "/db") {
    try {
      writeDb({});
      return sendJSON(res, 200, { ok: true, db: {} });
    } catch (err) {
      return sendJSON(res, 500, { ok: false, error: `Falha ao limpar db.json: ${err.message}` });
    }
  }
  sendJSON(res, 404, {
    ok: false,
    error: "Rotas: GET /health, GET|POST /config, POST /analyze, POST /compare, POST /metrics, GET|POST|DELETE /db, GET /img?u=",
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const cfg = activeConfig();
  console.log(`[OLX Workspace] proxy em http://localhost:${PORT}`);
  console.log(`  POST /analyze          -> ${PROVIDER_DEFS[ACTIVE_PROVIDER].label} (${cfg.model})`);
  console.log(`  GET|POST|DELETE /db    -> ${DB_PATH}`);
  console.log(`  GET  /img?u=<url>      -> imagem do OLX (proxy)`);
  console.log(`  GET  /health`);
  console.log(`  GET|POST /config       -> provedores: ${PROVIDER_IDS.join(", ")} (ativo: ${ACTIVE_PROVIDER})`);
  if (!cfg.apiKey) console.warn(`  AVISO: defina ${PROVIDER_DEFS[ACTIVE_PROVIDER].envPrefix}_API_KEY em proxy/.env`);
});
