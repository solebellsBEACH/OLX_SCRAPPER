import { analyzeSelBtn } from "../dom";
import { send } from "../messaging";
import { lockButtons, renderPage, syncSelectionUi } from "../render/list";
import { state } from "../state";
import { setStatus } from "../status";
import { refreshDbFlags } from "./db-view";

/** Analisa a fundo os anúncios `targets` (Modo Avançado: status na barra de status). */
export async function analyzeTargets(targets: Array<{ id: string; url: string }>): Promise<void> {
  lockButtons(true);
  analyzeSelBtn.disabled = true;
  setStatus(`⏳ Analisando ${targets.length} anúncio(s)... (não feche esta janela)`);
  try {
    const response = await send("analyzeSelected", { targets });
    if (!response.ok) {
      if (response.cancelled) {
        for (const [id, st] of state.rowState) if (st === "running") state.rowState.delete(id);
        renderPage();
        setStatus("🚫 Operação cancelada.");
        return;
      }
      setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
      return;
    }
    const result = response.result as unknown as {
      analyzed: Array<Record<string, unknown> & { id: string; url?: string }>;
      errors: Array<{ id: string; error: string }>;
      skipped?: string[];
      nonCar?: string[];
    };

    console.log("%c=== ANÁLISE DOS ANÚNCIOS (páginas) ===", "font-weight:bold");
    for (const rec of result.analyzed) {
      console.groupCollapsed(`anúncio ${rec.id} — ${String(rec.url ?? "")}`);
      console.log("detail:", rec.detail);
      console.log("categoria:", rec.categoria);
      console.groupEnd();
    }
    if (result.errors.length) console.warn("erros:", result.errors);

    // tira da seleção o que já foi analisado com sucesso (não refazer)
    for (const rec of result.analyzed) state.selected.delete(rec.id);
    for (const id of result.skipped ?? []) state.selected.delete(id);
    for (const id of result.nonCar ?? []) state.selected.delete(id);

    await refreshDbFlags();
    state.rowState.clear();
    renderPage();
    const okN = result.analyzed.length;
    const errN = result.errors.length;
    const skN = result.skipped?.length ?? 0;
    const ncN = result.nonCar?.length ?? 0;
    setStatus(
      `✅ ${okN} salvo(s) na lista` +
        (skN ? ` · ${skN} já analisado(s) (pulados)` : "") +
        (ncN ? ` · ${ncN} não-carro(s) ignorado(s)` : "") +
        (errN ? ` · ${errN} com erro` : "") +
        `. Use "Ver dados salvos" para conferir.`,
    );
  } finally {
    lockButtons(false);
    syncSelectionUi();
  }
}

export function registerAnalyzeSelectedAction(): void {
  analyzeSelBtn.addEventListener("click", () => {
    const targets = state.items
      .filter((it) => it.id && it.url && state.selected.has(it.id))
      .map((it) => ({ id: it.id as string, url: it.url as string }));
    if (targets.length > 0) void analyzeTargets(targets);
  });
}
