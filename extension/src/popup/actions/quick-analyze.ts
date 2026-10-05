import { quickAnalyzeBtn } from "../dom";
import { logSections } from "../logging";
import { send } from "../messaging";
import { lockButtons, renderPage } from "../render/list";
import { setIndicatorsButtonLabel } from "./indicators";
import { state } from "../state";
import { setStatus } from "../status";

export function registerQuickAnalyzeAction(): void {
  quickAnalyzeBtn.addEventListener("click", () => {
    void (async () => {
      lockButtons(true);
      setStatus("⚡ Lendo sections (sem IA)...");
      try {
        const response = await send("quickAnalyze");
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
        logSections(state.items);
        // Pinta os cards direto na página do OLX (borda azul tracejada + ⚡score) —
        // sincroniza o rótulo do botão "Exibir/Ocultar indicadores" com isso.
        state.indicatorsShown = true;
        setIndicatorsButtonLabel();
        const suspeitos = result.suspicious ? ` · ${result.suspicious} com km suspeita` : "";
        setStatus(`⚡ ${result.count} carro(s) com score rápido (sem IA)${suspeitos}.`);
      } finally {
        lockButtons(false);
      }
    })();
  });
}
