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

async function refresh(): Promise<void> {
  const res = await send("getAiConfig");
  const config = res.config;
  const active = config?.providers.find((p) => p.id === config.activeId);
  aiMissingToast.hidden = !res.ok || Boolean(active && (active.hasKey || active.presetId === "custom"));
}

export function registerAiMissingToast(): void {
  aiMissingToast.addEventListener("click", () => openPanel("/db"));
  window.addEventListener("focus", () => void refresh());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && STORAGE_KEY in changes) void refresh();
  });
  void refresh();
}
