import { state } from "../state";
import type { Item } from "../types";
import { badge, scoreBadge } from "./badges";
import { catLine, metaLine } from "./format";
import { syncSelectionUi } from "./list";

export function renderItem(it: Item): HTMLDivElement {
  const id = it.id ?? "";
  const row = document.createElement("div");
  row.className = "item";
  row.dataset.id = id;
  if (id && state.selected.has(id)) row.classList.add("sel");
  row.classList.add(it.deepAnalyzed ? "done" : "pending");

  const pick = document.createElement("div");
  pick.className = "pick";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = id ? state.selected.has(id) : false;
  cb.disabled = !id;
  cb.addEventListener("change", () => {
    if (!id) return;
    if (cb.checked) state.selected.add(id);
    else state.selected.delete(id);
    row.classList.toggle("sel", cb.checked);
    syncSelectionUi();
  });
  pick.appendChild(cb);
  row.appendChild(pick);

  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = "";
  img.loading = "lazy";
  if (it.image) img.src = it.image;
  row.appendChild(img);

  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = it.title ?? "(sem título)";
  body.appendChild(title);

  const cat = document.createElement("div");
  cat.className = "cat";
  cat.textContent = catLine(it.categoria);
  body.appendChild(cat);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = metaLine(it);
  body.appendChild(meta);

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = it.price ?? "Preço não informado";
  if (it.oldPrice) {
    const old = document.createElement("span");
    old.className = "old";
    old.textContent = it.oldPrice;
    price.appendChild(old);
  }
  body.appendChild(price);

  const rowStateValue = id ? state.rowState.get(id) : undefined;
  const score = it.categoria?.score;
  if (rowStateValue === "running") body.appendChild(badge("run", "⏳ analisando…"));
  else if (rowStateValue === "error") body.appendChild(badge("err", "✖ falhou"));
  else if (rowStateValue === "done" || it.deepAnalyzed) {
    body.appendChild(badge("db", "✔ analisado"));
    if (typeof score === "number") body.appendChild(scoreBadge(score));
  } else if (it.inDb) body.appendChild(badge("db", "🗃️ no DB (raso)"));

  if (it.categoria?.kmSuspeito) {
    const alert = badge("err", "⚠️ km suspeita");
    alert.title = it.categoria.kmSuspeitoMotivo ?? "Km muito baixa pra idade do carro — possível odômetro adulterado.";
    body.appendChild(alert);
  }

  if (it.url) {
    const link = document.createElement("a");
    link.href = it.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Ver no OLX ↗";
    body.appendChild(document.createElement("br"));
    body.appendChild(link);
  }

  row.appendChild(body);
  return row;
}
