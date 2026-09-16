import { DB_URL } from "./constants";
import { progress } from "./progress";
import type { DbRecord } from "./types";

export async function dbAll(): Promise<Record<string, DbRecord>> {
  try {
    const res = await fetch(DB_URL);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; db?: Record<string, DbRecord> };
    return data.ok && data.db ? data.db : {};
  } catch {
    return {};
  }
}

export async function dbUpsert(id: string, patch: Record<string, unknown>): Promise<DbRecord> {
  const record: DbRecord = { ...patch, id, analyzedAt: Date.now() };
  const res = await fetch(DB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, record }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    db?: Record<string, DbRecord>;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Falha ao gravar db.json (HTTP ${res.status}). O proxy está rodando?`);
  }
  return data.db?.[id] ?? record;
}

/** Grava um lote de registros (merge por id no proxy). */
async function dbUpsertBatch(records: DbRecord[]): Promise<void> {
  const res = await fetch(DB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Falha ao gravar db.json (HTTP ${res.status}). O proxy está rodando?`);
  }
}

/** Grava muitos registros em lotes de `size`. Devolve quantos foram gravados. */
export async function dbUpsertMany(records: DbRecord[], size = 40): Promise<number> {
  let saved = 0;
  for (let i = 0; i < records.length; i += size) {
    const batch = records.slice(i, i + size);
    await dbUpsertBatch(batch);
    saved += batch.length;
    progress(`Salvando no db.json: ${saved}/${records.length}...`, { state: "running" });
  }
  return saved;
}

export async function dbClear(): Promise<void> {
  const res = await fetch(DB_URL, { method: "DELETE" });
  if (!res.ok) throw new Error(`Falha ao limpar db.json (HTTP ${res.status}).`);
}
