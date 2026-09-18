/**
 * Aviso de que não há IA configurada (o sistema só funciona com ela). Clicar abre a tela de
 * Config do painel. Reavalia ao voltar o foco pra janela, pra sumir depois de configurar.
 */

import { openPanel } from "./actions/open-panel";
import { aiMissingToast } from "./dom";
import { send } from "./messaging";

async function refresh(): Promise<void> {
  const res = await send("getAiConfig");
  const config = res.config;
  const active = config?.providers.find((p) => p.id === config.activeId);
  aiMissingToast.hidden = !res.ok || Boolean(active && (active.hasKey || active.presetId === "custom"));
}

export function registerAiMissingToast(): void {
  aiMissingToast.addEventListener("click", () => openPanel("/db"));
  window.addEventListener("focus", () => void refresh());
  void refresh();
}
