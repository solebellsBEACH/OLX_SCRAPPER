/**
 * Cancelamento cooperativo da operação longa em andamento (analisar, varrer, analisar
 * selecionados, rolar). O popup manda "cancel"; as ações checam `throwIfCancelled()` entre
 * os passos e a chamada à IA em curso é abortada via `cancelSignal()`.
 */
export class CancelledError extends Error {
  constructor() {
    super("Operação cancelada.");
    this.name = "CancelledError";
  }
}

let controller = new AbortController();

/** Chamar no início de cada operação longa. */
export function beginOperation(): void {
  controller = new AbortController();
}

export function requestCancel(): void {
  controller.abort();
}

export function cancelSignal(): AbortSignal {
  return controller.signal;
}

export function throwIfCancelled(): void {
  if (controller.signal.aborted) throw new CancelledError();
}
