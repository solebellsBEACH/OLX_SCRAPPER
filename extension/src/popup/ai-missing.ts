/**
 * Aviso de que não há IA configurada (o sistema só funciona com ela). Clicar abre a tela de
 * Config do painel. Reavalia ao voltar o foco pra janela (rede de segurança) e, principalmente,
 * assim que a config muda no storage — o painel roda numa aba/janela separada, então o popup só
 * fica sabendo de uma configuração feita lá através do chrome.storage.onChanged, não do focus.
 */

import { openPanel } from "./actions/open-panel";
import { aiMissingToast } from "./dom";
import { send } from "./messaging";

const STORAGE_KEY = "olx.aiConfig";

/** true = há IA ativa com chave (ou endpoint próprio); null = não deu pra consultar. */
export async function isAiConfigured(): Promise<boolean | null> {
  const res = await send("getAiConfig");
  if (!res.ok) return null;
  const config = res.config;
  const active = config?.providers.find((p) => p.id === config.activeId);
  return Boolean(active && (active.hasKey || active.presetId === "custom"));
}

async function refresh(): Promise<void> {
  aiMissingToast.hidden = (await isAiConfigured()) !== false;
}

export function registerAiMissingToast(): void {
  aiMissingToast.addEventListener("click", () => openPanel("/db"));
  window.addEventListener("focus", () => void refresh());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && STORAGE_KEY in changes) void refresh();
  });
  void refresh();
}
