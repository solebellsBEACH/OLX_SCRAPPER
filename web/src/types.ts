// Tipos do registro do db.json (a fonte é o proxy: GET /db devolve { [id]: DbRecord }).
// Reaproveitados em todo o painel — não duplicar shape em outro lugar.

export interface AdProperty {
  label: string;
  value: string;
}

export interface AdDetail {
  url: string;
  id: string;
  title: string;
  /** Cru, como veio do OLX: "R$ 33.000". Use parsePrice() para número. */
  price: string | null;
  /** Preço anterior, quando o anúncio registrou queda. Cru. */
  priceOld?: string | null;
  oldPrice?: string | null;
  /** Quilometragem numérica quando o coletor conseguiu extrair. */
  km?: number | null;
  description: string | null;
  location: string | null;
  publishedAt: string | null;
  properties: AdProperty[];
  images: string[];
  htmlLength?: number;
  ldjson?: unknown;
}

/** Saída da IA (DeepSeek) para um anúncio. */
export interface AdCategoria {
  index?: number;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  ano: number | null;
  motor: string | null;
  combustivel: string | null;
  cambio: string | null;
  portas: number | null;
  carroceria: string | null;
}

export interface DbRecord {
  id: string;
  url: string;
  detail: AdDetail;
  categoria: AdCategoria | null;
  htmlLength?: number;
  /** epoch ms. */
  analyzedAt?: number;
  /** ISO. */
  savedAt?: string;
}

/** Mapa como está no arquivo. */
export type Db = Record<string, DbRecord>;

export interface HealthResponse {
  ok: boolean;
  hasKey: boolean;
  model: string;
  port: number;
  dbPath: string;
}

/** Linha achatada usada pela tabela e pelos agregados do dashboard. */
export interface AdRow {
  id: string;
  url: string;
  record: DbRecord;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  modeloVersao: string;
  ano: number | null;
  km: number | null;
  price: number | null;
  priceOld: number | null;
  pricePerKm: number | null;
  location: string | null;
  /** epoch ms para ordenar; vem de savedAt/analyzedAt/publishedAt. */
  date: number | null;
  thumb: string | null;
  /** preço abaixo da média do mesmo modelo+ano (grupo com 2+ anúncios). */
  opportunity: boolean;
}
