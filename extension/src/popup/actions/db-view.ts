import { clearDbBtn, dbDumpEl, viewDbBtn } from "../dom";
import { send } from "../messaging";
import { renderPage } from "../render/list";
import { state } from "../state";
import { setStatus } from "../status";

export async function refreshDbFlags(): Promise<void> {
  const response = await send("getDb");
  const db = (response.db ?? {}) as Record<string, { shallow?: boolean }>;
  for (const it of state.items) {
    const rec = it.id ? db[it.id] : undefined;
    it.inDb = Boolean(rec);
    it.deepAnalyzed = Boolean(rec && !rec.shallow);
  }
}

export function registerDbViewActions(): void {
  viewDbBtn.addEventListener("click", () => {
    void (async () => {
      if (!dbDumpEl.hidden) {
        dbDumpEl.hidden = true;
        return;
      }
      const response = await send("getDb");
      dbDumpEl.textContent = JSON.stringify(response.db ?? {}, null, 2);
      dbDumpEl.hidden = false;
    })();
  });

  clearDbBtn.addEventListener("click", () => {
    void (async () => {
      await send("clearDb");
      await refreshDbFlags();
      renderPage();
      if (!dbDumpEl.hidden) dbDumpEl.textContent = "{}";
      setStatus("🗑️ DB limpo.");
    })();
  });
}
