import { flexRender, type Table as TanTable } from "@tanstack/react-table";
import { cn } from "@/lib/cn";
import { Pagination } from "./pagination";

interface Props<TData> {
  table: TanTable<TData>;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string | undefined;
  emptyLabel?: string;
}

// Casca de tabela no padrão openstatus: separação por borda de 1px, sem sombra,
// header clicável nas colunas, paginação no rodapé.
export function DataTable<TData>({
  table,
  onRowClick,
  rowClassName,
  emptyLabel = "Nada corresponde aos filtros.",
}: Props<TData>) {
  const rows = table.getRowModel().rows;
  const cols = table.getAllLeafColumns().length;
  const selectedCount = table.getSelectedRowModel().rows.length;

  return (
    <div className="border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() ? header.getSize() : undefined }}
                    className="h-8 px-3 text-left align-middle font-semibold text-muted"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols} className="px-3 py-12 text-center text-muted">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors duration-DEFAULT",
                    onRowClick && "cursor-pointer hover:bg-bg",
                    row.getIsSelected() && "bg-accent-weak hover:bg-accent-weak",
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="h-9 px-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination table={table} selectedCount={selectedCount} />
    </div>
  );
}
