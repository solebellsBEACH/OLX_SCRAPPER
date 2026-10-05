const LOADING_STYLE_ID = "olxw-loading-style";
const LOADING_ID = "olxw-loading";

/** Injeta o CSS do indicador de carregamento uma única vez por página. */
function ensureLoadingStyle(): void {
  if (document.getElementById(LOADING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LOADING_STYLE_ID;
  style.textContent = `
    #${LOADING_ID} {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: #1f2937;
      color: #fff;
      font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
      pointer-events: none;
    }
    #${LOADING_ID} .olxw-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: olxw-spin 0.7s linear infinite;
      flex: none;
    }
    @keyframes olxw-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

/** Mostra (ou atualiza o texto de) o indicador fixo de carregamento na página do OLX. */
export function showLoading(text: string): void {
  ensureLoadingStyle();
  let el = document.getElementById(LOADING_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = LOADING_ID;
    el.innerHTML = `<span class="olxw-spinner"></span><span class="olxw-text"></span>`;
    document.body.appendChild(el);
  }
  const textEl = el.querySelector<HTMLSpanElement>(".olxw-text");
  if (textEl) textEl.textContent = text;
}

/** Remove o indicador de carregamento, se estiver visível. */
export function hideLoading(): void {
  document.getElementById(LOADING_ID)?.remove();
}
