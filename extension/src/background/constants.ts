export const OLX_URL_RE = /^https:\/\/([a-z0-9-]+\.)*olx\.com\.br\//i;
/** A extensão só age em páginas da categoria de carros do OLX. */
export const OLX_CARROS_RE = /olx\.com\.br\/[^?#]*carros-vans-e-utilitarios/i;
/** Busca nacional (sem categoria na URL), ex.: olx.com.br/brasil?q=... */
export const OLX_BRASIL_RE = /^\/brasil\/?$/i;
/** Marcas e termos que indicam que o `q=` de uma busca nacional é sobre carros. */
export const CAR_SEARCH_KEYWORDS = new Set([
  "carro", "carros", "automovel", "veiculo", "sedan", "hatch", "suv",
  "picape", "pickup", "caminhonete", "conversivel", "wagon", "perua",
  "fiat", "volkswagen", "vw", "chevrolet", "gm", "ford", "hyundai",
  "toyota", "honda", "renault", "nissan", "jeep", "peugeot", "citroen",
  "mitsubishi", "kia", "bmw", "mercedes", "mercedes-benz", "audi",
  "volvo", "land rover", "ram", "dodge", "chrysler", "subaru", "suzuki",
  "byd", "caoa chery", "chery", "jac", "jaguar", "mini", "porsche",
  "ferrari", "lamborghini", "maserati", "lifan", "effa", "troller",
  "iveco", "agrale", "gwm", "great wall",
]);
/** Remove acentos e baixa a caixa para comparar termos de busca. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
/** A busca (`q=`) contém marca/termo de carro conhecido? */
export function isCarSearchQuery(q: string): boolean {
  const normalized = normalize(q);
  return [...CAR_SEARCH_KEYWORDS].some((kw) => normalized.includes(normalize(kw)));
}
export const PANEL_PATH = "popup.html?tab=1";

/** Teto rígido de páginas por varredura, independente do que o usuário pedir. */
export const CRAWL_MAX_PAGES = 10;

/** `tipo` (vindo da IA) que representa algo que NÃO é carro. */
export const NAO_CARRO = new Set([
  "moto", "motocicleta", "motoneta", "scooter", "ciclomotor",
  "caminhao", "caminhão", "onibus", "ônibus", "microonibus", "micro-ônibus",
  "van", "kombi", "furgao", "furgão", "reboque", "trailer", "carreta",
  "trator", "maquina", "máquina", "quadriciclo", "triciclo", "utv",
  "jetski", "jet ski", "lancha", "barco", "nautica", "náutica", "aeronave",
  "outro", "outros", "nao informado", "não informado",
]);
