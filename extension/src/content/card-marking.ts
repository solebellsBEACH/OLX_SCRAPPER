import type { MarkItem } from "./types";

const MARK_STYLE_ID = "olxw-mark-style";

/** Injeta o CSS da marcação uma única vez por página. */
function ensureMarkStyle(): void {
  if (window.__olxWorkspaceStyled) return;
  window.__olxWorkspaceStyled = true;
  const style = document.createElement("style");
  style.id = MARK_STYLE_ID;
  style.textContent = `
    section.olx-adcard[data-olxw-status] { position: relative !important; }
    section.olx-adcard[data-olxw-status="done"] {
      outline: 3px solid #16a34a !important;
      outline-offset: -3px;
      border-radius: 8px;
    }
    section.olx-adcard[data-olxw-status="pending"] {
      outline: 3px solid #eab308 !important;
      outline-offset: -3px;
      border-radius: 8px;
    }
    section.olx-adcard[data-olxw-status="quick"] {
      outline: 3px dashed #3b82f6 !important;
      outline-offset: -3px;
      border-radius: 8px;
    }
    .olxw-score-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      z-index: 20;
      min-width: 30px;
      padding: 3px 7px;
      border-radius: 999px;
      background: #16a34a;
      color: #fff;
      font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      pointer-events: none;
    }
    .olxw-score-badge[data-tier="low"] { background: #dc2626; }
    .olxw-score-badge[data-tier="mid"] { background: #d97706; }
  `;
  document.head.appendChild(style);
}

/** score >=80 verde, 50-79 laranja, <50 vermelho. */
function scoreTier(score: number): "low" | "mid" | "high" {
  if (score < 50) return "low";
  if (score < 80) return "mid";
  return "high";
}

/**
 * Enquanto true, `autoMarkVisibleCards()` não faz nada — é assim que "Ocultar
 * indicadores" impede que o auto-mark (rodando a cada mutação do DOM) pinte
 * tudo de novo 1s depois de ocultado. Volta a false em qualquer `markCards()`
 * (seja pelo auto-mark, pelo "Analisar página" ou pelo "Exibir indicadores").
 */
let indicatorsHidden = false;

export function isIndicatorsHidden(): boolean {
  return indicatorsHidden;
}

/**
 * Prioridade de status pra decidir quem pode sobrescrever quem: um score da IA
 * ("done") nunca é rebaixado por um "pending"/"quick" tardio (ex.: o auto-mark
 * rodando de novo por causa de outra mutação da página); o heurístico
 * ("quick") também não é apagado por um "pending" — só por "done" (IA de
 * verdade) ou por outro "quick"/"done" mais recente.
 */
const STATUS_PRIORITY: Record<MarkItem["status"], number> = { pending: 0, quick: 1, done: 2 };

export function markCards(marks: MarkItem[]): void {
  indicatorsHidden = false;
  ensureMarkStyle();
  for (const mark of marks) {
    if (!mark.id) continue;
    const section = document.querySelector<HTMLElement>(`section.olx-adcard[data-olxw-id="${CSS.escape(mark.id)}"]`);
    if (!section) continue; // card não está (mais) visível nesta página

    const currentStatus = section.getAttribute("data-olxw-status") as MarkItem["status"] | null;
    if (currentStatus && STATUS_PRIORITY[currentStatus] > STATUS_PRIORITY[mark.status]) continue;

    section.setAttribute("data-olxw-status", mark.status);

    const existingBadge = section.querySelector<HTMLDivElement>(".olxw-score-badge");
    const hasScore = mark.status !== "pending" && typeof mark.score === "number" && Number.isFinite(mark.score);
    if (!hasScore) {
      existingBadge?.remove();
      continue;
    }
    const score = Math.round(mark.score as number);
    const badge = existingBadge ?? document.createElement("div");
    badge.className = "olxw-score-badge";
    const tier = scoreTier(score);
    if (tier === "high") badge.removeAttribute("data-tier");
    else badge.setAttribute("data-tier", tier);
    const isQuick = mark.status === "quick";
    badge.textContent = isQuick ? `⚡${score}` : `${score}`;
    badge.title = isQuick
      ? `Score rápido (${score}/100) — estimado só com km/ano do card, sem IA.`
      : `Score de condição estimado pela IA: ${score}/100`;
    if (!existingBadge) section.appendChild(badge);
  }
}

/** Remove toda borda/score pintados e pausa o auto-mark até o próximo "Exibir". */
export function hideIndicators(): void {
  indicatorsHidden = true;
  document.querySelectorAll<HTMLElement>("section.olx-adcard[data-olxw-status]").forEach((section) => {
    section.removeAttribute("data-olxw-status");
    section.querySelector(".olxw-score-badge")?.remove();
  });
}
