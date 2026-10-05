import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { Db } from "@/types";
import { toRows } from "./rows";

type Status = "loading" | "ready" | "empty" | "error";

interface UseDb {
  db: Db;
  rows: ReturnType<typeof toRows>;
  status: Status;
  error: string | null;
  refetch: () => void;
}

export function useDb(): UseDb {
  const [db, setDb] = useState<Db>({});
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setStatus((s) => (s === "error" ? "loading" : s));
    try {
      const next = await api.getDb();
      if (!alive.current) return;
      setDb(next);
      setError(null);
      setStatus(Object.keys(next).length === 0 ? "empty" : "ready");
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof ApiError ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // Recarrega ao voltar para a aba do painel — assim o garimpo/varredura feito
  // na extensão aparece sem precisar dar F5.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const rows = useMemo(() => toRows(db), [db]);
  return { db, rows, status, error, refetch: load };
}

type AiState = "checking" | "ready" | "nokey";

/** Só olha se o provedor de IA ativo tem chave configurada (chrome.storage.local) — sem polling de rede. */
export function useAiStatus() {
  const [state, setState] = useState<AiState>("checking");
  const [detail, setDetail] = useState<string>("");

  const check = useCallback(async () => {
    try {
      const config = await api.getConfig();
      const active = config.providers.find((p) => p.id === config.activeId);
      const needsKey = active?.presetId !== "custom";
      setState(active && (active.hasKey || !needsKey) ? "ready" : "nokey");
      setDetail(active ? `${active.label} · ${active.model}` : "Nenhum provedor cadastrado");
    } catch {
      setState("nokey");
      setDetail("");
    }
  }, []);

  useEffect(() => {
    void check();
    const onFocus = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [check]);

  return { state, detail };
}
