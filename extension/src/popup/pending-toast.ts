/**
 * Aviso (toast) de carros com análise pendente no DB — os que só têm o rascunho da listagem
 * (ou a análise rápida) e ainda não passaram pela análise detalhada. Clicar abre uma
 * confirmação; confirmando, a análise detalhada começa na hora.
 */

import { analyzeTargets } from "./actions/analyze-selected";
import { pendingDialog, pendingDialogText, pendingToast, pendingToastText } from "./dom";
import { send } from "./messaging";

type Target = { id: string; url: string };
type Runner = (targets: Target[]) => Promise<void>;

let pending: Target[] = [];
let runBeginner: Runner = async () => {};
let busy = false;

const plural = (n: number): string => `${n} ${n === 1 ? "carro" : "carros"}`;

export function hidePendingToast(): void {
  busy = true;
  pendingToast.hidden = true;
}

/** Relê o DB e mostra/esconde o aviso. Chamar ao abrir e ao terminar cada operação. */
export async function refreshPendingToast(): Promise<void> {
  busy = false;
  const res = await send("loadPending");
  if (busy) return; // começou outra operação enquanto lia
  pending = (res.result?.items ?? [])
    .filter((it) => it.id && it.url)
    .map((it) => ({ id: it.id as string, url: it.url as string }));
  pendingToastText.textContent = `${plural(pending.length)} com análise pendente`;
  pendingToast.hidden = !res.ok || pending.length === 0;
}

export function registerPendingToast(beginnerRunner: Runner): void {
  runBeginner = beginnerRunner;
  pendingToast.addEventListener("click", () => {
    if (pending.length === 0) return;
    pendingDialogText.textContent = `Deseja fazer a análise detalhada de ${plural(pending.length)} agora? Ela abre a página de cada anúncio e pode levar alguns minutos.`;
    pendingDialog.showModal();
  });
  pendingDialog.addEventListener("close", () => {
    if (pendingDialog.returnValue !== "yes") return;
    pendingDialog.returnValue = "";
    const targets = pending;
    hidePendingToast();
    void (document.body.dataset.mode === "advanced" ? analyzeTargets(targets) : runBeginner(targets));
  });
  void refreshPendingToast();
}
