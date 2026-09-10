/**
 * Proxy local do OLX Workspace.
 *
 * A extensão manda os dados já extraídos das <section class="olx-adcard"> para
 * cá; este servidor injeta a chave DeepSeek (lida de proxy/.env) e encaminha
 * para a API. A chave nunca sai da sua máquina nem entra no bundle da extensão.
 *
 * Rotas:
 *   GET    /health   -> status + se a chave está configurada
 *   POST   /analyze  -> { sections: AdCard[] }  ->  { ok, categorias, raw, usage }
 *   GET    /db       -> { ok, db }              (conteúdo de <raiz>/db.json)
 *   POST   /db       -> { records:[{id,...}] } | { id, record } | { db:{...} }
 *                       faz merge por id, grava em <raiz>/db.json, devolve { ok, db }
 *   DELETE /db       -> zera <raiz>/db.json     -> { ok, db:{} }
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

loadEnv(join(HERE, ".env"));

const PORT = Number(process.env.PROXY_PORT ?? 8787);
const API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const API_URL = process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

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
    '  "carroceria": string|null       // "SUV", "Hatch", "Sedã", "Picape", etc.',
    "} ] }",
    "Use null quando o dado não aparecer. Não invente. Mantenha 'index' igual ao do input.",
    "Em 'tipo' use \"carro\" para automóveis de passeio (hatch, sedã, SUV, picape leve).",
    "Se houver o campo 'description', use-o também como fonte.",
    "",
    "ANÚNCIOS:",
    JSON.stringify(sections, null, 2),
  ].join("\n");
}

function extractCategorias(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { categorias: null, raw: content };
  }
  const categorias = Array.isArray(parsed)
    ? parsed
    : (parsed.anuncios ?? parsed.data ?? parsed.items ?? null);
  return Array.isArray(categorias) ? { categorias, raw: null } : { categorias: null, raw: content };
}

async function handleAnalyze(req, res) {
  if (!API_KEY) {
    return sendJSON(res, 500, { ok: false, error: "DEEPSEEK_API_KEY ausente em proxy/.env" });
  }

  let sections;
  try {
    const parsed = JSON.parse(await readBody(req));
    sections = Array.isArray(parsed) ? parsed : parsed?.sections;
    if (!Array.isArray(sections)) throw new Error("esperado um array em 'sections'");
  } catch (err) {
    return sendJSON(res, 400, { ok: false, error: `JSON inválido: ${err.message}` });
  }

  if (sections.length === 0) {
    return sendJSON(res, 200, { ok: true, model: MODEL, count: 0, categorias: [] });
  }

  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Você categoriza anúncios de veículos e responde apenas com JSON válido.",
          },
          { role: "user", content: buildPrompt(sections) },
        ],
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = data?.error?.message ?? `DeepSeek HTTP ${upstream.status}`;
      return sendJSON(res, upstream.status, { ok: false, error: detail });
    }

    const content = data?.choices?.[0]?.message?.content ?? "";
    const { categorias, raw } = extractCategorias(content);

    return sendJSON(res, 200, {
      ok: true,
      model: MODEL,
      count: sections.length,
      categorias,
      raw,
      usage: data?.usage ?? null,
    });
  } catch (err) {
    return sendJSON(res, 502, { ok: false, error: `Falha ao chamar DeepSeek: ${err.message}` });
  }
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

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    return sendJSON(res, 200, {
      ok: true,
      hasKey: Boolean(API_KEY),
      model: MODEL,
      port: PORT,
      dbPath: DB_PATH,
    });
  }
  if (req.method === "POST" && req.url === "/analyze") {
    return void handleAnalyze(req, res);
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
  if (req.method === "DELETE" && req.url === "/db") {
    try {
      writeDb({});
      return sendJSON(res, 200, { ok: true, db: {} });
    } catch (err) {
      return sendJSON(res, 500, { ok: false, error: `Falha ao limpar db.json: ${err.message}` });
    }
  }
  sendJSON(res, 404, { ok: false, error: "Rotas: GET /health, POST /analyze, GET|POST|DELETE /db" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[OLX Workspace] proxy em http://localhost:${PORT}`);
  console.log(`  POST /analyze          -> DeepSeek (${MODEL})`);
  console.log(`  GET|POST|DELETE /db    -> ${DB_PATH}`);
  console.log(`  GET  /health`);
  if (!API_KEY) console.warn("  AVISO: defina DEEPSEEK_API_KEY em proxy/.env");
});
