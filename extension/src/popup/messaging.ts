import type { DispatchResponse } from "./types";

export async function send(action: string, extra: Record<string, unknown> = {}): Promise<DispatchResponse> {
  try {
    const response = (await chrome.runtime.sendMessage({ action, ...extra })) as
      | DispatchResponse
      | undefined;
    return response ?? { ok: false, error: "A extensão não respondeu. Recarregue a extensão e tente novamente." };
  } catch {
    return { ok: false, error: "A comunicação com a extensão foi interrompida. Recarregue a extensão e tente novamente." };
  }
}
