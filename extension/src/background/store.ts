import type { DbRecord } from "./types";

/** Substitui db.json: mapa { [id]: DbRecord } guardado em chrome.storage.local. */
const DB_KEY = "olx.db";

async function readRaw(): Promise<Record<string, DbRecord>> {
  const data = await chrome.storage.local.get(DB_KEY);
  const db = data[DB_KEY];
  return db && typeof db === "object" ? (db as Record<string, DbRecord>) : {};
}

async function writeRaw(db: Record<string, DbRecord>): Promise<void> {
  await chrome.storage.local.set({ [DB_KEY]: db });
}

export async function dbAll(): Promise<Record<string, DbRecord>> {
  return readRaw();
}

export async function dbUpsert(id: string, patch: Record<string, unknown>): Promise<DbRecord> {
  const db = await readRaw();
  const record = { ...(db[id] ?? {}), ...patch, id, savedAt: new Date().toISOString() } as DbRecord;
  db[id] = record;
  await writeRaw(db);
  return record;
}

/** Grava um lote de registros (merge por id). */
export async function dbUpsertMany(records: Array<Partial<DbRecord> & { id: string }>): Promise<Record<string, DbRecord>> {
  const db = await readRaw();
  for (const rec of records) {
    if (!rec || !rec.id) continue;
    const id = String(rec.id);
    db[id] = { ...(db[id] ?? {}), ...rec, id, savedAt: new Date().toISOString() } as DbRecord;
  }
  await writeRaw(db);
  return db;
}

export async function dbRemove(id: string): Promise<Record<string, DbRecord>> {
  const db = await readRaw();
  delete db[id];
  await writeRaw(db);
  return db;
}

export async function dbClear(): Promise<void> {
  await writeRaw({});
}

/** Importa um db.json exportado anteriormente (merge por id, sem apagar o que já existe). */
export async function dbImport(incoming: Record<string, DbRecord>): Promise<Record<string, DbRecord>> {
  const db = await readRaw();
  for (const [id, rec] of Object.entries(incoming ?? {})) {
    if (!rec || typeof rec !== "object") continue;
    db[id] = { ...(db[id] ?? {}), ...rec, id };
  }
  await writeRaw(db);
  return db;
}
