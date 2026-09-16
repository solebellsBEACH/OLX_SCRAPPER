import { statusEl } from "./dom";

export function setStatus(text: string): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("has-error", /^[❌⚠]/u.test(text));
}
