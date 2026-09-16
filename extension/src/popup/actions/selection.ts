import {
  clearSelBtn,
  nextBtn,
  prevBtn,
  selAllBtn,
  selectAllBtn,
  selectCountBtn,
  selectCountInput,
} from "../dom";
import { pageItems, renderPage } from "../render/list";
import { pendingItems, state } from "../state";
import { setStatus } from "../status";

export function registerSelectionActions(): void {
  selAllBtn.addEventListener("change", () => {
    for (const it of pageItems()) {
      if (!it.id) continue;
      if (selAllBtn.checked) state.selected.add(it.id);
      else state.selected.delete(it.id);
    }
    renderPage();
  });

  // Seleciona TODOS os itens da varredura (todas as páginas da lista), pulando os
  // que já passaram pelo "Analisar selecionados" — assim não se refaz o que já foi feito.
  selectAllBtn.addEventListener("click", () => {
    const pend = pendingItems();
    for (const it of pend) if (it.id) state.selected.add(it.id);
    const done = state.items.length - pend.length;
    setStatus(
      `Selecionados ${pend.length} anúncio(s)` +
        (done ? ` · ${done} já analisado(s), fora da seleção` : ""),
    );
    renderPage();
  });

  // Seleciona só os N primeiros pendentes — útil quando "selecionar todas" traria
  // centenas de itens (ex.: depois de "Carregar pendentes do DB") e você quer
  // processar aos poucos.
  selectCountBtn.addEventListener("click", () => {
    const pend = pendingItems();
    const wanted = Math.max(1, Math.round(Number(selectCountInput.value)) || 1);
    const n = Math.min(wanted, pend.length);
    for (const it of pend.slice(0, n)) if (it.id) state.selected.add(it.id);
    setStatus(`Selecionados ${n} de ${pend.length} anúncio(s) pendente(s).`);
    renderPage();
  });

  clearSelBtn.addEventListener("click", () => {
    state.selected.clear();
    renderPage();
  });

  prevBtn.addEventListener("click", () => {
    state.page -= 1;
    renderPage();
  });

  nextBtn.addEventListener("click", () => {
    state.page += 1;
    renderPage();
  });
}
