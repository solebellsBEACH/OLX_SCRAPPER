import { crawlBtn, maxPagesEl, saveToDbEl, scrollEachEl, skipKnownEl } from "../dom";
import { logCategorias, logSections } from "../logging";
import { send } from "../messaging";
import { lockButtons, renderPage } from "../render/list";
import { state } from "../state";
import { setStatus } from "../status";
import { refreshDbFlags } from "./db-view";

export function registerCrawlAction(): void {
  crawlBtn.addEventListener("click", () => {
    void (async () => {
      const maxPages = Math.max(1, Math.min(Number(maxPagesEl.value) || 5, 50));
      const scrollEach = scrollEachEl.checked;
      const skipKnown = skipKnownEl.checked;
      const saveToDb = saveToDbEl.checked;
      lockButtons(true);
      setStatus(`⏳ Varrendo até ${maxPages} página(s)... (não feche esta janela)`);
      try {
        const response = await send("crawlListing", { maxPages, scrollEach, skipKnown, saveToDb });
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
        logCategorias(result.categorias, result.raw);
        if (result.perPage?.length) console.table(result.perPage);
        await refreshDbFlags();
        renderPage();
        const pgs = result.pages ?? 0;
        const extra = [
          result.lastPage ? `paginação: ${result.lastPage} página(s)` : "",
          result.savedToDb ? `${result.savedToDb} salvos no DB` : "",
          result.saveError ? `NÃO salvo no DB: ${result.saveError}` : "",
          result.nonCar ? `${result.nonCar} não-carro(s) ignorado(s)` : "",
          result.skipped ? `${result.skipped} já no DB (pulados)` : "",
          result.duplicates ? `${result.duplicates} repetidos na paginação` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const suffix = extra ? ` — ${extra}` : "";
        if (result.count === 0) {
          setStatus(
            `ℹ️ Nenhum anúncio novo em ${pgs} página(s)${suffix}.`,
          );
        } else {
          setStatus(
            result.aiError
              ? `⚠️ ${result.count} novo(s) em ${pgs} página(s)${suffix}. IA: ${result.aiError}`
              : `✅ ${result.count} novo(s) de ${pgs} página(s) categorizados${suffix} (console F12 + lista abaixo)`,
          );
        }
      } finally {
        lockButtons(false);
      }
    })();
  });
}
