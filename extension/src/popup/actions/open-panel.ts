import { openPanelBtn } from "../dom";

export function registerOpenPanelAction(): void {
  openPanelBtn.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("panel/index.html") });
  });
}
