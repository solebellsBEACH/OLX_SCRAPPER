import { categorizeInChunks } from "./ai-categorize";
import { dbUpsert } from "./db";
import { detailToSection, scoreOf } from "./items";
import { progress } from "./progress";
import type { Card, Categoria, DbRecord, Item } from "./types";

/**
 * Para itens já analisados a fundo (estão no db.json com `detail`) mas cuja
 * categoria ainda não tem `score`, pede à IA só o score — usando os dados da
 * página que JÁ estão salvos (sem navegar de novo até o anúncio). Assim, um
 * carro analisado antes desta feature existir ganha o score assim que
 * aparecer de novo na tela do "Analisar página".
 */
export async function backfillScores(items: Item[], db: Record<string, DbRecord>): Promise<void> {
  const pending = items.filter((it) => {
    const id = typeof it.id === "string" ? it.id : null;
    if (!id || !it.deepAnalyzed) return false;
    const rec = db[id];
    return Boolean(rec) && scoreOf((rec as Record<string, unknown>).categoria) === null;
  });
  if (pending.length === 0) return;

  progress(`Calculando score de condição para ${pending.length} anúncio(s) já analisado(s)...`, { state: "running" });
  const sections = pending.map((it, i) => {
    const id = it.id as string;
    const rec = db[id] as unknown as { detail?: Record<string, unknown> };
    return { ...detailToSection(id, rec.detail ?? null), index: i };
  });
  const { categorias } = await categorizeInChunks(sections as unknown as Card[]);
  if (!Array.isArray(categorias)) return;

  for (let i = 0; i < pending.length; i += 1) {
    const it = pending[i];
    const id = it.id as string;
    const scoreCat = categorias[i] as Categoria | undefined;
    const score = scoreOf(scoreCat);
    if (score === null) continue;
    const rec = db[id] as unknown as { categoria?: Categoria | null };
    const mergedCategoria = { ...(rec.categoria ?? {}), score, scoreMotivo: (scoreCat as Record<string, unknown>)?.scoreMotivo ?? null };
    try {
      const saved = await dbUpsert(id, { categoria: mergedCategoria });
      db[id] = saved;
      it.categoria = mergedCategoria;
    } catch {
      /* sem score desta vez; tenta de novo na próxima análise */
    }
  }
}
