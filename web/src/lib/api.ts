// Camada de API única. Nada no painel fala com o background da extensão sem
// passar por aqui. O painel roda como página da própria extensão
// (chrome-extension://.../panel/index.html), então tudo é chrome.runtime.sendMessage
// pro service worker em vez de fetch HTTP — sem proxy, sem servidor local.

import type {
  AiConfig,
  AiProviderId,
  CarMetric,
  CompareRankingItem,
  Db,
  DbRecord,
} from "@/types";

/** Resumo de um carro mandado em /compare e /metrics — não reenvia o registro inteiro. */
export interface CompareCarInput {
  id: string;
  titulo?: string | null;
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
  score?: number | null;
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

async function send<T extends Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  let response: (T & { ok: boolean; error?: string }) | undefined;
  try {
    response = (await chrome.runtime.sendMessage({ action, ...extra })) as (T & { ok: boolean; error?: string }) | undefined;
  } catch {
    throw new ApiError("A comunicação com a extensão foi interrompida. Recarregue o painel e tente novamente.", "offline");
  }
  if (!response) {
    throw new ApiError("A extensão não respondeu. Recarregue o painel e tente novamente.", "offline");
  }
  if (!response.ok) {
    throw new ApiError(response.error ?? "Falha desconhecida", "http");
  }
  return response;
}

export const api = {
  async getConfig(): Promise<AiConfig> {
    const r = await send<{ config: AiConfig }>("getAiConfig");
    return r.config;
  },

  /** Troca o provedor ativo (DeepSeek/OpenAI). */
  async setActiveProvider(provider: AiProviderId): Promise<AiConfig> {
    const r = await send<{ config: AiConfig }>("setAiProvider", { provider });
    return r.config;
  },

  /** Campos omitidos/vazios mantêm o valor atual (a chave nunca é apagada à toa). */
  async updateProviderConfig(
    provider: AiProviderId,
    patch: { apiUrl?: string; model?: string; timeoutMs?: number; apiKey?: string },
  ): Promise<AiConfig> {
    const r = await send<{ config: AiConfig }>("updateAiProviderConfig", { provider, patch });
    return r.config;
  },

  async getDb(): Promise<Db> {
    const r = await send<{ db: Db }>("getDb");
    return r.db ?? {};
  },

  /** Merge por id no armazenamento da extensão. */
  async mergeRecord(record: Partial<DbRecord> & { id: string }): Promise<Db> {
    const r = await send<{ db: Db }>("importDb", { db: { [record.id]: record } });
    return r.db ?? {};
  },

  async removeRecord(id: string): Promise<Db> {
    const r = await send<{ db: Db }>("removeRecord", { id });
    return r.db ?? {};
  },

  async clearDb(): Promise<void> {
    await send("clearDb");
  },

  /** Importa um db.json exportado anteriormente (merge por id). */
  async importDb(db: Db): Promise<Db> {
    const r = await send<{ db: Db }>("importDb", { db });
    return r.db ?? {};
  },

  /** Reanálise da IA para uma ou mais seções. Devolve categorias[] alinhadas por index. */
  async analyze(sections: unknown[]): Promise<{
    ok: boolean;
    categorias: Array<Record<string, unknown>> | null;
    raw: string | null;
    usage: unknown;
  }> {
    return send("aiAnalyze", { sections });
  },

  /** "Comparar com IA": ranking do melhor pro pior, com uma frase de justificativa cada. */
  async compareCars(cars: CompareCarInput[]): Promise<{
    ok: boolean;
    ranking: CompareRankingItem[] | null;
    raw: string | null;
  }> {
    return send("aiCompare", { cars });
  },

  /** "Exibir métricas": consumo álcool/gasolina, cv e peso estimados pela IA (conhecimento geral do modelo). */
  async carMetrics(cars: CompareCarInput[]): Promise<{
    ok: boolean;
    metrics: CarMetric[] | null;
    raw: string | null;
  }> {
    return send("aiMetrics", { cars });
  },
};
