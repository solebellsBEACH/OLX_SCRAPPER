import { CancelledError, beginOperation, requestCancel } from "./cancel";
import { getActiveOlxTab } from "./tabs";
import { analyze } from "./actions/analyze";
import { analyzeSelected } from "./actions/analyze-selected";
import { autoScroll } from "./actions/auto-scroll";
import { quickAnalyze } from "./actions/quick-analyze";
import { crawlListing } from "./actions/crawl-listing";
import { loadPending } from "./actions/load-pending";
import * as aiConfig from "./ai-config";
import * as aiClient from "./ai-client";
import { dbAll, dbClear } from "./db";
import { dbImport, dbRemove } from "./store";
import { checkKnown, hideIndicators, showIndicators } from "./indicators";
import type { InMessage } from "./types";

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: InMessage, _sender, sendResponse) => {
    (async (): Promise<unknown> => {
      switch (message.action) {
        case "analyze":
          return { ok: true, result: await analyze() };
        case "quickAnalyze":
          return { ok: true, result: await quickAnalyze() };
        case "cancel": {
          requestCancel();
          // rolagem em curso roda no content script: pede para parar também
          const tab = await getActiveOlxTab().catch(() => null);
          if (tab) await chrome.tabs.sendMessage(tab.id, { action: "stopScroll" }).catch(() => {});
          return { ok: true };
        }
        case "autoScroll":
          beginOperation();
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
        case "importDb":
          return { ok: true, db: await dbImport(message.db ?? {}) };
        case "removeRecord":
          if (!message.id) return { ok: false, error: "id ausente" };
          return { ok: true, db: await dbRemove(message.id) };
        case "getAiConfig":
          return { ok: true, config: await aiConfig.getConfig() };
        case "setAiProvider":
          if (!message.providerId) return { ok: false, error: "providerId ausente" };
          return { ok: true, config: await aiConfig.setActiveProvider(message.providerId) };
        case "saveAiProvider":
          if (!message.provider) return { ok: false, error: "provider ausente" };
          return { ok: true, config: await aiConfig.saveProvider(message.provider) };
        case "removeAiProvider":
          if (!message.providerId) return { ok: false, error: "providerId ausente" };
          return { ok: true, config: await aiConfig.removeProvider(message.providerId) };
        case "aiAnalyze": {
          const { categorias, raw, usage } = await aiClient.analyzeSections((message.sections ?? []) as never);
          return { ok: true, categorias, raw, usage };
        }
        case "aiCompare": {
          const { ranking, raw } = await aiClient.compareCars((message.cars ?? []) as never);
          return { ok: true, ranking, raw };
        }
        case "aiMetrics": {
          const { metrics, raw } = await aiClient.carMetrics((message.cars ?? []) as never);
          return { ok: true, metrics, raw };
        }
        default:
          return { ok: false, error: `Ação desconhecida: ${String((message as { action?: string }).action)}` };
      }
    })()
      .then(sendResponse)
      .catch((error: unknown) => {
        if (error instanceof CancelledError) {
          sendResponse({ ok: false, cancelled: true, error: error.message });
          return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[OLX Workspace] Falha:", msg);
        sendResponse({ ok: false, error: msg });
      });
    return true; // resposta assíncrona
  });
}
