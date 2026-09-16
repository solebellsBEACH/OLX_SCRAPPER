export const OLX_URL_RE = /^https:\/\/([a-z0-9-]+\.)*olx\.com\.br\//i;
/** A extensão só age em páginas da categoria de carros do OLX. */
export const OLX_CARROS_RE = /olx\.com\.br\/[^?#]*carros-vans-e-utilitarios/i;
export const PROXY_BASE = "http://localhost:8787";
export const PROXY_URL = `${PROXY_BASE}/analyze`;
export const DB_URL = `${PROXY_BASE}/db`;
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
