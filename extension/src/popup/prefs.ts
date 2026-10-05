export type Mode = "beginner" | "advanced";
export type BeginnerAction = "current" | "all";

export interface Prefs {
  mode: Mode;
  action: BeginnerAction;
  maxPages: number;
  /** quantos anúncios (do topo da página) entram na "análise rápida" do Modo Iniciante. */
  quickCount: number;
  /** tutorial passo a passo: roda sozinho ao abrir a extensão até o usuário terminar/pular uma vez. */
  tourAuto: boolean;
  /** já rodou (terminou ou foi pulado) alguma vez — não dispara mais sozinho, só pelo botão "Tutorial". */
  tourSeen: boolean;
}

const KEY = "olx_popup_prefs";

const DEFAULTS: Prefs = {
  mode: "beginner",
  action: "current",
  maxPages: 5,
  quickCount: 5,
  tourAuto: true,
  tourSeen: false,
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
