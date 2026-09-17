import { categorize } from "../ai-categorize";
import { dbAll, dbUpsert } from "../db";
import { detailToSection, isDeepAnalyzed } from "../items";
import { progress } from "../progress";
import { delay, getActiveOlxTab, injectContent, navigate } from "../tabs";
import type { DbRecord, SelectedResult, Target } from "../types";
import { isCarro } from "../vehicle-filter";

export async function analyzeSelected(targets: Target[], force = false): Promise<SelectedResult> {
  const analyzed: DbRecord[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  const skipped: string[] = [];
  const nonCar: string[] = [];

  // pula o que já foi feito: id no db.json e NÃO raso (já tem detail da página)
  const db = await dbAll();
  const pending = targets.filter((t) => {
    const rec = db[t.id];
    const alreadyDone = isDeepAnalyzed(rec);
    if (alreadyDone && !force) {
      skipped.push(t.id);
      return false;
    }
    return true;
  });
  if (skipped.length > 0) {
    progress(`${skipped.length} já analisado(s) — pulando.`);
  }

  const tab = await getActiveOlxTab();
  const tabId = tab.id;
  const originalUrl = tab.url ?? null;

  for (let i = 0; i < pending.length; i += 1) {
    const t = pending[i];
    const pos = `${i + 1}/${pending.length}`;
    try {
      progress(`Navegando até o anúncio ${t.id} (${pos})...`, { id: t.id, state: "running" });
      await navigate(tabId, t.url, 25000);
      await delay(1800); // deixa o React popular a página

      await injectContent(tabId);

      let data: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 3 && !data; attempt += 1) {
        const resp = (await chrome.tabs.sendMessage(tabId, { action: "extractAdPage" })) as
          | { ok: boolean; data: Record<string, unknown> }
          | undefined;
        data = resp?.data ?? null;
        if (!data) await delay(1200);
      }
      if (!data) throw new Error("não consegui ler os dados da página");

      progress(`Categorizando ${t.id} no DeepSeek (${pos})...`, { id: t.id, state: "running" });
      const { categorias } = await categorize([detailToSection(t.id, data)]);
      const categoria = Array.isArray(categorias) ? (categorias[0] ?? null) : null;

      if (!isCarro(categoria)) {
        nonCar.push(t.id);
        progress(`↷ ${t.id} ignorado — não é carro (${pos})`, { id: t.id, state: "error" });
        continue;
      }

      const record = await dbUpsert(t.id, {
        url: t.url,
        detail: data,
        categoria,
        htmlLength: data.htmlLength ?? null,
        // O merge no store é raso (spread por cima do registro existente): sem isto, um
        // registro que começou raso (shallow: true) nunca deixa de ser "raso" na base,
        // mesmo depois de analisado a fundo — e "Carregar pendentes" volta a listá-lo pra
        // sempre. Só marcar como concluído zera o flag de fato.
        shallow: false,
      });
      analyzed.push(record);
      progress(`✔ ${t.id} salvo no DB (${pos})`, { id: t.id, state: "done" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ id: t.id, error: msg });
      progress(`✖ ${t.id}: ${msg}`, { id: t.id, state: "error" });
    }
  }

  // volta a aba para a listagem original
  if (originalUrl && pending.length > 0) {
    await chrome.tabs.update(tabId, { url: originalUrl }).catch(() => {});
  }

  return { analyzed, errors, skipped, nonCar };
}
