import { panelAnalyze, panelConfig, panelCrawl, tabAnalyzeBtn, tabConfigBtn, tabCrawlBtn } from "../dom";

type Tab = "crawl" | "analyze" | "config";

function showTab(tab: Tab): void {
  panelCrawl.hidden = tab !== "crawl";
  panelAnalyze.hidden = tab !== "analyze";
  panelConfig.hidden = tab !== "config";
  tabCrawlBtn.setAttribute("aria-selected", String(tab === "crawl"));
  tabAnalyzeBtn.setAttribute("aria-selected", String(tab === "analyze"));
  tabConfigBtn.setAttribute("aria-selected", String(tab === "config"));
}

export function registerTabSwitcher(): void {
  if (new URLSearchParams(location.search).has("tab")) {
    document.body.classList.add("as-tab");
  }
  tabCrawlBtn.addEventListener("click", () => showTab("crawl"));
  tabAnalyzeBtn.addEventListener("click", () => showTab("analyze"));
  tabConfigBtn.addEventListener("click", () => showTab("config"));
}
