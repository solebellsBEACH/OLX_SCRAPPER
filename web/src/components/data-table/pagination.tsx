import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

export function Pagination<TData>({
  table,
  selectedCount,
}: {
  table: Table<TData>;
  selectedCount: number;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm text-muted">
      <div className="tnum">
        {selectedCount > 0 ? `${selectedCount} de ${total} selecionado(s)` : `${first}–${last} de ${total}`}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          Por página
          <Select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
        <span className="tnum">
          Página {pageIndex + 1} de {Math.max(1, table.getPageCount())}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            aria-label="Primeira página"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            aria-label="Página anterior"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            aria-label="Próxima página"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            aria-label="Última página"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
