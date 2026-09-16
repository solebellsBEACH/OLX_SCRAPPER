import { PANEL_PATH } from "./constants";

async function openPanel(): Promise<void> {
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
