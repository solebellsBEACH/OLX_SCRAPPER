import { extractAdPage } from "./ad-page-extractor";
import { hideIndicators, markCards } from "./card-marking";
import { hideLoading, showLoading } from "./loading-overlay";
import { extractSections } from "./listing-extractor";
import { extractPagination } from "./pagination-extractor";
import { scrollAutomatic } from "./scroll";
import type {
  AdPageResult,
  ContentMessage,
  ExtractResult,
  OkResult,
  PaginationResult,
} from "./types";

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (
        response: ExtractResult | AdPageResult | OkResult | PaginationResult,
      ) => void,
    ): boolean => {
      if (message.action === "extractSections") {
        const cards = extractSections();
        sendResponse({ ok: true, count: cards.length, cards });
        return false;
      }

      if (message.action === "extractPagination") {
        sendResponse({ ok: true, lastPage: extractPagination() });
        return false;
      }

      if (message.action === "extractAdPage") {
        sendResponse({ ok: true, data: extractAdPage() });
        return false;
      }

      if (message.action === "autoScroll") {
        const ms = typeof message.duration === "number" && message.duration > 0 ? message.duration : 3000;
        void scrollAutomatic(ms).then(() => sendResponse({ ok: true }));
        return true; // resposta assíncrona
      }

      if (message.action === "markCards") {
        markCards(message.marks ?? []);
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "hideIndicators") {
        hideIndicators();
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "showLoading") {
        showLoading(message.text ?? "Processando...");
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "hideLoading") {
        hideLoading();
        sendResponse({ ok: true });
        return false;
      }

      return false;
    },
  );
}
