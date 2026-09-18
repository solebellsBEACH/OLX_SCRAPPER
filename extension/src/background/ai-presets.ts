/**
 * Catálogo de provedores de IA suportados. Todos falam o formato "chat/completions" da OpenAI
 * (com `response_format: json_object`). Só entram modelos de chat sem "raciocínio" obrigatório,
 * porque a requisição usa `temperature: 0`. Qualquer outro modelo pode ser digitado na hora
 * ("Outro modelo"), e o preset "custom" serve pra qualquer endpoint compatível (Ollama, LM Studio…).
 */

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  apiUrl: string;
  /** Vazio = endpoint livre, modelo digitado à mão. */
  models: ModelOption[];
  keyPlaceholder: string;
  /** Onde o usuário gera a chave. */
  keyUrl?: string;
}

export const CUSTOM_PRESET_ID = "custom";

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini (barato)" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 nano (mais barato)" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiUrl: "https://api.deepseek.com/chat/completions",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat (V3)" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner (R1, mais lento)" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyPlaceholder: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (mais barato)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    keyPlaceholder: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (rápido)" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    apiUrl: "https://api.mistral.ai/v1/chat/completions",
    keyPlaceholder: "chave da Mistral",
    keyUrl: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-medium-latest", label: "Mistral Medium" },
      { id: "mistral-small-latest", label: "Mistral Small (barato)" },
      { id: "open-mistral-nemo", label: "Mistral Nemo" },
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    apiUrl: "https://api.x.ai/v1/chat/completions",
    keyPlaceholder: "xai-...",
    keyUrl: "https://console.x.ai",
    models: [
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
      { id: "grok-4", label: "Grok 4" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter (Claude e outros)",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    keyPlaceholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    ],
  },
  {
    id: CUSTOM_PRESET_ID,
    label: "Outro (compatível com OpenAI)",
    apiUrl: "",
    models: [],
    keyPlaceholder: "chave (pode ficar vazia em servidor local)",
  },
];

export function findPreset(id: string): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}
