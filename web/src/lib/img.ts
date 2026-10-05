// O painel roda como página da própria extensão (chrome-extension://), com
// host_permissions para *.olx.com.br já declarado no manifest — as imagens do
// OLX carregam direto, sem precisar de um proxy local pra contornar CORS/adblock.

/** Mantido por compatibilidade com os componentes existentes; hoje é identidade. */
export function proxiedImg(src: string | null | undefined): string {
  return src ?? "";
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
