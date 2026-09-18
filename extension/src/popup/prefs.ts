export type Mode = "beginner" | "advanced";
export type BeginnerAction = "current" | "all";

export interface Prefs {
  mode: Mode;
  action: BeginnerAction;
  quickAnalysis: boolean;
  autoScroll: boolean;
  showIndicators: boolean;
  maxPages: number;
}

const KEY = "olx_popup_prefs";

const DEFAULTS: Prefs = {
  mode: "beginner",
  action: "current",
  quickAnalysis: false,
  autoScroll: false,
  showIndicators: true,
  maxPages: 5,
};

/** Preferências da interface (localStorage; se estiver indisponível, usa os padrões). */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Prefs>) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* sem persistência — segue com o estado em memória */
  }
}
