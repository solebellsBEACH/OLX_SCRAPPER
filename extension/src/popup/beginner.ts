/** Modo Iniciante: escolher ação -> (opções) -> começar. Reaproveita as ações do background. */

import {
  beginnerCountEl,
  beginnerStatusEl,
  beginnerStatusText,
  cancelBtn,
  choiceAll,
  choiceCurrent,
  openResultsBtn,
  optPages,
  pagesCard,
  startBtn,
} from "./dom";
import { hidePendingToast, refreshPendingToast } from "./pending-toast";
import { requestCancel } from "./actions/cancel";
import { send } from "./messaging";
import { loadPrefs, savePrefs, type BeginnerAction } from "./prefs";
import { renderPage } from "./render/list";
import { refreshDbFlags } from "./actions/db-view";
import { state } from "./state";
import type { AnalyzeResult } from "./types";

const MAX_PAGES = 10;
// Opções fixas (antes eram checkboxes): tudo ligado, menos a rolagem automática.
const QUICK_ANALYSIS = true;
const AUTO_SCROLL = false;
let action: BeginnerAction = "current";
let running = false;
let cancelling = false;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const pages = (): number => Math.max(1, Math.min(Number(optPages.value) || 5, MAX_PAGES));

function setBusy(text: string | null): void {
  running = text !== null;
  cancelBtn.hidden = !running;
  if (running) hidePendingToast();
  if (running && text !== null && !cancelling) cancelBtn.disabled = false;
  startBtn.disabled = running;
  startBtn.textContent = running ? "Analisando..." : "🚀 Começar análise";
  beginnerStatusEl.hidden = !running && !beginnerStatusEl.dataset.msg;
  beginnerStatusEl.classList.toggle("is-busy", running);
  if (text !== null) {
    beginnerStatusEl.classList.remove("is-ok", "is-error", "is-cancel");
    beginnerStatusEl.dataset.msg = "1";
    beginnerStatusText.textContent = text;
    openResultsBtn.hidden = true;
  }
}

function finish(kind: "ok" | "error" | "cancel", text: string): void {
  running = false;
  cancelling = false;
  cancelBtn.hidden = true;
  void refreshPendingToast();
  startBtn.disabled = false;
  startBtn.textContent = "🚀 Começar análise";
  beginnerStatusEl.hidden = false;
  beginnerStatusEl.dataset.msg = "1";
  beginnerStatusEl.classList.remove("is-busy");
  beginnerStatusEl.classList.add(kind === "error" ? "is-error" : kind === "ok" ? "is-ok" : "is-cancel");
  beginnerStatusText.textContent = text;
  openResultsBtn.hidden = kind !== "ok";
}

/** Quantos anúncios a aba da OLX mostra agora (null = não deu pra ler). */
async function countOnPage(): Promise<number | null> {
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.olx.com.br/*" });
    const tab = tabs.find((t) => t.active) ?? tabs[0];
    if (tab?.id === undefined) return null;
    const res = (await chrome.tabs.sendMessage(tab.id, { action: "extractSections" })) as
      | { ok: boolean; count: number }
      | undefined;
    return res?.ok ? res.count : null;
  } catch {
    return null;
  }
}

async function refreshCount(): Promise<void> {
  if (running) return;
  const n = await countOnPage();
  if (running) return;
  if (n === null) {
    beginnerCountEl.textContent = "Abra uma busca de carros na OLX para começar.";
  } else if (action === "current") {
    beginnerCountEl.textContent = `${plural(n, "anúncio será analisado", "anúncios serão analisados")}`;
  } else {
    beginnerCountEl.textContent = `Até ${n * pages()} anúncios serão analisados (${plural(pages(), "página", "páginas")})`;
  }
}

function selectAction(next: BeginnerAction): void {
  action = next;
  for (const [btn, a] of [
    [choiceCurrent, "current"],
    [choiceAll, "all"],
  ] as const) {
    btn.setAttribute("aria-checked", String(a === next));
  }
  pagesCard.hidden = next !== "all";
  savePrefs({ action: next });
  void refreshCount();
}

type Outcome = AnalyzeResult | string | "cancelled";

async function runCurrent(): Promise<Outcome> {
  if (AUTO_SCROLL) {
    setBusy("Carregando mais anúncios...");
    const scrolled = await send("autoScroll");
    if (scrolled.cancelled) return "cancelled";
    if (!scrolled.ok) return scrolled.error ?? "Não foi possível rolar a página.";
  }
  setBusy("Analisando anúncios...");
  const res = await send(QUICK_ANALYSIS ? "quickAnalyze" : "analyze");
  if (res.cancelled) return "cancelled";
  if (!res.ok) return res.error ?? "Algo deu errado. Tente de novo.";
  return res.result ?? { count: 0, items: [] };
}

async function runAll(): Promise<Outcome> {
  setBusy(`Varrendo até ${plural(pages(), "página", "páginas")}... Mantenha esta janela aberta.`);
  const res = await send("crawlListing", {
    maxPages: pages(),
    scrollEach: AUTO_SCROLL,
    skipKnown: true,
    saveToDb: true,
  });
  if (res.cancelled) return "cancelled";
  if (!res.ok) return res.error ?? "Algo deu errado. Tente de novo.";
  return res.result ?? { count: 0, items: [] };
}

async function start(): Promise<void> {
  if (running) return;
  setBusy("Começando...");
  const outcome = await (action === "current" ? runCurrent() : runAll());
  if (outcome === "cancelled") {
    finish("cancel", "Análise cancelada. Nada foi alterado na página.");
    return;
  }
  if (typeof outcome === "string") {
    finish("error", outcome);
    return;
  }
  // Deixa o resultado disponível no Modo Avançado também.
  state.items = outcome.items;
  state.page = 0;
  state.selected.clear();
  state.rowState.clear();
  await refreshDbFlags();
  renderPage();
  state.indicatorsShown = true;

  finish(
    "ok",
    outcome.count === 0
      ? "Terminei, mas não encontrei anúncios novos."
      : `Pronto! ${plural(outcome.count, "anúncio analisado", "anúncios analisados")}.`,
  );
}

export function registerBeginnerMode(): void {
  const prefs = loadPrefs();
  optPages.value = String(prefs.maxPages);

  choiceCurrent.addEventListener("click", () => selectAction("current"));
  choiceAll.addEventListener("click", () => selectAction("all"));

  optPages.addEventListener("change", () => {
    optPages.value = String(pages());
    savePrefs({ maxPages: pages() });
    void refreshCount();
  });

  startBtn.addEventListener("click", () => void start());
  cancelBtn.addEventListener("click", () => {
    if (!running || cancelling) return;
    cancelling = true;
    cancelBtn.disabled = true;
    beginnerStatusText.textContent = "Cancelando...";
    void requestCancel();
  });
  openResultsBtn.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("panel/index.html") });
  });

  selectAction(prefs.action);
  window.addEventListener("focus", () => void refreshCount());
  setInterval(() => void refreshCount(), 5000);
}

/** Análise detalhada dos pendentes do DB, com o feedback do Modo Iniciante. */
export async function analyzePendingBeginner(targets: Array<{ id: string; url: string }>): Promise<void> {
  if (running) return;
  setBusy(`Analisando ${plural(targets.length, "carro", "carros")} em detalhe... Mantenha esta janela aberta.`);
  const res = await send("analyzeSelected", { targets });
  if (res.cancelled) {
    finish("cancel", "Análise cancelada. O que já foi analisado ficou salvo.");
  } else if (!res.ok) {
    finish("error", res.error ?? "Algo deu errado. Tente de novo.");
  } else {
    const done = (res.result as unknown as { analyzed?: unknown[] })?.analyzed?.length ?? 0;
    finish("ok", `Pronto! ${plural(done, "carro analisado", "carros analisados")} em detalhe.`);
  }
}
