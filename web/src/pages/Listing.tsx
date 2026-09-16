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
import { GitCompareArrows, ExternalLink, TrendingDown, AlertTriangle } from "lucide-react";
import type { AdRow } from "@/types";
import { useDb } from "@/lib/useDb";
import { applyFilters, useFilters } from "@/lib/useFilters";
import { formatBRL, formatDate, formatKm, formatNumber, formatPricePerKm } from "@/lib/format";
import { PageHeader } from "@/components/Layout";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { Toolbar } from "@/components/data-table/toolbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorBox, Loading } from "@/components/States";

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
        accessorKey: "marca",
        header: ({ column }) => <ColumnHeader column={column} title="Marca" />,
        cell: ({ row }) => row.original.marca ?? "—",
        sortUndefined: "last",
      },
      {
        accessorKey: "modeloVersao",
        header: ({ column }) => <ColumnHeader column={column} title="Modelo / versão" />,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="truncate">{row.original.modeloVersao}</span>
            {row.original.opportunity && (
              <Badge tone="ok" title="Abaixo da média do mesmo modelo/ano">
                <TrendingDown className="mr-1 h-3 w-3" />
                oportunidade
              </Badge>
            )}
            {row.original.record.categoria?.kmSuspeito && (
              <Badge
                tone="warn"
                title={row.original.record.categoria?.kmSuspeitoMotivo ?? "Km muito baixa pra idade do carro"}
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                km suspeita
              </Badge>
            )}
          </span>
        ),
      },
      {
        accessorKey: "ano",
        header: ({ column }) => <ColumnHeader column={column} title="Ano" align="right" />,
        cell: ({ row }) => <div className="tnum text-right">{row.original.ano ?? "—"}</div>,
        sortUndefined: "last",
      },
      {
        accessorKey: "km",
        header: ({ column }) => <ColumnHeader column={column} title="Km" align="right" />,
        cell: ({ row }) => <div className="tnum text-right">{formatKm(row.original.km)}</div>,
        sortUndefined: "last",
      },
      {
        accessorKey: "price",
        header: ({ column }) => <ColumnHeader column={column} title="Preço" align="right" />,
        cell: ({ row }) => (
          <div className="tnum text-right font-semibold">{formatBRL(row.original.price)}</div>
        ),
        sortUndefined: "last",
      },
      {
        accessorKey: "priceOld",
        header: ({ column }) => <ColumnHeader column={column} title="Preço antigo" align="right" />,
        cell: ({ row }) =>
          row.original.priceOld != null ? (
            <div className="tnum text-right text-muted line-through">
              {formatBRL(row.original.priceOld)}
            </div>
          ) : (
            <div className="text-right text-subtle">—</div>
          ),
        sortUndefined: "last",
      },
      {
        accessorKey: "pricePerKm",
        header: ({ column }) => <ColumnHeader column={column} title="R$/km" align="right" />,
        cell: ({ row }) => (
          <div className="tnum text-right">{formatPricePerKm(row.original.pricePerKm)}</div>
        ),
        sortUndefined: "last",
      },
      {
        accessorKey: "location",
        header: ({ column }) => <ColumnHeader column={column} title="Local" />,
        cell: ({ row }) => (
          <span className="block max-w-[200px] truncate text-muted">
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
            rowClassName={(r) => (r.opportunity ? "row-opportunity" : undefined)}
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
