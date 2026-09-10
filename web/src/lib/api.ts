// Camada de API única. Nada no painel fala com o proxy sem passar por aqui.
//
// Proxy local (proxy/server.mjs):
//   GET    /health  -> { ok, hasKey, model, port, dbPath }
//   POST   /analyze -> { sections:[...] } => { ok, categorias, raw, usage }
//   GET    /db      -> { ok, db: { [id]: DbRecord } }
//   POST   /db      -> { id, record } | { records:[...] } | { db:{...} }  (merge por id)
//   DELETE /db      -> zera o db

import type { Db, DbRecord, HealthResponse } from "@/types";

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
    readonly kind: "offline" | "http" | "payload",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getProxyUrl();
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(`Proxy offline em ${base}`, "offline");
  }
  const text = await res.text();
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
