import { OLX_CARROS_RE, OLX_URL_RE } from "./constants";

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Navega a aba `tabId` até `url` e espera terminar de carregar (best-effort). */
export async function navigate(tabId: number, url: string, timeoutMs: number): Promise<void> {
  const adId = url.split(/[?#]/)[0].split("-").pop() ?? "";
  await chrome.tabs.update(tabId, { url });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(400);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === "complete" && (!adId || tab.url?.includes(adId))) return;
  }
}

/** OLX pagina a listagem pelo query param `o` (o=2, o=3, ...). o=1 é sem o param. */
export function withPage(url: string, page: number): string {
  const u = new URL(url);
  if (page <= 1) u.searchParams.delete("o");
  else u.searchParams.set("o", String(page));
  return u.toString();
}

export function pageOf(url: string | undefined | null): number {
  if (!url) return 1;
  const o = Number(new URL(url).searchParams.get("o") ?? "1");
  return Number.isFinite(o) && o >= 1 ? o : 1;
}

/** Mesma listagem (ignora o `o` e a ordem dos params)? */
export function sameListing(a: string, b: string): boolean {
  const norm = (s: string): string => {
    const u = new URL(s);
    u.searchParams.delete("o");
    u.searchParams.sort();
    return `${u.origin}${u.pathname}?${u.searchParams.toString()}`;
  };
  try {
    return norm(a) === norm(b);
  } catch {
    return false;
  }
}

/** Aba do OLX na categoria de carros (URL com `carros-vans-e-utilitarios`). */
function isCarrosOlxUrl(url: string | undefined): boolean {
  return Boolean(url && OLX_URL_RE.test(url) && OLX_CARROS_RE.test(url));
}

export async function getActiveOlxTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && isCarrosOlxUrl(active.url)) {
    return active as chrome.tabs.Tab & { id: number };
  }
  const olxTabs = await chrome.tabs.query({ url: "https://*.olx.com.br/*" });
  const chosen =
    olxTabs.find((t) => t.active && isCarrosOlxUrl(t.url)) ?? olxTabs.find((t) => isCarrosOlxUrl(t.url));
  if (!chosen || chosen.id === undefined) {
    throw new Error(
      "Abra uma página de carros do OLX (URL com 'carros-vans-e-utilitarios') e tente de novo.",
    );
  }
  return chosen as chrome.tabs.Tab & { id: number };
}

export async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}
