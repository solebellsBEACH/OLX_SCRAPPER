/**
 * Indicador de carregamento fixo, pintado DIRETO na página do OLX (não só no
 * popup) enquanto a extensão está processando algo — analisar, varrer
 * páginas, analisar selecionados. Best-effort: se a aba já mudou de página
 * (navegação) e o content script ainda não recarregou, a mensagem simplesmente
 * falha e é ignorada.
 */
export async function setPageLoading(tabId: number, text: string): Promise<void> {
  await chrome.tabs.sendMessage(tabId, { action: "showLoading", text }).catch(() => {
    /* aba sem o content script (navegou pra outro lugar) — ignora */
  });
}

export async function clearPageLoading(tabId: number): Promise<void> {
  await chrome.tabs.sendMessage(tabId, { action: "hideLoading" }).catch(() => {
    /* idem */
  });
}
