import { scrollBtn } from "../dom";
import { send } from "../messaging";
import { lockButtons } from "../render/list";
import { setStatus } from "../status";

export function registerScrollAction(): void {
  scrollBtn.addEventListener("click", () => {
    void (async () => {
      lockButtons(true);
      setStatus("⏳ Rolando a página...");
      try {
        const response = await send("autoScroll");
        setStatus(response.ok ? "✅ Scroll concluído" : `❌ ${response.error ?? "Erro."}`);
      } finally {
        lockButtons(false);
      }
    })();
  });
}
