import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "olx.learningMode";

interface LearningCtx {
  enabled: boolean;
  toggle: () => void;
}

const Ctx = createContext<LearningCtx>({ enabled: false, toggle: () => {} });

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Modo aprendizado: quando ligado, o painel mostra explicações em cada tela. Lembra a escolha. */
export function LearningProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, enabled ? "1" : "0");
    } catch {
      /* storage bloqueado: só não lembra a preferência */
    }
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);
  const value = useMemo(() => ({ enabled, toggle }), [enabled, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLearning = () => useContext(Ctx);
