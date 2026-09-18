export type Categoria = Record<string, unknown> & { index?: number; tipo?: string | null };
export type Card = Record<string, unknown> & { index?: number; id?: string | null; url?: string | null };
export type Item = Card & {
  categoria: Categoria | null;
  /** id existe no db.json (raso ou completo). */
  inDb: boolean;
  /** id no db.json COM os dados da página (passou pelo "Analisar selecionados"). */
  deepAnalyzed: boolean;
};

export interface AnalyzeResult {
  count: number;
  items: Item[];
  categorias: unknown[] | null;
  raw: string | null;
  aiError?: string;
  /** anúncios descartados por NÃO serem carro (moto, caminhão, náutica, ...). */
  nonCar?: number;
  /** anúncios novos gravados (rasos) no db.json, pra não perder ao fechar a extensão. */
  savedToDb?: number;
  /** só na "Análise rápida": quantos deram km suspeita (heurística local, sem IA). */
  suspicious?: number;
}

export type DbRecord = Record<string, unknown> & { id: string; analyzedAt: number };

export interface Target {
  id: string;
  url: string;
}

export interface CrawlOptions {
  /** máximo de páginas a visitar a partir da atual. */
  maxPages: number;
  /** rolar cada página antes de extrair (OLX carrega cards no scroll). */
  scrollEach: boolean;
  /** não recategoriza (nem lista de novo) anúncios que já estão no db.json. */
  skipKnown: boolean;
  /** grava os anúncios novos (raso, sem visitar a página) no db.json. */
  saveToDb: boolean;
}

export interface CrawlResult extends AnalyzeResult {
  pages: number;
  /** anúncios novos, de fato varridos e mandados pra IA. */
  newCount: number;
  /** anúncios ignorados por já estarem no db.json. */
  skipped: number;
  /** anúncios ignorados por aparecerem em mais de uma página. */
  duplicates: number;
  /** anúncios gravados no db.json nesta varredura. */
  savedToDb: number;
  /** motivo de não ter gravado (quando `saveToDb` estava ligado e nada foi salvo). */
  saveError?: string;
  /** total de páginas que a paginação do OLX oferece (null se não deu pra ler). */
  lastPage?: number | null;
  perPage: Array<{ page: number; novos: number; noDb: number; repetidos: number; total: number }>;
}

export interface SelectedResult {
  analyzed: DbRecord[];
  errors: Array<{ id: string; error: string }>;
  /** ids ignorados por já terem os dados da página no db.json. */
  skipped: string[];
  /** ids ignorados por não serem carro (moto, caminhão, náutica, ...). */
  nonCar: string[];
}

export interface ShowIndicatorsResult {
  count: number;
  done: number;
  pending: number;
}

export interface InMessage {
  action:
    | "analyze"
    | "quickAnalyze"
    | "autoScroll"
    | "analyzeSelected"
    | "crawlListing"
    | "getDb"
    | "clearDb"
    | "importDb"
    | "removeRecord"
    | "getAiConfig"
    | "setAiProvider"
    | "updateAiProviderConfig"
    | "aiAnalyze"
    | "aiCompare"
    | "aiMetrics"
    | "checkKnown"
    | "showIndicators"
    | "hideIndicators"
    | "loadPending";
  targets?: Target[];
  force?: boolean;
  maxPages?: number;
  scrollEach?: boolean;
  skipKnown?: boolean;
  saveToDb?: boolean;
  /** só para "checkKnown": ids dos cards visíveis na página. */
  ids?: string[];
  /** só para "importDb": mapa { [id]: DbRecord } vindo de um db.json exportado. */
  db?: Record<string, DbRecord>;
  /** só para "removeRecord". */
  id?: string;
  /** só para "setAiProvider". */
  provider?: "deepseek" | "openai";
  /** só para "updateAiProviderConfig". */
  patch?: { apiUrl?: string; model?: string; timeoutMs?: number; apiKey?: string };
  /** só para "aiAnalyze": seções cruas a categorizar. */
  sections?: unknown[];
  /** só para "aiCompare"/"aiMetrics": resumo dos carros. */
  cars?: unknown[];
}
