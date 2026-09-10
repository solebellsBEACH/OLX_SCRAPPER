import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

// Header clicável no padrão openstatus: clique alterna asc -> desc -> sem ordenação.
export function ColumnHeader<TData, TValue>({
  column,
  title,
  align = "left",
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  align?: "left" | "right";
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <span className={cn(align === "right" && "block text-right", className)}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "inline-flex items-center gap-1 font-semibold text-muted transition-colors duration-DEFAULT hover:text-fg",
        align === "right" && "w-full flex-row-reverse",
        className,
      )}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 text-subtle" />
      )}
    </button>
  );
}
