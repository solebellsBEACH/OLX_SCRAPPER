import { loadPendingBtn } from "../dom";
import { send } from "../messaging";
import { lockButtons, renderPage } from "../render/list";
import { state } from "../state";
import { setStatus } from "../status";

export function registerLoadPendingAction(): void {
  loadPendingBtn.addEventListener("click", () => {
    void (async () => {
      lockButtons(true);
      setStatus("⏳ Carregando pendentes do db.json...");
      try {
        const response = await send("loadPending");
        if (!response.ok) {
          setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
          return;
        }
        const result = response.result ?? { count: 0, items: [] };
        state.items = result.items;
        state.page = 0;
        state.selected.clear();
        state.rowState.clear();
        renderPage();
        setStatus(
          result.count === 0
            ? "ℹ️ Nada pendente no DB — tudo que já foi listado passou por 'Analisar selecionados'."
            : `✅ ${result.count} carro(s) pendente(s) carregado(s). Selecione e clique em "Analisar selecionados".`,
        );
      } finally {
        lockButtons(false);
      }
    })();
  });
}
