// Camada de API única. Nada no painel fala com o proxy sem passar por aqui.
//
// Proxy local (proxy/server.mjs):
//   GET    /health  -> { ok, hasKey, model, provider, port, dbPath }
//   GET    /config  -> { ok, config: AiConfig }  (provedor ativo + config de cada provedor)
//   POST   /config  -> { provider?, deepseek?: {...}, openai?: {...} } => { ok, config: AiConfig }
//                       cada bloco de provedor aceita { apiUrl?, model?, timeoutMs?, apiKey? }
//   POST   /analyze -> { sections:[...] } => { ok, categorias, raw, usage }  (usa o provedor ativo)
//   GET    /db      -> { ok, db: { [id]: DbRecord } }
//   POST   /db      -> { id, record } | { records:[...] } | { db:{...} }  (merge por id)
//   DELETE /db      -> zera o db

import type { AiConfig, AiProviderId, Db, DbRecord, HealthResponse } from "@/types";

const DEFAULT_BASE = "http://localhost:8787";
const LS_KEY = "olx.proxyUrl";

export function getProxyUrl(): string {
  try {
    return localStorage.getItem(LS_KEY)?.trim() || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function setProxyUrl(url: string): void {
  try {
    const v = url.trim().replace(/\/+$/, "");
    if (v) localStorage.setItem(LS_KEY, v);
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignora storage indisponível */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "offline" | "http" | "payload" | "timeout",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getProxyUrl();
  let res: Response;
  let text: string;
  try {
    res = await fetch(base + path, {
      ...init,
      signal: AbortSignal.timeout(path === "/analyze" ? 310_000 : 15_000),
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    text = await res.text();
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ApiError("O tempo de espera foi excedido. Tente novamente; para análises, reduza a quantidade de anúncios.", "timeout");
    }
    throw new ApiError(`Não foi possível conectar ao proxy em ${base}. Verifique se ele está em execução.`, "offline");
  }
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("Resposta do proxy não é JSON", "payload", res.status);
    }
  }
  if (!res.ok) {
    const msg =
      (body as { error?: string } | null)?.error ?? `HTTP ${res.status} em ${path}`;
    throw new ApiError(msg, "http", res.status);
  }
  return body as T;
}

export const api = {
  async health(): Promise<HealthResponse> {
    return request<HealthResponse>("/health");
  },

  async getConfig(): Promise<AiConfig> {
    const r = await request<{ ok: boolean; config: AiConfig }>("/config");
    return r.config;
  },

  /** Troca o provedor ativo (DeepSeek/OpenAI). */
  async setActiveProvider(provider: AiProviderId): Promise<AiConfig> {
    const r = await request<{ ok: boolean; config: AiConfig }>("/config", {
      method: "POST",
      body: JSON.stringify({ provider }),
    });
    return r.config;
  },

  /** Campos omitidos/vazios mantêm o valor atual no proxy (a chave nunca é apagada à toa). */
  async updateProviderConfig(
    provider: AiProviderId,
    patch: { apiUrl?: string; model?: string; timeoutMs?: number; apiKey?: string },
  ): Promise<AiConfig> {
    const r = await request<{ ok: boolean; config: AiConfig }>("/config", {
      method: "POST",
      body: JSON.stringify({ [provider]: patch }),
    });
    return r.config;
  },

  async getDb(): Promise<Db> {
    const r = await request<{ ok: boolean; db: Db }>("/db");
    return r.db ?? {};
  },

  /** Merge por id no db.json. */
  async mergeRecord(record: Partial<DbRecord> & { id: string }): Promise<Db> {
    const r = await request<{ ok: boolean; db: Db }>("/db", {
      method: "POST",
      body: JSON.stringify({ id: record.id, record }),
    });
    return r.db ?? {};
  },

  async removeRecord(id: string): Promise<Db> {
    // O proxy não tem DELETE por id; lemos, removemos e regravamos o mapa inteiro.
    const db = await this.getDb();
    delete db[id];
    const r = await request<{ ok: boolean; db: Db }>("/db", {
      method: "POST",
      body: JSON.stringify({ db }),
    });
    return r.db ?? {};
  },

  async clearDb(): Promise<void> {
    await request<{ ok: boolean }>("/db", { method: "DELETE" });
  },

  /** Reanálise da IA para uma ou mais seções. Devolve categorias[] alinhadas por index. */
  async analyze(sections: unknown[]): Promise<{
    ok: boolean;
    categorias: Array<Record<string, unknown>> | null;
    raw: string | null;
    usage: unknown;
  }> {
    return request("/analyze", {
      method: "POST",
      body: JSON.stringify({ sections }),
    });
  },
};
