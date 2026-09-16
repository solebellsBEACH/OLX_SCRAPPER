import { analyze } from "./actions/analyze";
import { analyzeSelected } from "./actions/analyze-selected";
import { autoScroll } from "./actions/auto-scroll";
import { crawlListing } from "./actions/crawl-listing";
import { loadPending } from "./actions/load-pending";
import { dbAll, dbClear } from "./db";
import { checkKnown, hideIndicators, showIndicators } from "./indicators";
import type { InMessage } from "./types";

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: InMessage, _sender, sendResponse) => {
    (async (): Promise<unknown> => {
      switch (message.action) {
        case "analyze":
          return { ok: true, result: await analyze() };
        case "autoScroll":
          return { ok: true, result: await autoScroll() };
        case "analyzeSelected":
          return { ok: true, result: await analyzeSelected(message.targets ?? [], message.force ?? false) };
        case "crawlListing":
          return {
            ok: true,
            result: await crawlListing({
              maxPages: message.maxPages ?? 5,
              scrollEach: message.scrollEach ?? true,
              skipKnown: message.skipKnown ?? true,
              saveToDb: message.saveToDb ?? true,
            }),
          };
        case "checkKnown":
          return { ok: true, marks: await checkKnown(message.ids ?? []) };
        case "showIndicators":
          return { ok: true, result: await showIndicators() };
        case "hideIndicators":
          await hideIndicators();
          return { ok: true };
        case "loadPending":
          return { ok: true, result: await loadPending() };
        case "getDb":
          return { ok: true, db: await dbAll() };
        case "clearDb":
          await dbClear();
          return { ok: true, db: {} };
        default:
          return { ok: false, error: `Ação desconhecida: ${String((message as { action?: string }).action)}` };
      }
    })()
      .then(sendResponse)
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[OLX Workspace] Falha:", msg);
        sendResponse({ ok: false, error: msg });
      });
    return true; // resposta assíncrona
  });
}
