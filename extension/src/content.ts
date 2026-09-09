/**
 * Content script do OLX Workspace.
 *
 * Injetado sob demanda pelo background via `chrome.scripting.executeScript`
 * ({ files: ["content.js"] }). Como a injeção pode se repetir na mesma aba,
 * o registro de listeners é protegido por um guard em `window`.
 *
 * Ações:
 *   - "extractSections": lê as <section class="olx-adcard">, loga SÓ os dados
 *     estruturados no console da página e devolve o array.
 *   - "logAnalysis": imprime no console da página o texto vindo do DeepSeek.
 *   - "autoScroll": rola a página suavemente até o fim em ~3s.
 */

declare global {
  interface Window {
    __olxWorkspaceInjected?: boolean;
  }
}

type ContentAction = "extractSections" | "logAnalysis" | "autoScroll";

interface ContentMessage {
  action: ContentAction;
  categorias?: unknown[] | null;
  raw?: string | null;
}

interface AdDetail {
  label: string;
  value: string;
}

interface AdCard {
  index: number;
  id: string | null;
  title: string | null;
  url: string | null;
  price: string | null;
  oldPrice: string | null;
  km: number | null;
  kmText: string | null;
  color: string | null;
  location: string | null;
  date: string | null;
  image: string | null;
  photos: number;
  details: AdDetail[];
}

interface ExtractResult {
  ok: true;
  count: number;
  cards: AdCard[];
}

interface OkResult {
  ok: true;
}

function textOf(el: Element | null | undefined): string | null {
  const value = el?.textContent?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}

function parseSection(section: Element, index: number): AdCard {
  const link = section.querySelector<HTMLAnchorElement>(
    "a.olx-adcard__link, a[data-testid='adcard-link']",
  );
  const url = link?.href ?? null;
  const id = url ? (url.split("-").pop()?.split(/[?#]/)[0] ?? null) : null;

  const details: AdDetail[] = Array.from(section.querySelectorAll(".olx-adcard__detail")).map(
    (node) => ({
      label: node.getAttribute("aria-label")?.replace(/\s+/g, " ").trim() ?? "",
      value: textOf(node) ?? "",
    }),
  );

  // Quilometragem: aria-label "103000 quilômetros rodados" / texto "103.000 km".
  const kmDetail = details.find((d) => /quil[oô]metro|(^|\s)km(\s|$)/i.test(`${d.label} ${d.value}`));
  const kmDigits = kmDetail?.value.replace(/\D+/g, "") ?? "";
  const km = kmDigits ? Number(kmDigits) : null;

  // Cor: aria-label começa com "Cor " (ex.: "Cor Prata") e o texto é a cor.
  const colorDetail = details.find((d) => /^cor\b/i.test(d.label));
  const color = colorDetail
    ? colorDetail.value || colorDetail.label.replace(/^cor\s+/i, "").trim()
    : null;

  return {
    index,
    id,
    title: textOf(section.querySelector(".olx-adcard__title")) ?? link?.title?.trim() ?? null,
    url,
    price: textOf(section.querySelector(".olx-adcard__price")),
    oldPrice: textOf(section.querySelector(".olx-adcard__old-price")),
    km,
    kmText: kmDetail?.value ?? null,
    color,
    location: textOf(section.querySelector(".olx-adcard__location")),
    date: textOf(section.querySelector(".olx-adcard__date")),
    image: section.querySelector<HTMLImageElement>("picture img")?.src ?? null,
    photos: section.querySelectorAll(".olx-adcard__carousel--bullet").length,
    details,
  };
}

function extractSections(): AdCard[] {
  const sections = Array.from(document.querySelectorAll("section.olx-adcard"));
  const cards = sections.map(parseSection);

  console.log("=== DADOS DAS SECTIONS ===");
  console.log(`Total de anúncios: ${cards.length}`);
  console.table(
    cards.map((c) => ({
      título: c.title,
      preço: c.price,
      "preço antigo": c.oldPrice,
      km: c.km,
      cor: c.color,
      local: c.location,
      data: c.date,
    })),
  );
  console.log(cards);
  console.log("=== FIM DOS DADOS DAS SECTIONS ===");

  return cards;
}

function scrollAutomatic(duration: number): Promise<number> {
  return new Promise<number>((resolve) => {
    const startY = window.scrollY;
    const maxY = (): number =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const start = performance.now();
    let lastBucket = -1;

    const step = (now: number): void => {
      const t = Math.min((now - start) / duration, 1);
      const target = maxY();
      window.scrollTo({ top: startY + (target - startY) * t, behavior: "auto" });

      const pct = Math.round(t * 100);
      const bucket = Math.floor(pct / 10);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        console.log(`Scroll: ${pct}% concluído`);
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        console.log("✅ Scroll concluído");
        resolve(Math.round(window.scrollY));
      }
    };

    requestAnimationFrame(step);
  });
}

if (!window.__olxWorkspaceInjected) {
  window.__olxWorkspaceInjected = true;

  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: ExtractResult | OkResult) => void,
    ): boolean => {
      if (message.action === "extractSections") {
        const cards = extractSections();
        sendResponse({ ok: true, count: cards.length, cards });
        return false;
      }

      if (message.action === "logAnalysis") {
        console.log("=== CATEGORIZAÇÃO IA (marca / modelo / ano / motor ...) ===");
        if (Array.isArray(message.categorias)) {
          console.table(message.categorias);
          console.log(message.categorias);
        } else {
          console.warn("IA não retornou JSON válido. Resposta bruta:");
          console.log(message.raw ?? "(vazio)");
        }
        console.log("=== FIM DA CATEGORIZAÇÃO IA ===");
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "autoScroll") {
        void scrollAutomatic(3000).then(() => sendResponse({ ok: true }));
        return true; // resposta assíncrona
      }

      return false;
    },
  );
}

export {};
