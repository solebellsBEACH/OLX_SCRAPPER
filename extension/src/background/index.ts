/**
 * Service worker do OLX Workspace.
 *
 * Ações vindas do popup (janela separada):
 *   - "analyze":          lê as <section> da listagem, categoriza no DeepSeek,
 *                         devolve os itens (listing + categoria) para a lista.
 *   - "autoScroll":       scroll automático na aba do OLX.
 *   - "analyzeSelected":  para cada item selecionado, NAVEGA a própria aba do
 *                         OLX até a página do anúncio, extrai o HTML/dados,
 *                         categoriza no DeepSeek e GRAVA no arquivo db.json (na
 *                         raiz do projeto, via proxy). Ao final volta a aba para
 *                         a listagem original.
 *   - "getDb" / "clearDb": lê / limpa o db.json (via proxy).
 *
 * Progresso do "analyzeSelected" é emitido via chrome.runtime.sendMessage
 * ({ type: "progress", ... }) para o popup.
 */

import { registerMessageRouter } from "./message-router";
import { registerPanelOpener } from "./panel";

registerPanelOpener();
registerMessageRouter();

export {};
