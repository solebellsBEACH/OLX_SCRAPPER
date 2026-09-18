import { analyzeBtn } from "../dom";
import { logCategorias, logSections } from "../logging";
import { send } from "../messaging";
import { lockButtons, renderPage } from "../render/list";
import { setIndicatorsButtonLabel } from "./indicators";
import { state } from "../state";
import { setStatus } from "../status";

export function registerAnalyzeAction(): void {
  analyzeBtn.addEventListener("click", () => {
    void (async () => {
      lockButtons(true);
      setStatus("⏳ Lendo sections + DeepSeek...");
      try {
        const response = await send("analyze");
        if (!response.ok) {
          if (response.cancelled) {
            setStatus("🚫 Operação cancelada.");
            return;
          }
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
        logCategorias(result.categorias, result.raw);
        // "Analisar página" já pinta os cards no OLX (background chama markCardsOnPage) —
        // sincroniza o rótulo do botão pra refletir isso.
        state.indicatorsShown = true;
        setIndicatorsButtonLabel();
        const naoCarro = result.nonCar ? ` · ${result.nonCar} não-carro(s) ocultado(s)` : "";
        const salvos = result.savedToDb ? ` · ${result.savedToDb} novo(s) salvo(s) no DB (rascunho)` : "";
        setStatus(
          result.aiError
            ? `⚠️ ${result.count} carro(s) listado(s)${naoCarro}. IA: ${result.aiError}`
            : `✅ ${result.count} carro(s) categorizado(s)${naoCarro}${salvos} (console F12 + lista abaixo)`,
        );
      } finally {
        lockButtons(false);
      }
    })();
  });
}
