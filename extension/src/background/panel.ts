import { OLX_CARROS_FALLBACK_URL, PANEL_PATH } from "./constants";
import { isCarrosOlxUrl } from "./tabs";

/** Se a aba ativa não for uma página de carros do OLX, manda pra busca padrão antes de abrir o painel. */
async function redirectIfIncompatible(): Promise<void> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id === undefined || isCarrosOlxUrl(active.url)) return;
  await chrome.tabs.update(active.id, { url: OLX_CARROS_FALLBACK_URL });
}

async function openPanel(): Promise<void> {
  await redirectIfIncompatible();
  const panelUrl = chrome.runtime.getURL(PANEL_PATH);
  try {
    const open = await chrome.tabs.query({ url: chrome.runtime.getURL("popup.html*") });
    const existing = open[0];
    if (existing?.id !== undefined && existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true });
      await chrome.tabs.update(existing.id, { active: true });
      return;
    }
  } catch {
    /* cria uma janela nova */
  }
  await chrome.windows.create({ url: panelUrl, type: "popup", width: 480, height: 760 });
}

export function registerPanelOpener(): void {
  chrome.action.onClicked.addListener(() => {
    void openPanel();
  });
}
