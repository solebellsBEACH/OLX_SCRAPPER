/**
 * Service worker do OLX Workspace.
 *
 * Ações vindas do popup (janela separada) e do painel (chrome-extension://.../panel):
 *   - "analyze":          lê as <section> da listagem, categoriza na IA ativa
 *                         (chamada direto do service worker), devolve os itens
 *                         (listing + categoria) para a lista.
 *   - "autoScroll":       scroll automático na aba do OLX.
 *   - "analyzeSelected":  para cada item selecionado, NAVEGA a própria aba do
 *                         OLX até a página do anúncio, extrai o HTML/dados,
 *                         categoriza na IA ativa e GRAVA na base
 *                         (chrome.storage.local). Ao final volta a aba para
 *                         a listagem original.
 *   - "getDb" / "clearDb" / "importDb" / "removeRecord": lê / limpa / importa /
 *                         remove um registro da base.
 *   - "getAiConfig" / "setAiProvider" / "updateAiProviderConfig": config dos
 *                         provedores de IA (DeepSeek/OpenAI).
 *   - "aiAnalyze" / "aiCompare" / "aiMetrics": chamadas de IA feitas pelo painel.
 *
 * Progresso do "analyzeSelected" é emitido via chrome.runtime.sendMessage
 * ({ type: "progress", ... }) para o popup.
 */

import { registerMessageRouter } from "./message-router";
import { registerPanelOpener } from "./panel";

registerPanelOpener();
registerMessageRouter();

export {};
