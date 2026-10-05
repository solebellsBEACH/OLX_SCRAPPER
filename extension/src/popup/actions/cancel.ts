import { cancelAdvBtn } from "../dom";
import { send } from "../messaging";
import { setStatus } from "../status";

/** Pede ao background para interromper a operação em andamento. */
export async function requestCancel(): Promise<void> {
  await send("cancel");
}

export function registerCancelActions(): void {
  cancelAdvBtn.addEventListener("click", () => {
    cancelAdvBtn.disabled = true;
    setStatus("⏳ Cancelando...");
    void requestCancel();
  });
}
