import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { GitCompareArrows } from "lucide-react";
import type { AdRow } from "@/types";
import { useDb } from "@/lib/useDb";
import { applyFilters, useFilters } from "@/lib/useFilters";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/Layout";
import { ColumnHeader } from "@/components/data-table/column-header";
import { FilterBar } from "@/components/filters/FilterBar";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { ResultsSummary } from "@/components/filters/ResultsSummary";
import { Pagination } from "@/components/common/Pagination";
import { useBreadcrumbSuffix } from "@/components/common/Breadcrumb";
import { ResultsTable } from "@/components/results/ResultsTable";
import { ResultCard } from "@/components/results/ResultCard";
import { ResultSkeleton } from "@/components/results/ResultSkeleton";
import { vehicleName } from "@/components/results/ResultRow";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { HELP, HelpTip } from "@/components/ui/tooltip";
import { Empty, ErrorBox } from "@/components/States";

export function Listing() {
  const navigate = useNavigate();
  const { rows, status, error, refetch } = useDb();
  const { filters, setFilter, reset, active } = useFilters();
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const marcas = useMemo(
    () => [...new Set(rows.map((r) => r.marca).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const anos = useMemo(
    () => [...new Set(rows.map((r) => r.ano).filter(Boolean) as number[])].sort((a, b) => b - a),
    [rows],
  );
  const suggestions = useMemo(
    () =>
      [...new Set(rows.flatMap((r) => [vehicleName(r), r.location]).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const data = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  useBreadcrumbSuffix(active > 0 ? `Filtrado (${formatNumber(data.length)} resultados)` : null);

  const columns = useMemo<ColumnDef<AdRow>[]>(
    () => [
      { id: "select", enableSorting: false, header: () => null },
      {
        id: "veiculo",
        accessorFn: vehicleName,
        header: ({ column }) => <ColumnHeader column={column} title="Veículo" />,
      },
      {
        accessorKey: "ano",
        header: ({ column }) => <ColumnHeader column={column} title="Ano" align="right" />,
        sortUndefined: "last",
      },
      {
        accessorKey: "km",
        header: ({ column }) => <ColumnHeader column={column} title="Km" align="right" />,
        sortUndefined: "last",
      },
      {
        accessorKey: "price",
        header: ({ column }) => <ColumnHeader column={column} title="Preço" align="right" />,
        sortUndefined: "last",
      },
      {
        // ordena por oportunidade (score); o badge é só apresentação do priceStatus
        id: "oportunidade",
        accessorFn: (r) => r.analysis.opportunityScore ?? -1,
        header: ({ column }) => (
          <span className="inline-flex items-center gap-1">
            <ColumnHeader column={column} title="Status" />
            <HelpTip text={HELP.status} />
          </span>
        ),
      },
      // "date" existe só como chave de ordenação padrão (sem coluna visível)
      { id: "date", accessorKey: "date", header: () => null, sortUndefined: "last" },
      { id: "expand", enableSorting: false, header: () => null },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection: selection, columnVisibility: { date: false } },
    getRowId: (r) => r.id,
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const canCompare = selectedIds.length >= 2 && selectedIds.length <= 4;
  const { pageIndex, pageSize } = table.getState().pagination;
  const pager = (className?: string) => (
    <Pagination
      className={className}
      page={pageIndex}
      pageCount={table.getPageCount()}
      pageSize={pageSize}
      total={data.length}
      onPage={table.setPageIndex}
      onPageSize={table.setPageSize}
    />
  );

  if (status === "loading")
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title="Listagem" />
        <ResultSkeleton />
      </div>
    );
  if (status === "error") return <ErrorBox message={error ?? "Erro"} onRetry={refetch} />;

  const pageRows = table.getRowModel().rows;
  // muda a cada filtro/página/ordem: reinicia a animação de fade da lista
  const listKey = `${JSON.stringify(filters)}|${pageIndex}|${pageSize}|${JSON.stringify(sorting)}`;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Listagem" />

      {status === "empty" ? (
        <Empty />
      ) : (
        <>
          <FilterBar
            filters={filters}
            setFilter={setFilter}
            active={active}
            marcas={marcas}
            anos={anos}
            suggestions={suggestions}
            right={
              <Button
                size="md"
                variant={canCompare ? "default" : "outline"}
                disabled={!canCompare}
                className="h-[44px] w-full sm:h-8 sm:w-auto"
                onClick={() => navigate(`/comparador?ids=${selectedIds.join(",")}`)}
                title={canCompare ? "" : "Selecione de 2 a 4 anúncios"}
              >
                <GitCompareArrows className="h-3 w-3" />
                Comparar ({selectedIds.length})
              </Button>
            }
          />

          <ActiveFilters filters={filters} setFilter={setFilter} reset={reset} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ResultsSummary found={data.length} total={rows.length} filtered={active > 0} />
            <label className="flex items-center gap-2 text-xs text-muted lg:hidden">
              Ordenar
              <Select
                value={sorting[0] ? `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}` : "date:desc"}
                onChange={(e) => {
                  const [id, dir] = e.target.value.split(":");
                  setSorting([{ id, desc: dir === "desc" }]);
                }}
              >
                <option value="date:desc">Mais recentes</option>
                <option value="price:asc">Menor preço</option>
                <option value="price:desc">Maior preço</option>
                <option value="ano:desc">Mais novos</option>
                <option value="km:asc">Menor km</option>
                <option value="oportunidade:desc">Melhor oportunidade</option>
              </Select>
            </label>
          </div>

          {data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border border-border bg-surface p-12 text-center">
              <p className="text-sm font-semibold">Nenhum anúncio encontrado. Tente outros filtros.</p>
              <Button onClick={reset}>Limpar filtros</Button>
            </div>
          ) : (
            <>
              {pager()}
              <div key={listKey} className="animate-fade-in motion-reduce:animate-none">
                <ResultsTable table={table} expanded={expanded} onToggle={toggleExpanded} />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 sm:grid-cols-2 lg:hidden">
                  {pageRows.map((r) => (
                    <ResultCard
                      key={r.id}
                      row={r.original}
                      selected={r.getIsSelected()}
                      expanded={expanded.has(r.id)}
                      onSelect={(v) => r.toggleSelected(v)}
                      onToggle={() => toggleExpanded(r.id)}
                    />
                  ))}
                </div>
              </div>
              {pager("mt-2")}
            </>
          )}
        </>
      )}
    </div>
  );
}
