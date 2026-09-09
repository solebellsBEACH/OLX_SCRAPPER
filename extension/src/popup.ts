/**
 * UI do OLX Workspace. Clicar no ícone da extensão abre popup.html numa aba
 * do Chrome (não fecha ao clicar fora). Fala com o service worker por mensagem.
 */

type Action = "analyze" | "autoScroll";

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

const statusEl = document.getElementById("status") as HTMLDivElement | null;
const analyzeBtn = document.getElementById("analyzeBtn") as HTMLButtonElement | null;
const scrollBtn = document.getElementById("scrollBtn") as HTMLButtonElement | null;

if (!statusEl || !analyzeBtn || !scrollBtn) {
  throw new Error("popup.html não contém os elementos esperados.");
}

if (new URLSearchParams(location.search).has("tab")) {
  document.body.classList.add("as-tab");
}

function setStatus(text: string): void {
  statusEl!.textContent = text;
}

async function sendAction(action: Action): Promise<DispatchResponse> {
  const response = (await chrome.runtime.sendMessage({ action })) as DispatchResponse | undefined;
  return response ?? { ok: false, error: "Sem resposta do service worker." };
}

async function withButtonsDisabled(fn: () => Promise<void>): Promise<void> {
  analyzeBtn!.disabled = true;
  scrollBtn!.disabled = true;
  try {
    await fn();
  } finally {
    analyzeBtn!.disabled = false;
    scrollBtn!.disabled = false;
  }
}

analyzeBtn.addEventListener("click", () => {
  void withButtonsDisabled(async () => {
    setStatus("⏳ Lendo sections + DeepSeek...");
    const response = await sendAction("analyze");
    if (!response.ok) {
      setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
      return;
    }
    const { count, analysis, aiError } = response.result ?? { count: 0, analysis: null };
    if (analysis !== null) {
      setStatus(`✅ ${count} anúncios. Análise no console (F12) da aba do OLX`);
    } else {
      setStatus(`⚠️ ${count} sections no console. IA: ${aiError ?? "sem resposta"}`);
    }
  });
});

scrollBtn.addEventListener("click", () => {
  void withButtonsDisabled(async () => {
    setStatus("⏳ Rolando a página...");
    const response = await sendAction("autoScroll");
    setStatus(response.ok ? "✅ Scroll concluído" : `❌ ${response.error ?? "Erro desconhecido."}`);
  });
});

export {};
