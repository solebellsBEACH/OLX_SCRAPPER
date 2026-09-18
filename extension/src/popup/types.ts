export interface Categoria {
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  ano?: number | null;
  motor?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  portas?: number | null;
  carroceria?: string | null;
  /** 0-100: condição estimada do carro pela IA (só em itens já analisados a fundo). */
  score?: number | null;
  scoreMotivo?: string | null;
  /** true = km muito baixa pra idade do carro (possível odômetro adulterado). */
  kmSuspeito?: boolean | null;
  kmSuspeitoMotivo?: string | null;
  /** true = score veio da "Análise rápida" (heurística local, sem IA), não da IA. */
  quick?: boolean;
}

export interface Item {
  id?: string | null;
  title?: string | null;
  url?: string | null;
  image?: string | null;
  price?: string | null;
  oldPrice?: string | null;
  km?: number | null;
  kmText?: string | null;
  color?: string | null;
  location?: string | null;
  date?: string | null;
  categoria?: Categoria | null;
  inDb?: boolean;
  deepAnalyzed?: boolean;
}

export interface AnalyzeResult {
  count: number;
  items: Item[];
  categorias?: unknown[] | null;
  raw?: string | null;
  aiError?: string;
  /** anúncios descartados por não serem carro (moto, caminhão, náutica, ...). */
  nonCar?: number;
  /** só no "Varrer páginas": quantas páginas foram lidas. */
  pages?: number;
  /** total de páginas que a paginação do OLX oferece (limite da varredura). */
  lastPage?: number | null;
  newCount?: number;
  skipped?: number;
  duplicates?: number;
  savedToDb?: number;
  saveError?: string;
  /** só na "Análise rápida": quantos deram km suspeita (heurística local, sem IA). */
  suspicious?: number;
  perPage?: Array<{
    page: number;
    novos: number;
    noDb: number;
    repetidos: number;
    total: number;
  }>;
}

export interface DispatchResponse {
  ok: boolean;
  result?: AnalyzeResult;
  db?: Record<string, unknown>;
  error?: string;
  /** true = o usuário cancelou a operação (não é falha). */
  cancelled?: boolean;
}

export interface ProgressMessage {
  type: "progress" | "scrollProgress";
  text: string;
  id?: string;
  state?: "running" | "done" | "error";
}
