/**
 * Service worker do OLX Workspace.
 *
 * Coordena popup <-> aba <-> proxy DeepSeek:
 *   - "analyze":  injeta o content script, coleta os dados das <section>,
 *                 envia ao proxy local (http://localhost:8787/analyze) e manda
 *                 a resposta de volta para o console da página.
 *   - "autoScroll": dispara o scroll automático na aba.
 */

const OLX_URL_PREFIX = "https://www.olx.com.br/";
const PROXY_URL = "http://localhost:8787/analyze";
const PANEL_PATH = "popup.html?tab=1";

/**
 * Clicar no ícone abre a UI numa JANELA separada do Chrome (não fecha ao clicar
 * fora). Se já houver uma aberta, apenas foca nela.
 */
chrome.action.onClicked.addListener(() => {
  void openPanel();
});

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
    // segue para criar uma janela nova
  }
  await chrome.windows.create({
    url: panelUrl,
    type: "popup",
    width: 480,
    height: 700,
  });
}

type Action = "analyze" | "autoScroll";

interface PopupMessage {
  action: Action;
}

interface AnalyzeResult {
  count: number;
  analysis: string | null;
  aiError?: string;
}

interface DispatchResponse {
  ok: boolean;
  result?: AnalyzeResult;
  error?: string;
}

async function getActiveOlxTab(): Promise<chrome.tabs.Tab & { id: number }> {
  // 1. Aba ativa da janela atual, se já for do OLX (caso do popup na toolbar).
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && active.url?.startsWith(OLX_URL_PREFIX)) {
    return active as chrome.tabs.Tab & { id: number };
  }

  // 2. Rodando em aba separada: procura qualquer aba do OLX aberta.
  const olxTabs = await chrome.tabs.query({ url: "https://www.olx.com.br/*" });
  const chosen = olxTabs.find((t) => t.active) ?? olxTabs[0];
  if (!chosen || chosen.id === undefined) {
    throw new Error("Nenhuma aba do OLX aberta. Abra uma página do OLX e tente de novo.");
  }
  return chosen as chrome.tabs.Tab & { id: number };
}

async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function analyze(): Promise<AnalyzeResult> {
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);

  const extracted = (await chrome.tabs.sendMessage(tab.id, { action: "extractSections" })) as
    | { ok: boolean; count: number; cards: unknown[] }
    | undefined;
  const cards = extracted?.cards ?? [];

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: cards }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      analysis?: string;
      error?: string;
    };

    if (!response.ok || !data.ok) {
      return { count: cards.length, analysis: null, aiError: data.error ?? `Proxy HTTP ${response.status}` };
    }

    await chrome.tabs.sendMessage(tab.id, { action: "logAnalysis", analysis: data.analysis ?? "" });
    return { count: cards.length, analysis: data.analysis ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      count: cards.length,
      analysis: null,
      aiError: `Proxy inacessível (${msg}). Rode: cd proxy && npm start`,
    };
  }
}

async function autoScroll(): Promise<AnalyzeResult> {
  const tab = await getActiveOlxTab();
  await injectContent(tab.id);
  await chrome.tabs.sendMessage(tab.id, { action: "autoScroll" });
  return { count: 0, analysis: null };
}

chrome.runtime.onMessage.addListener(
  (
    message: PopupMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: DispatchResponse) => void,
  ): boolean => {
    const run =
      message.action === "analyze"
        ? analyze()
        : message.action === "autoScroll"
          ? autoScroll()
          : null;

    if (!run) {
      sendResponse({ ok: false, error: `Ação desconhecida: ${String(message.action)}` });
      return false;
    }

    run
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[OLX Workspace] Falha:", msg);
        sendResponse({ ok: false, error: msg });
      });

    return true; // resposta assíncrona
  },
);

export {};
