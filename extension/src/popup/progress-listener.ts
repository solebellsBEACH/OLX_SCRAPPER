import { listEl } from "./dom";
import { renderItem } from "./render/item-row";
import { state } from "./state";
import { setStatus } from "./status";
import type { ProgressMessage } from "./types";

/** progresso do analyzeSelected (e do scroll automático). */
export function registerProgressListener(): void {
  chrome.runtime.onMessage.addListener((msg: ProgressMessage) => {
    if (msg?.type === "scrollProgress") {
      console.log(`[OLX Workspace] ${msg.text}`);
      setStatus(msg.text);
      return;
    }
    if (msg?.type !== "progress") return;
    console.log(`[OLX Workspace] ${msg.text}`);
    setStatus(msg.text);
    if (msg.id && msg.state) {
      state.rowState.set(msg.id, msg.state);
      const row = listEl.querySelector<HTMLDivElement>(`.item[data-id="${CSS.escape(msg.id)}"]`);
      if (row) {
        const fresh = renderItem(state.items.find((i) => i.id === msg.id) ?? {});
        row.replaceWith(fresh);
      }
    }
  });
}
