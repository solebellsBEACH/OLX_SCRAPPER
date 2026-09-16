import { PROXY_BASE } from "./constants";

/** Garante que o proxy local está no ar; senão, erro claro. */
export async function ensureProxy(): Promise<void> {
  try {
    const res = await fetch(`${PROXY_BASE}/health`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (res.ok) return;
  } catch {
    /* cai no throw abaixo */
  }
  throw new Error(
    `Proxy offline em ${PROXY_BASE}. Abra um terminal e rode:  cd proxy && npm start`,
  );
}
