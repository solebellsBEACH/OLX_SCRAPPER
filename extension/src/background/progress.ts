export function progress(text: string, extra: Record<string, unknown> = {}): void {
  chrome.runtime.sendMessage({ type: "progress", text, ...extra }).catch(() => {
    /* popup fechado */
  });
}
