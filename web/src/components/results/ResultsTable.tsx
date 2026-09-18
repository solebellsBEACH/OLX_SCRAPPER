import { flexRender, type Table } from "@tanstack/react-table";
import type { AdRow } from "@/types";
import { ResultRow } from "./ResultRow";

interface Props {
  table: Table<AdRow>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

/** Desktop (≥1024px): 5 colunas principais + seleção e expandir. Cabeçalhos vêm das columnDefs. */
export function ResultsTable({ table, expanded, onToggle }: Props) {
  const rows = table.getRowModel().rows;
  return (
    <div className="hidden border border-border bg-surface lg:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => (
                <th key={h.id} className="h-8 px-3 text-left align-middle font-semibold text-muted">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((r) => (
            <ResultRow
              key={r.id}
              row={r.original}
              selected={r.getIsSelected()}
              expanded={expanded.has(r.id)}
              onSelect={(v) => r.toggleSelected(v)}
              onToggle={() => onToggle(r.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
