import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { GitCompareArrows, ExternalLink } from "lucide-react";
import type { AdRow } from "@/types";
import { useDb } from "@/lib/useDb";
import { applyFilters, useFilters } from "@/lib/useFilters";
import { formatBRL, formatDate, formatKm, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/Layout";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { Toolbar } from "@/components/data-table/toolbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, ErrorBox, Loading } from "@/components/States";
import { AlertsBadge, MarketStatusBadge, OpportunityBadge } from "@/components/VehicleAnalysisBadges";

export function Listing() {
  const navigate = useNavigate();
  const { rows, status, error, refetch } = useDb();
  const { filters, setFilter, reset, active } = useFilters();
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [selection, setSelection] = useState<RowSelectionState>({});

  const marcas = useMemo(
    () => [...new Set(rows.map((r) => r.marca).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const anos = useMemo(
    () => [...new Set(rows.map((r) => r.ano).filter(Boolean) as number[])].sort((a, b) => b - a),
    [rows],
  );

  const data = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const columns = useMemo<ColumnDef<AdRow>[]>(
    () => [
      {
        id: "select",
        size: 32,
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Selecionar tudo"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Selecionar linha"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      {
        id: "veiculo",
        accessorFn: (r) => [r.marca, r.modelo].filter(Boolean).join(" ") || r.modeloVersao,
        header: ({ column }) => <ColumnHeader column={column} title="Veículo" />,
        cell: ({ row }) => {
          const r = row.original;
          const main = [r.marca, r.modelo].filter(Boolean).join(" ") || r.modeloVersao;
          return (
            <div className="flex max-w-[280px] flex-col">
              <span className="truncate font-medium">{main}</span>
              {r.versao && <span className="truncate text-xs text-muted">{r.versao}</span>}
            </div>
          );
        },
      },
      {
        accessorKey: "ano",
        header: ({ column }) => <ColumnHeader column={column} title="Ano" align="right" />,
        cell: ({ row }) => <div className="tnum text-right">{row.original.ano ?? "—"}</div>,
        sortUndefined: "last",
      },
      {
        accessorKey: "km",
        header: ({ column }) => <ColumnHeader column={column} title="Quilometragem" align="right" />,
        cell: ({ row }) => <div className="tnum text-right">{formatKm(row.original.km)}</div>,
        sortUndefined: "last",
      },
      {
        accessorKey: "price",
        header: ({ column }) => <ColumnHeader column={column} title="Preço" align="right" />,
        cell: ({ row }) => (
          <div className="text-right">
            <div className="tnum font-semibold">{formatBRL(row.original.price)}</div>
            {row.original.priceOld != null && (
              <div className="tnum text-xs text-muted line-through">{formatBRL(row.original.priceOld)}</div>
            )}
          </div>
        ),
        sortUndefined: "last",
      },
      {
        id: "mercado",
        accessorFn: (r) => r.analysis.priceDifferencePercent ?? null,
        header: () => "Mercado",
        enableSorting: false,
        cell: ({ row }) => <MarketStatusBadge analysis={row.original.analysis} />,
      },
      {
        id: "oportunidade",
        accessorFn: (r) => r.analysis.opportunityScore ?? -1,
        header: ({ column }) => <ColumnHeader column={column} title="Oportunidade" />,
        cell: ({ row }) => <OpportunityBadge analysis={row.original.analysis} showScore />,
        sortUndefined: "last",
      },
      {
        id: "alertas",
        accessorFn: (r) => r.analysis.alerts.length,
        header: ({ column }) => <ColumnHeader column={column} title="Alertas" />,
        cell: ({ row }) => <AlertsBadge analysis={row.original.analysis} />,
        sortUndefined: "last",
      },
      {
        accessorKey: "location",
        header: ({ column }) => <ColumnHeader column={column} title="Local" />,
        cell: ({ row }) => (
          <span className="block max-w-[160px] truncate text-muted">
            {row.original.location ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "date",
        header: ({ column }) => <ColumnHeader column={column} title="Data" align="right" />,
        cell: ({ row }) => <div className="tnum text-right text-muted">{formatDate(row.original.date)}</div>,
        sortUndefined: "last",
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection: selection },
    getRowId: (r) => r.id,
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const canCompare = selectedIds.length >= 2 && selectedIds.length <= 4;

  if (status === "loading") return <Loading />;
  if (status === "error") return <ErrorBox message={error ?? "Erro"} onRetry={refetch} />;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Listagem">
        <span className="text-sm text-muted tnum">{formatNumber(rows.length)} anúncios</span>
      </PageHeader>

      {status === "empty" ? (
        <Empty />
      ) : (
        <>
          <Toolbar
            filters={filters}
            setFilter={setFilter}
            reset={reset}
            active={active}
            marcas={marcas}
            anos={anos}
            right={
              <Button
                size="md"
                variant={canCompare ? "default" : "outline"}
                disabled={!canCompare}
                onClick={() => navigate(`/comparador?ids=${selectedIds.join(",")}`)}
                title={canCompare ? "" : "Selecione de 2 a 4 anúncios"}
              >
                <GitCompareArrows className="h-3 w-3" />
                Comparar ({selectedIds.length})
              </Button>
            }
          />

          <DataTable
            table={table}
            onRowClick={(r) => navigate(`/anuncio/${r.id}`)}
            rowClassName={(r) =>
              r.analysis.opportunityLabel === "excellent" || r.analysis.opportunityLabel === "good"
                ? "row-opportunity"
                : undefined
            }
          />

          <p className="flex items-center gap-1 text-xs text-subtle">
            <ExternalLink className="h-3 w-3" />
            Clique numa linha para abrir o detalhe.
          </p>
        </>
      )}
    </div>
  );
}
