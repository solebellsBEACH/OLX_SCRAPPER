/**
 * Lê o widget de paginação do OLX e devolve o MAIOR número de página oferecido.
 * O nome da classe tem um hash gerado no build (`Pagination-...__wrapper`), então
 * casamos por prefixo. Fallback: qualquer <a> cujo href tenha `?o=N` na mesma
 * listagem. O link "Última página" costuma trazer o total real (ex.: `?o=23`).
 */
export function extractPagination(): number | null {
  const wrapper =
    document.querySelector('[class*="Pagination"][class*="wrapper"]') ??
    document.querySelector('[class*="pagination" i]');
  const links = Array.from(
    (wrapper ?? document).querySelectorAll<HTMLAnchorElement>("a[href*='o=']"),
  );
  let last = 0;
  for (const a of links) {
    let o = 0;
    try {
      o = Number(new URL(a.href).searchParams.get("o") ?? "0");
    } catch {
      o = 0;
    }
    if (Number.isFinite(o) && o > last) last = o;
  }
  return last > 0 ? last : null;
}
