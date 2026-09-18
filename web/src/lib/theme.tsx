import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "olx.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

// Aplica já na importação (antes do primeiro render) pra não piscar o tema errado.
apply(readPref());

interface ThemeCtx {
  pref: ThemePref;
  cycle: () => void;
}

const Ctx = createContext<ThemeCtx>({ pref: "system", cycle: () => {} });
const ORDER: ThemePref[] = ["system", "light", "dark"];

/** Preferência de tema: "sistema" acompanha o SO em tempo real; claro/escuro fixam. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>(readPref);

  useEffect(() => {
    apply(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* storage bloqueado: só não lembra a preferência */
    }
    if (pref !== "system") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const cycle = useCallback(() => setPref((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]), []);
  const value = useMemo(() => ({ pref, cycle }), [pref, cycle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
