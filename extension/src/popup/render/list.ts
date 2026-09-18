import {
  analyzeBtn,
  analyzeSelBtn,
  clearSelBtn,
  crawlBtn,
  listEl,
  loadPendingBtn,
  nextBtn,
  pageInfoEl,
  pagerEl,
  prevBtn,
  selAllBtn,
  selectAllBtn,
  selectCountBtn,
  selectCountInput,
  showIndicatorsBtn,
  cancelAdvBtn,
  statusEl,
  toolbarEl,
} from "../dom";
import { hidePendingToast, refreshPendingToast } from "../pending-toast";
import { PAGE_SIZE, pendingItems, state } from "../state";
import { renderItem } from "./item-row";

export function pageItems(): typeof state.items {
  const start = state.page * PAGE_SIZE;
  return state.items.slice(start, start + PAGE_SIZE);
}

export function renderPage(): void {
  listEl.replaceChildren();
  if (state.items.length === 0) {
    pagerEl.hidden = true;
    toolbarEl.hidden = true;
    return;
  }
  toolbarEl.hidden = false;

  const pages = Math.ceil(state.items.length / PAGE_SIZE);
  state.page = Math.min(Math.max(state.page, 0), pages - 1);

  for (const it of pageItems()) listEl.appendChild(renderItem(it));

  pagerEl.hidden = pages <= 1;
  pageInfoEl.textContent = `Página ${state.page + 1} de ${pages} · ${state.items.length} anúncios`;
  prevBtn.disabled = state.page === 0;
  nextBtn.disabled = state.page >= pages - 1;

  const ids = pageItems().map((i) => i.id).filter(Boolean) as string[];
  selAllBtn.checked = ids.length > 0 && ids.every((id) => state.selected.has(id));
  syncSelectionUi();
}

export function syncSelectionUi(): void {
  analyzeSelBtn.textContent = `🔎 Analisar selecionados (${state.selected.size})`;
  analyzeSelBtn.disabled = state.selected.size === 0 || analyzeBtn.disabled;
  const pend = pendingItems().length;
  selectAllBtn.textContent = `selecionar todas (${pend})`;
  selectAllBtn.disabled = analyzeBtn.disabled || pend === 0;
  selectCountBtn.disabled = analyzeBtn.disabled || pend === 0;
  selectCountInput.max = String(pend || 1);
  clearSelBtn.disabled = analyzeBtn.disabled || state.selected.size === 0;
}

export function lockButtons(lock: boolean): void {
  statusEl.classList.toggle("is-loading", lock);
  if (lock) hidePendingToast();
  else void refreshPendingToast();
  cancelAdvBtn.hidden = !lock;
  cancelAdvBtn.disabled = false;
  analyzeBtn.textContent = lock ? "Processando..." : "Analisar página";
  analyzeBtn.disabled = lock;
  showIndicatorsBtn.disabled = lock;
  loadPendingBtn.disabled = lock;
  crawlBtn.disabled = lock;
  selectAllBtn.disabled = lock || state.items.length === 0;
  selectCountBtn.disabled = lock || state.items.length === 0;
  selectCountInput.disabled = lock;
  clearSelBtn.disabled = lock || state.selected.size === 0;
  analyzeSelBtn.disabled = lock || state.selected.size === 0;
}
