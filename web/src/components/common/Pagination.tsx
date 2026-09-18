import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/select";

interface Props {
  page: number; // 0-based
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  className?: string;
}

/** 1 … 4 5 [6] 7 8 … 18 */
function pageWindow(page: number, count: number): (number | "…")[] {
  const keep = new Set([0, count - 1, page - 1, page, page + 1]);
  const nums = [...keep].filter((n) => n >= 0 && n < count).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

const btn =
  "inline-flex h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-sm border border-border bg-surface px-3 text-sm transition-colors duration-DEFAULT hover:bg-bg disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export function Pagination({ page, pageCount, pageSize, total, onPage, onPageSize, className }: Props) {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);
  const go = (p: number) => {
    onPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav aria-label="Paginação" className={cn("flex flex-col items-center gap-2", className)}>
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <button type="button" className={btn} disabled={page === 0} onClick={() => go(page - 1)}>
            <ChevronLeft className="h-3 w-3" />
            <span className="hidden sm:inline">Anterior</span>
            <span className="sr-only sm:hidden">Anterior</span>
          </button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap${i}`} className="px-1 text-subtle">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? "page" : undefined}
                aria-label={`Página ${p + 1}`}
                className={cn(btn, "tnum", p === page && "border-accent bg-accent-weak font-semibold text-accent")}
                onClick={() => go(p)}
              >
                {p + 1}
              </button>
            ),
          )}
          <button type="button" className={btn} disabled={page >= pageCount - 1} onClick={() => go(page + 1)}>
            <span className="hidden sm:inline">Próximo</span>
            <span className="sr-only sm:hidden">Próximo</span>
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
        <span className="tnum" aria-live="polite">
          Mostrando {first}–{last} de {total} resultados
        </span>
        {onPageSize && (
          <label className="flex items-center gap-2">
            Por página
            <Select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>
    </nav>
  );
}
