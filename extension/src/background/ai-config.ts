/** Config dos provedores de IA (substitui proxy/.env), guardada em chrome.storage.local. */

import { CUSTOM_PRESET_ID, PROVIDER_PRESETS, findPreset, type ProviderPreset } from "./ai-presets";

/** Um provedor cadastrado pelo usuário. Pode haver vários do mesmo preset (ex.: 2 contas OpenAI). */
export interface ProviderEntry {
  id: string;
  presetId: string;
  label: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

interface StoredConfig {
  activeId: string | null;
  providers: ProviderEntry[];
}

export interface AiProviderSnapshot {
  id: string;
  presetId: string;
  label: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keyPreview: string | null;
}

export interface AiConfigSnapshot {
  activeId: string | null;
  providers: AiProviderSnapshot[];
  /** Presets disponíveis pro formulário "Adicionar provedor" (fonte única, vive só no background). */
  presets: ProviderPreset[];
}

export interface ProviderInput {
  /** Omitido = novo provedor. */
  id?: string;
  presetId?: string;
  label?: string;
  apiUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** Vazio mantém a chave atual (a chave nunca é apagada à toa). */
  apiKey?: string;
}

const STORAGE_KEY = "olx.aiConfig";
const DEFAULT_TIMEOUT_MS = 180_000;

function clampTimeout(ms: number): number {
  return Number.isFinite(ms) ? Math.min(300_000, Math.max(10_000, ms)) : DEFAULT_TIMEOUT_MS;
}

async function readStored(): Promise<StoredConfig> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stored = data[STORAGE_KEY] as Partial<StoredConfig> | undefined;
  const providers = Array.isArray(stored?.providers) ? stored.providers : [];
  const activeId = providers.some((p) => p.id === stored?.activeId) ? (stored?.activeId ?? null) : (providers[0]?.id ?? null);
  return { activeId, providers };
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
    activeId: config.activeId,
    providers: config.providers.map((p) => ({
      id: p.id,
      presetId: p.presetId,
      label: p.label,
      apiUrl: p.apiUrl,
      model: p.model,
      timeoutMs: p.timeoutMs,
      hasKey: Boolean(p.apiKey),
      keyPreview: maskKey(p.apiKey),
    })),
    presets: PROVIDER_PRESETS,
  };
}

export async function getConfig(): Promise<AiConfigSnapshot> {
  return snapshot(await readStored());
}

/** Provedor ativo com a apiKey em texto (uso interno do ai-client); null se não houver nenhum. */
export async function activeProviderConfig(): Promise<ProviderEntry | null> {
  const stored = await readStored();
  return stored.providers.find((p) => p.id === stored.activeId) ?? null;
}

export async function setActiveProvider(id: string): Promise<AiConfigSnapshot> {
  const stored = await readStored();
  if (!stored.providers.some((p) => p.id === id)) throw new Error("provedor não encontrado");
  stored.activeId = id;
  await writeStored(stored);
  return snapshot(stored);
}

/** Cria (sem `id`) ou atualiza um provedor. O primeiro cadastrado vira o ativo. */
export async function saveProvider(input: ProviderInput): Promise<AiConfigSnapshot> {
  const stored = await readStored();
  const existing = input.id ? stored.providers.find((p) => p.id === input.id) : undefined;
  if (input.id && !existing) throw new Error("provedor não encontrado");

  const preset = findPreset(existing?.presetId ?? input.presetId ?? CUSTOM_PRESET_ID);
  const apiUrl = (input.apiUrl ?? existing?.apiUrl ?? preset.apiUrl).trim();
  const model = (input.model ?? existing?.model ?? preset.models[0]?.id ?? "").trim();
  if (!/^https?:\/\//i.test(apiUrl)) throw new Error("Informe a URL da API (começando com https://).");
  if (!model) throw new Error("Escolha ou informe o modelo.");

  const entry: ProviderEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    presetId: preset.id,
    label: (input.label ?? existing?.label ?? preset.label).trim() || preset.label,
    apiUrl,
    apiKey: input.apiKey?.trim() || existing?.apiKey || "",
    model,
    timeoutMs: input.timeoutMs !== undefined ? clampTimeout(Number(input.timeoutMs)) : (existing?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  };

  stored.providers = existing ? stored.providers.map((p) => (p.id === entry.id ? entry : p)) : [...stored.providers, entry];
  if (!stored.activeId) stored.activeId = entry.id;
  await writeStored(stored);
  return snapshot(stored);
}

export async function removeProvider(id: string): Promise<AiConfigSnapshot> {
  const stored = await readStored();
  stored.providers = stored.providers.filter((p) => p.id !== id);
  if (stored.activeId === id) stored.activeId = stored.providers[0]?.id ?? null;
  await writeStored(stored);
  return snapshot(stored);
}
