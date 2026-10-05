import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

/** "730 anúncios encontrados (Filtrou: -120)". Verde com resultados, cinza sem. */
export function ResultsSummary({ found, total, filtered }: { found: number; total: number; filtered: boolean }) {
  const removed = total - found;
  return (
    <p
      aria-live="polite"
      className={cn("flex flex-wrap items-center gap-x-2 text-sm font-semibold", found > 0 ? "text-ok" : "text-muted")}
    >
      <BarChart3 aria-hidden className="h-4 w-4" />
      <span className="tnum">
        {formatNumber(found)} {found === 1 ? "anúncio encontrado" : "anúncios encontrados"}
      </span>
      {filtered && removed > 0 && (
        <span className="tnum text-xs font-normal text-muted">(Filtrou: -{formatNumber(removed)} anúncios)</span>
      )}
    </p>
  );
}
