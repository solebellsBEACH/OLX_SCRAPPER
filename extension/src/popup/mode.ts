import { advancedView, beginnerView, modeAdvancedBtn, modeBeginnerBtn } from "./dom";
import { loadPrefs, savePrefs, type Mode } from "./prefs";

export function applyMode(mode: Mode): void {
  const beginner = mode === "beginner";
  beginnerView.hidden = !beginner;
  advancedView.hidden = beginner;
  modeBeginnerBtn.setAttribute("aria-pressed", String(beginner));
  modeAdvancedBtn.setAttribute("aria-pressed", String(!beginner));
  document.body.dataset.mode = mode;
}

/** Alterna Iniciante/Avançado. As duas telas ficam no DOM, então nada se perde ao trocar. */
export function registerModeToggle(): void {
  applyMode(loadPrefs().mode);
  for (const [btn, mode] of [
    [modeBeginnerBtn, "beginner"],
    [modeAdvancedBtn, "advanced"],
  ] as const) {
    btn.addEventListener("click", () => {
      savePrefs({ mode });
      applyMode(mode);
    });
  }
}
