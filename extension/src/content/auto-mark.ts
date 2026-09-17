import { isIndicatorsHidden, markCards } from "./card-marking";
import type { MarkItem } from "./types";

/**
 * Varredura BARATA: só lê o id de cada `section.olx-adcard` (via o link, sem
 * parsear título/preço/km/cor/local/data/fotos como `extractSections()` faz)
 * e devolve os que ainda não têm `data-olxw-status`. É a que roda a cada
 * mutação do DOM — precisa ser leve, `extractSections()` completo aqui era o
 * motivo da aba travar em listagens grandes (centenas de cards após "Varrer
 * páginas"/scroll longo, revarridos por inteiro a cada ~1s pra sempre).
 */
function collectPendingIds(): string[] {
  const pending: string[] = [];
  document.querySelectorAll<HTMLElement>("section.olx-adcard").forEach((section) => {
    let id = section.getAttribute("data-olxw-id");
    if (!id) {
      const link = section.querySelector<HTMLAnchorElement>(
        "a.olx-adcard__link, a[data-testid='adcard-link']",
      );
      id = link?.href ? (link.href.split("-").pop()?.split(/[?#]/)[0] ?? null) : null;
      if (id) section.setAttribute("data-olxw-id", id);
    }
    if (id && !section.hasAttribute("data-olxw-status")) pending.push(id);
  });
  return pending;
}

/**
 * Consulta o background (leitura rasa do db.json, sem IA) pra saber o
 * status dos cards ainda sem marcação e pinta borda verde/amarela + score.
 * Roda ao carregar a página e de novo (throttled) sempre que a listagem
 * ganha cards novos (scroll infinito, troca de filtro, etc.).
 */
function autoMarkVisibleCards(): void {
  if (isIndicatorsHidden()) return;
  const pendingIds = collectPendingIds();
  if (pendingIds.length === 0) return;
  chrome.runtime
    .sendMessage({ action: "checkKnown", ids: pendingIds })
    .then((resp: { ok?: boolean; marks?: MarkItem[] } | undefined) => {
      if (resp?.ok && Array.isArray(resp.marks)) markCards(resp.marks);
    })
    .catch(() => {
      /* service worker indisponível — tenta de novo na próxima mutação do DOM */
    });
}

// Throttle (não debounce puro): garante que roda pelo menos 1x a cada 1.5s
// mesmo com mutações contínuas na página (ads, animações), em vez de esperar
// a página parar de vez pra sempre — o que em algumas páginas nunca acontece.
const AUTO_MARK_INTERVAL_MS = 1500;
let autoMarkTimer: ReturnType<typeof setTimeout> | undefined;
let lastAutoMark = 0;
function scheduleAutoMark(): void {
  if (autoMarkTimer) return; // já tem uma rodada agendada
  const wait = Math.max(0, AUTO_MARK_INTERVAL_MS - (Date.now() - lastAutoMark));
  autoMarkTimer = setTimeout(() => {
    autoMarkTimer = undefined;
    lastAutoMark = Date.now();
    autoMarkVisibleCards();
  }, wait);
}

/**
 * true se TODAS as mutações do lote foram causadas por nós mesmos (o badge
 * de score sendo inserido/atualizado por `markCards()`), pra não reagendar
 * uma varredura por causa da nossa própria marcação — sem isso, marcar um
 * card dispara o observer, que agenda nova varredura, que (mesmo achando 0
 * pendentes) já é chamada pra sempre em loop a cada mutação nossa.
 */
function isOwnMutation(mutations: MutationRecord[]): boolean {
  return mutations.every((m) =>
    [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)].every(
      (n) => n instanceof HTMLElement && n.classList.contains("olxw-score-badge"),
    ),
  );
}

/** Liga o auto-mark: varredura inicial + observer de mutações do DOM. */
export function startAutoMark(): void {
  scheduleAutoMark();
  new MutationObserver((mutations) => {
    if (isOwnMutation(mutations)) return;
    scheduleAutoMark();
  }).observe(document.body, { childList: true, subtree: true });
}
