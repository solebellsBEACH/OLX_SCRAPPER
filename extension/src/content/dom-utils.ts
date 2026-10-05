export function textOf(el: Element | null | undefined): string | null {
  const value = el?.textContent?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}
