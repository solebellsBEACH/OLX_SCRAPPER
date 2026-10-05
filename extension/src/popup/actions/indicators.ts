import { showIndicatorsBtn } from "../dom";
import { send } from "../messaging";
import { lockButtons } from "../render/list";
import { state } from "../state";
import { setStatus } from "../status";

export function setIndicatorsButtonLabel(): void {
  showIndicatorsBtn.innerHTML = state.indicatorsShown
    ? '<span class="btn-ico">🚫</span> Ocultar indicadores'
    : '<span class="btn-ico">🟢</span> Exibir indicadores';
}

async function showIndicatorsClick(): Promise<void> {
  lockButtons(true);
  setStatus("⏳ Verificando anúncios já salvos...");
  try {
    const response = await send("showIndicators");
    if (!response.ok) {
      setStatus(`❌ ${response.error ?? "Erro desconhecido."}`);
      return;
    }
    const r = response.result as unknown as { count: number; done: number; pending: number };
    state.indicatorsShown = true;
    setIndicatorsButtonLabel();
    setStatus(
      r.count === 0
        ? "ℹ️ Nenhum card encontrado nesta página."
        : `✅ ${r.count} card(s) na tela — ${r.done} já analisado(s) (verde) · ${r.pending} aguardando análise (cinza).`,
    );
  } finally {
    lockButtons(false);
  }
}

async function hideIndicatorsClick(): Promise<void> {
  lockButtons(true);
  setStatus("⏳ Ocultando indicadores...");
  try {
    const response = await send("hideIndicators");
    state.indicatorsShown = false;
    setIndicatorsButtonLabel();
    setStatus(response.ok ? "✅ Indicadores ocultados." : `❌ ${response.error ?? "Erro."}`);
  } finally {
    lockButtons(false);
  }
}

export function registerIndicatorsAction(): void {
  setIndicatorsButtonLabel();
  showIndicatorsBtn.addEventListener("click", () => {
    void (state.indicatorsShown ? hideIndicatorsClick() : showIndicatorsClick());
  });
}
