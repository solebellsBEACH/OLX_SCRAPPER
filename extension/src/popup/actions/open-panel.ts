import { openPanelBtn } from "../dom";

/** `route` é a rota do painel (hash router), ex.: "/db". */
export function openPanel(route = ""): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL("panel/index.html") + (route ? `#${route}` : "") });
}

export function registerOpenPanelAction(): void {
  openPanelBtn.addEventListener("click", () => openPanel());
}
