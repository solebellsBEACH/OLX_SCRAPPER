import { panelAnalyze, panelCrawl, tabAnalyzeBtn, tabCrawlBtn } from "../dom";

function showTab(tab: "crawl" | "analyze"): void {
  const isCrawl = tab === "crawl";
  panelCrawl.hidden = !isCrawl;
  panelAnalyze.hidden = isCrawl;
  tabCrawlBtn.setAttribute("aria-selected", String(isCrawl));
  tabAnalyzeBtn.setAttribute("aria-selected", String(!isCrawl));
}

export function registerTabSwitcher(): void {
  if (new URLSearchParams(location.search).has("tab")) {
    document.body.classList.add("as-tab");
  }
  tabCrawlBtn.addEventListener("click", () => showTab("crawl"));
  tabAnalyzeBtn.addEventListener("click", () => showTab("analyze"));
}
