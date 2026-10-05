/**
 * Content script do OLX Workspace.
 *
 * Injetado sob demanda pelo background via `chrome.scripting.executeScript`
 * ({ files: ["content.js"] }). Como a injeção pode se repetir na mesma aba,
 * o registro de listeners é protegido por um guard em `window`.
 *
 * Ações:
 *   - "extractSections": lê as <section class="olx-adcard"> da listagem.
 *   - "extractAdPage": lê a PÁGINA de um anúncio (título, preço, descrição,
 *     propriedades, imagens, JSON-LD, tamanho do HTML).
 *   - "autoScroll": rola a página suavemente até o fim em ~3s.
 *
 * NÃO usa console.* — todos os dados voltam para o service worker / popup,
 * que fazem o log no console da PRÓPRIA extensão.
 */

import { startAutoMark } from "./auto-mark";
import { registerMessageRouter } from "./message-router";
import "./types";

if (!window.__olxWorkspaceInjected) {
  window.__olxWorkspaceInjected = true;

  registerMessageRouter();
  startAutoMark();
}

export {};
