/**
 * Proxy local do OLX Workspace.
 *
 * A extensão manda os dados já extraídos das <section class="olx-adcard"> para
 * cá; este servidor injeta a chave DeepSeek (lida de proxy/.env) e encaminha
 * para a API. A chave nunca sai da sua máquina nem entra no bundle da extensão.
 *
 * Rotas:
 *   GET  /health   -> status + se a chave está configurada
 *   POST /analyze  -> { sections: AdCard[] }  ->  { ok, analysis, usage }
 *
 * Requisitos: Node >= 18.17 (usa fetch global). Sem dependências externas.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    "Responda SOMENTE com um objeto JSON válido, sem texto fora do JSON, no formato:",
    '{ "anuncios": [ {',
    '  "index": number,',
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

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    return sendJSON(res, 200, { ok: true, hasKey: Boolean(API_KEY), model: MODEL, port: PORT });
  }
  if (req.method === "POST" && req.url === "/analyze") {
    return void handleAnalyze(req, res);
  }
  sendJSON(res, 404, { ok: false, error: "Use GET /health ou POST /analyze" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[OLX Workspace] proxy em http://localhost:${PORT}`);
  console.log(`  POST /analyze  -> DeepSeek (${MODEL})`);
  console.log(`  GET  /health`);
  if (!API_KEY) console.warn("  AVISO: defina DEEPSEEK_API_KEY em proxy/.env");
});
