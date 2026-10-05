export function badge(kind: "db" | "run" | "err", text: string): HTMLSpanElement {
  const b = document.createElement("span");
  b.className = `badge ${kind}`;
  b.textContent = text;
  return b;
}

/** Badge do score de condição (0-100): mesmo esquema de cor usado nos cards do OLX. */
export function scoreBadge(score: number): HTMLSpanElement {
  const b = document.createElement("span");
  b.className = "badge score";
  if (score < 50) b.dataset.tier = "low";
  else if (score < 80) b.dataset.tier = "mid";
  b.textContent = `Condição ${Math.round(score)}/100`;
  return b;
}
