/** Config dos provedores de IA (substitui proxy/.env), guardada em chrome.storage.local. */

export type AiProviderId = "deepseek" | "openai";
export const PROVIDER_IDS: AiProviderId[] = ["deepseek", "openai"];

interface ProviderDef {
  label: string;
  defaultApiUrl: string;
  defaultModel: string;
}

export const PROVIDER_DEFS: Record<AiProviderId, ProviderDef> = {
  deepseek: { label: "DeepSeek", defaultApiUrl: "https://api.deepseek.com/chat/completions", defaultModel: "deepseek-flash" },
  openai: { label: "OpenAI", defaultApiUrl: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" },
};

export interface ProviderConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

interface StoredConfig {
  activeProvider: AiProviderId;
  providers: Record<AiProviderId, ProviderConfig>;
}

export interface AiProviderSnapshot {
  label: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keyPreview: string | null;
}

export interface AiConfigSnapshot {
  provider: AiProviderId;
  providers: Record<AiProviderId, AiProviderSnapshot>;
}

const STORAGE_KEY = "olx.aiConfig";

function clampTimeout(ms: number): number {
  return Number.isFinite(ms) ? Math.min(300_000, Math.max(10_000, ms)) : 180_000;
}

function defaults(): StoredConfig {
  return {
    activeProvider: "deepseek",
    providers: {
      deepseek: { apiUrl: PROVIDER_DEFS.deepseek.defaultApiUrl, apiKey: "", model: PROVIDER_DEFS.deepseek.defaultModel, timeoutMs: 180_000 },
      openai: { apiUrl: PROVIDER_DEFS.openai.defaultApiUrl, apiKey: "", model: PROVIDER_DEFS.openai.defaultModel, timeoutMs: 180_000 },
    },
  };
}

async function readStored(): Promise<StoredConfig> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stored = data[STORAGE_KEY] as StoredConfig | undefined;
  if (!stored || typeof stored !== "object") return defaults();
  const base = defaults();
  return {
    activeProvider: PROVIDER_IDS.includes(stored.activeProvider) ? stored.activeProvider : base.activeProvider,
    providers: {
      deepseek: { ...base.providers.deepseek, ...(stored.providers?.deepseek ?? {}) },
      openai: { ...base.providers.openai, ...(stored.providers?.openai ?? {}) },
    },
  };
}

async function writeStored(config: StoredConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}

function maskKey(key: string): string | null {
  if (!key) return null;
  return key.length <= 4 ? "•".repeat(key.length) : `${"•".repeat(Math.min(8, key.length - 4))}${key.slice(-4)}`;
}

function snapshot(config: StoredConfig): AiConfigSnapshot {
  return {
    provider: config.activeProvider,
    providers: {
      deepseek: toSnapshot("deepseek", config.providers.deepseek),
      openai: toSnapshot("openai", config.providers.openai),
    },
  };
}

function toSnapshot(id: AiProviderId, cfg: ProviderConfig): AiProviderSnapshot {
  return {
    label: PROVIDER_DEFS[id].label,
    apiUrl: cfg.apiUrl,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    hasKey: Boolean(cfg.apiKey),
    keyPreview: maskKey(cfg.apiKey),
  };
}

export async function getConfig(): Promise<AiConfigSnapshot> {
  return snapshot(await readStored());
}

/** Config completa (com a apiKey em texto), usada só internamente pelo ai-client. */
export async function activeProviderConfig(): Promise<{ id: AiProviderId; def: ProviderDef; cfg: ProviderConfig }> {
  const stored = await readStored();
  return { id: stored.activeProvider, def: PROVIDER_DEFS[stored.activeProvider], cfg: stored.providers[stored.activeProvider] };
}

export async function setActiveProvider(provider: AiProviderId): Promise<AiConfigSnapshot> {
  if (!PROVIDER_IDS.includes(provider)) throw new Error(`provider inválido: ${provider}`);
  const stored = await readStored();
  stored.activeProvider = provider;
  await writeStored(stored);
  return snapshot(stored);
}

/** Campos omitidos/vazios mantêm o valor atual (a chave nunca é apagada à toa). */
export async function updateProviderConfig(
  provider: AiProviderId,
  patch: { apiUrl?: string; model?: string; timeoutMs?: number; apiKey?: string },
): Promise<AiConfigSnapshot> {
  if (!PROVIDER_IDS.includes(provider)) throw new Error(`provider inválido: ${provider}`);
  const stored = await readStored();
  const cfg = stored.providers[provider];
  if (typeof patch.apiUrl === "string" && patch.apiUrl.trim()) cfg.apiUrl = patch.apiUrl.trim();
  if (typeof patch.model === "string" && patch.model.trim()) cfg.model = patch.model.trim();
  if (patch.timeoutMs !== undefined && patch.timeoutMs !== null) cfg.timeoutMs = clampTimeout(Number(patch.timeoutMs));
  if (typeof patch.apiKey === "string" && patch.apiKey.trim()) cfg.apiKey = patch.apiKey.trim();
  await writeStored(stored);
  return snapshot(stored);
}
