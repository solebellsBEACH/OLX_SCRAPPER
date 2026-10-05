import { textOf } from "./dom-utils";
import type { AdCard, AdDetail } from "./types";

function parseSection(section: Element, index: number): AdCard {
  const link = section.querySelector<HTMLAnchorElement>(
    "a.olx-adcard__link, a[data-testid='adcard-link']",
  );
  const url = link?.href ?? null;
  const id = url ? (url.split("-").pop()?.split(/[?#]/)[0] ?? null) : null;
  // Marca a section com o id pra "markCards" achar o card na hora de pintar a borda.
  if (id) section.setAttribute("data-olxw-id", id);

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

export function extractSections(): AdCard[] {
  const sections = Array.from(document.querySelectorAll("section.olx-adcard"));
  return sections.map(parseSection);
}
