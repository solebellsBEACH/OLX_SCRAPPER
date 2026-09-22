import { OLX_BRASIL_RE, OLX_CARROS_RE, OLX_URL_RE, isCarSearchQuery } from "./constants";

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

/**
 * Aba do OLX que é uma busca de carros: categoria dedicada
 * (`carros-vans-e-utilitarios`) ou busca nacional (`/brasil?q=...`) cujo
 * termo pesquisado é reconhecidamente sobre veículos.
 */
export function isCarrosOlxUrl(url: string | undefined): boolean {
  if (!url || !OLX_URL_RE.test(url)) return false;
  if (OLX_CARROS_RE.test(url)) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const q = parsed.searchParams.get("q");
  return Boolean(OLX_BRASIL_RE.test(parsed.pathname) && q && isCarSearchQuery(q));
}

/**
 * Aba do OLX alvo da ação. Por padrão aceita qualquer aba do OLX; com
 * `requireCarSearch` exige uma busca de carros (usado só por "Analisar página",
 * onde o usuário é quem abriu a página).
 */
export async function getActiveOlxTab(
  { requireCarSearch = false }: { requireCarSearch?: boolean } = {},
): Promise<chrome.tabs.Tab & { id: number }> {
  const accepts = (url: string | undefined): boolean =>
    requireCarSearch ? isCarrosOlxUrl(url) : Boolean(url && OLX_URL_RE.test(url));
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && accepts(active.url)) {
    return active as chrome.tabs.Tab & { id: number };
  }
  const olxTabs = await chrome.tabs.query({ url: "https://*.olx.com.br/*" });
  const chosen = olxTabs.find((t) => t.active && accepts(t.url)) ?? olxTabs.find((t) => accepts(t.url));
  if (!chosen || chosen.id === undefined) {
    throw new Error(
      requireCarSearch
        ? "Abra uma página de busca de carros do OLX (categoria 'carros-vans-e-utilitarios' ou busca em olx.com.br/brasil?q=... com um termo de veículo) e tente de novo."
        : "Abra uma página do OLX e tente de novo.",
    );
  }
  return chosen as chrome.tabs.Tab & { id: number };
}

export async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}
