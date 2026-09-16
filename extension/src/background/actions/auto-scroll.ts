import { getActiveOlxTab, injectContent } from "../tabs";
import type { AnalyzeResult } from "../types";

export async function autoScroll(): Promise<AnalyzeResult> {
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);
  await chrome.tabs.sendMessage(tab.id, { action: "autoScroll" });
  return { count: 0, items: [], categorias: null, raw: null };
}
