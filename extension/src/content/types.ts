declare global {
  interface Window {
    __olxWorkspaceInjected?: boolean;
    __olxWorkspaceStyled?: boolean;
  }
}

export type ContentAction =
  | "extractSections"
  | "extractAdPage"
  | "autoScroll"
  | "stopScroll"
  | "extractPagination"
  | "markCards"
  | "hideIndicators"
  | "showLoading"
  | "hideLoading";

export interface ContentMessage {
  action: ContentAction;
  /** só para "autoScroll": duração da rolagem em ms (padrão 3000). */
  duration?: number;
  /** só para "markCards": estado + score de cada anúncio visível na página. */
  marks?: MarkItem[];
  /** só para "showLoading": texto exibido no indicador fixo da página. */
  text?: string;
}

/** Item da lista mandado pelo background após "Analisar página": borda + score. */
export interface MarkItem {
  id: string;
  /**
   * "done" = já analisado a fundo pela IA (borda verde + score); "quick" =
   * score heurístico da "Análise rápida" (borda azul tracejada, sem IA);
   * "pending" = salvo, aguardando análise (borda cinza pontilhada).
   */
  status: "done" | "pending" | "quick";
  score?: number | null;
}

export interface AdDetail {
  label: string;
  value: string;
}

export interface AdCard {
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

export interface AdPageData {
  url: string;
  id: string | null;
  title: string | null;
  price: string | null;
  description: string | null;
  location: string | null;
  publishedAt: string | null;
  properties: AdDetail[];
  images: string[];
  htmlLength: number;
  ldjson: unknown[];
}

export interface ExtractResult {
  ok: true;
  count: number;
  cards: AdCard[];
}

export interface PaginationResult {
  ok: true;
  /** maior número de página oferecido pela paginação do OLX (null se não achar). */
  lastPage: number | null;
}

export interface AdPageResult {
  ok: true;
  data: AdPageData;
}

export interface OkResult {
  ok: true;
}

export {};
