/**
 * Tutorial guiado (spotlight passo a passo) do popup. Por padrão (`tourAuto`
 * em prefs.ts) roda sozinho na primeira vez que a extensão é aberta; depois
 * disso só volta pelo botão "🎓 Tutorial" no cabeçalho.
 */

import { applyMode } from "./mode";
import {
  choiceCurrent,
  openPanelBtn,
  pagesCard,
  quickCountCard,
  startBtn,
  tourBack,
  tourBtn,
  tourCard,
  tourHighlight,
  tourNext,
  tourOverlay,
  tourSkip,
  tourStepLabel,
  tourText,
  tourTitle,
} from "./dom";
import { loadPrefs, savePrefs, type Mode } from "./prefs";

interface Step {
  target: () => HTMLElement;
  title: string;
  text: string;
}

const steps: Step[] = [
  {
    target: () => document.querySelector<HTMLElement>(".mode-toggle") ?? choiceCurrent,
    title: "Dois jeitos de usar",
    text: "No modo Iniciante você é guiado passo a passo. No Avançado ficam todas as ferramentas soltas, pra quem já conhece a extensão.",
  },
  {
    target: () => document.querySelector<HTMLElement>(".choices") ?? choiceCurrent,
    title: "1 · O que você quer fazer?",
    text: "\"Analisar esta página\" olha só os anúncios que já estão na tela agora. \"Varrer todas as páginas\" passa por várias páginas de resultados, uma atrás da outra.",
  },
  {
    target: () => (quickCountCard.hidden ? pagesCard : quickCountCard),
    title: "2 · Ajuste o tamanho da análise",
    text: "Escolha quantos anúncios (até 50) ou quantas páginas (até 10) entram na análise — quanto menos, mais rápido o resultado sai.",
  },
  {
    target: () => startBtn,
    title: "3 · Comece quando quiser",
    text: "Clique aqui pra rodar a análise. Dá pra cancelar a qualquer momento enquanto ela roda, sem perder nada.",
  },
  {
    target: () => openPanelBtn,
    title: "O painel completo",
    text: "Depois de analisar, abra o painel pra ver o dashboard, comparar carros lado a lado e configurar qual IA usar.",
  },
];

let index = 0;
let previousMode: Mode | null = null;

function place(): void {
  const target = steps[index].target();
  const rect = target.getBoundingClientRect();
  const pad = 6;
  tourHighlight.style.top = `${rect.top - pad}px`;
  tourHighlight.style.left = `${rect.left - pad}px`;
  tourHighlight.style.width = `${rect.width + pad * 2}px`;
  tourHighlight.style.height = `${rect.height + pad * 2}px`;

  tourStepLabel.textContent = `Passo ${index + 1} de ${steps.length}`;
  tourTitle.textContent = steps[index].title;
  tourText.textContent = steps[index].text;
  tourBack.hidden = index === 0;
  tourNext.textContent = index === steps.length - 1 ? "Concluir" : "Próximo ›";

  const cardRect = tourCard.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const top =
    spaceBelow > cardRect.height + 16
      ? rect.bottom + 12
      : Math.max(12, rect.top - cardRect.height - 12);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - cardRect.width - 12);
  tourCard.style.top = `${top}px`;
  tourCard.style.left = `${left}px`;
}

function finish(): void {
  tourOverlay.hidden = true;
  savePrefs({ tourSeen: true });
  if (previousMode) applyMode(previousMode);
  previousMode = null;
}

function start(): void {
  index = 0;
  previousMode = loadPrefs().mode;
  applyMode("beginner");
  tourOverlay.hidden = false;
  requestAnimationFrame(place);
}

export function registerTour(): void {
  tourBtn.addEventListener("click", start);
  tourNext.addEventListener("click", () => {
    if (index === steps.length - 1) {
      finish();
      return;
    }
    index += 1;
    place();
  });
  tourBack.addEventListener("click", () => {
    if (index === 0) return;
    index -= 1;
    place();
  });
  tourSkip.addEventListener("click", finish);
  window.addEventListener("resize", () => {
    if (!tourOverlay.hidden) place();
  });

  const prefs = loadPrefs();
  if (prefs.tourAuto && !prefs.tourSeen) {
    // espera o layout inicial (fontes, botões) assentar antes de medir posições
    setTimeout(start, 250);
  }
}
