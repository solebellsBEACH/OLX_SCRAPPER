// As imagens do OLX (`img.olx.com.br`) muitas vezes não carregam direto no
// navegador — adblock, proteção anti-rastreio, filtro de DNS. O proxy local
// (`proxy/server.mjs`) tem uma rota `GET /img?u=` que baixa a imagem no servidor
// e devolve os bytes, então o painel só precisa falar com o localhost.

import { getProxyUrl } from "./api";

/** Reescreve uma URL de imagem do OLX para passar pelo proxy local. */
export function proxiedImg(src: string | null | undefined): string {
  if (!src) return "";
  try {
    const u = new URL(src, window.location.href);
    if (/(^|\.)olx\.com\.br$/i.test(u.hostname)) {
      return `${getProxyUrl()}/img?u=${encodeURIComponent(u.toString())}`;
    }
  } catch {
    /* URL relativa/estranha: usa como veio */
  }
  return src;
}

/** `onError` de <img>: tenta a URL original uma vez, depois esconde o elemento. */
export function imgFallback(
  e: React.SyntheticEvent<HTMLImageElement>,
  original: string | null | undefined,
): void {
  const el = e.currentTarget;
  if (original && !el.dataset.fellBack && el.src !== original) {
    el.dataset.fellBack = "1";
    el.src = original;
    return;
  }
  el.style.visibility = "hidden";
}
