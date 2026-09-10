import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDb } from "@/lib/useDb";
import { computeStats } from "@/lib/rows";
import { formatBRL, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/Layout";
import { ProxyStatus } from "@/components/ProxyStatus";
import { Empty, ErrorBox, Loading } from "@/components/States";

export function Dashboard() {
  const { rows, status, error, refetch } = useDb();
  const stats = useMemo(() => computeStats(rows), [rows]);

  if (status === "loading") return <Loading />;
  if (status === "error") return <ErrorBox message={error ?? "Erro"} onRetry={refetch} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard">
        <ProxyStatus />
      </PageHeader>

      {status === "empty" ? (
        <Empty />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-0 border border-border bg-surface sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Anúncios" value={formatNumber(stats.total)} />
            <Stat label="Com preço" value={formatNumber(stats.withPrice)} />
            <Stat label="Preço médio" value={formatBRL(stats.avgPrice)} />
            <Stat label="Preço mediano" value={formatBRL(stats.medianPrice)} />
            <Stat label="Com queda de preço" value={formatNumber(stats.priceDrops)} />
            <Stat label="Oportunidades" value={formatNumber(stats.opportunities)} accent />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <DistTable title="Distribuição por marca" rows={stats.byMarca} total={stats.total} />
            <DistTable title="Distribuição por ano" rows={stats.byAno} total={stats.total} />
          </div>

          <p className="text-sm text-muted">
            <Link to="/listagem" className="text-accent hover:underline">
              Ver todos os anúncios na Listagem →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-b border-r border-border p-4 last:border-r-0">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`mt-1 text-lg tnum ${accent ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}

function DistTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="border border-border bg-surface">
      <p className="border-b border-border px-3 py-2 text-sm font-semibold">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.slice(0, 12).map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <td className="w-[40%] px-3 py-1 truncate">{r.label}</td>
              <td className="px-3 py-1">
                <div className="h-2 rounded-sm bg-accent-weak">
                  <div
                    className="h-2 rounded-sm bg-accent"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </div>
              </td>
              <td className="w-[64px] px-3 py-1 text-right tnum text-muted">{r.count}</td>
              <td className="w-[52px] px-3 py-1 text-right tnum text-subtle">
                {total ? `${Math.round((r.count / total) * 100)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
