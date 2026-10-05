import type { MarkItem } from "./types";

const MARK_STYLE_ID = "olxw-mark-style";
const LEGEND_ID = "olxw-legend";

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
      outline: 3px dotted #6b7280 !important;
      outline-offset: -3px;
      border-radius: 8px;
    }
    section.olx-adcard[data-olxw-status="quick"] {
      outline: 3px dashed #3b82f6 !important;
      outline-offset: -3px;
      border-radius: 8px;
    }
    /* Selo vai logo depois do preço (fora da foto): não cobre o favoritar nem os selos
       da OLX ("Destaque", "Histórico Veicular"). Cores com texto branco >= 4.5:1. */
    .olxw-score-badge {
      display: inline-block;
      width: fit-content;
      margin: 4px 0 0 8px;
      padding: 3px 8px;
      border-radius: 999px;
      background: #15803d;
      color: #fff;
      font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      vertical-align: middle;
      white-space: nowrap;
      cursor: help;
    }
    .olxw-score-badge[data-tier="low"] { background: #b91c1c; }
    .olxw-score-badge[data-tier="mid"] { background: #b45309; }
    /* fallback sem preço nem título: canto inferior esquerdo do card */
    section.olx-adcard > .olxw-score-badge {
      position: absolute;
      left: 6px;
      bottom: 6px;
      z-index: 20;
      margin: 0;
    }
    #${LEGEND_ID} {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 2147483000;
      max-width: 280px;
      padding: 6px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fff;
      color: #1f2937;
      font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    #${LEGEND_ID} summary { cursor: pointer; font-weight: 700; }
    #${LEGEND_ID} ul { margin: 6px 0 2px; padding: 0; list-style: none; }
    #${LEGEND_ID} li { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
    #${LEGEND_ID} .olxw-sw {
      flex: none;
      width: 14px;
      height: 10px;
      border-radius: 2px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Legenda fixa e discreta (recolhida) no canto da página: explica as bordas e o selo,
 * que sem isso parecem destaque pago da OLX.
 */
function ensureLegend(): void {
  if (document.getElementById(LEGEND_ID)) return;
  const legend = document.createElement("details");
  legend.id = LEGEND_ID;
  legend.innerHTML = `
    <summary>Legenda · OLX Workspace</summary>
    <ul>
      <li><span class="olxw-sw" style="border:3px solid #16a34a"></span>Analisado pela IA</li>
      <li><span class="olxw-sw" style="border:3px dashed #3b82f6"></span>Análise rápida (sem IA)</li>
      <li><span class="olxw-sw" style="border:3px dotted #6b7280"></span>Salvo, aguardando análise</li>
      <li><span class="olxw-sw" style="background:#15803d"></span>Nota 80 ou mais (de 100)</li>
      <li><span class="olxw-sw" style="background:#b45309"></span>Nota 50 a 79</li>
      <li><span class="olxw-sw" style="background:#b91c1c"></span>Nota abaixo de 50</li>
    </ul>`;
  document.body.appendChild(legend);
}

/** Onde o selo entra: logo depois do preço; sem preço, depois do título; sem nenhum, no canto inferior do card. */
function placeBadge(section: HTMLElement, badge: HTMLElement): void {
  // querySelector com lista devolve o primeiro na ordem do DOM — por isso duas buscas
  const anchor =
    section.querySelector<HTMLElement>(".olx-adcard__price") ??
    section.querySelector<HTMLElement>(".olx-adcard__title");
  if (anchor) anchor.insertAdjacentElement("afterend", badge);
  else section.appendChild(badge);
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
  let applied = 0;
  for (const mark of marks) {
    if (!mark.id) continue;
    const section = document.querySelector<HTMLElement>(`section.olx-adcard[data-olxw-id="${CSS.escape(mark.id)}"]`);
    if (!section) continue; // card não está (mais) visível nesta página

    const currentStatus = section.getAttribute("data-olxw-status") as MarkItem["status"] | null;
    if (currentStatus && STATUS_PRIORITY[currentStatus] > STATUS_PRIORITY[mark.status]) continue;

    section.setAttribute("data-olxw-status", mark.status);
    applied++;

    const existingBadge = section.querySelector<HTMLSpanElement>(".olxw-score-badge");
    const hasScore = mark.status !== "pending" && typeof mark.score === "number" && Number.isFinite(mark.score);
    if (!hasScore) {
      existingBadge?.remove();
      continue;
    }
    const score = Math.round(mark.score as number);
    const badge = existingBadge ?? document.createElement("span");
    badge.className = "olxw-score-badge";
    badge.setAttribute("role", "img");
    const tier = scoreTier(score);
    if (tier === "high") badge.removeAttribute("data-tier");
    else badge.setAttribute("data-tier", tier);
    const isQuick = mark.status === "quick";
    // "Condição" + "/100" deixa claro que é a condição estimada pela IA (categoria.score),
    // e não a nota de Oportunidade do painel — são números diferentes.
    badge.textContent = isQuick ? `⚡ ${score}/100` : `Condição ${score}/100`;
    badge.title = isQuick
      ? `Nota rápida (${score}/100) — estimada só com km/ano do card, sem IA.`
      : `Condição estimada pela IA: ${score}/100. No painel aparece como "Condição (IA)".`;
    // title = tooltip no hover; aria-label = o mesmo texto pro leitor de tela
    badge.setAttribute("aria-label", badge.title);
    if (!existingBadge) placeBadge(section, badge);
  }
  if (applied > 0) ensureLegend();
}

/** Remove toda borda/score pintados e pausa o auto-mark até o próximo "Exibir". */
export function hideIndicators(): void {
  indicatorsHidden = true;
  document.querySelectorAll<HTMLElement>("section.olx-adcard[data-olxw-status]").forEach((section) => {
    section.removeAttribute("data-olxw-status");
    section.querySelector(".olxw-score-badge")?.remove();
  });
  document.getElementById(LEGEND_ID)?.remove();
}
