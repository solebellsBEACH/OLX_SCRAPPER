import { progress } from "./progress";
import * as store from "./store";
import type { DbRecord } from "./types";

export async function dbAll(): Promise<Record<string, DbRecord>> {
  return store.dbAll();
}

export async function dbUpsert(id: string, patch: Record<string, unknown>): Promise<DbRecord> {
  return store.dbUpsert(id, { ...patch, analyzedAt: Date.now() });
}

/** Grava muitos registros em lotes de `size`. Devolve quantos foram gravados. */
export async function dbUpsertMany(records: DbRecord[], size = 40): Promise<number> {
  let saved = 0;
  for (let i = 0; i < records.length; i += size) {
    const batch = records.slice(i, i + size);
    await store.dbUpsertMany(batch);
    saved += batch.length;
    progress(`Salvando: ${saved}/${records.length}...`, { state: "running" });
  }
  return saved;
}

export async function dbClear(): Promise<void> {
  await store.dbClear();
}
