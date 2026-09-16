import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { AdRow, VehicleAlert } from "@/types";
import { useDb } from "@/lib/useDb";
import { computeStats } from "@/lib/rows";
import { formatBRL, formatKm, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/Layout";
import { ProxyStatus } from "@/components/ProxyStatus";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorBox, Loading } from "@/components/States";
import { MarketStatusBadge, OpportunityBadge, marketPhrase } from "@/components/VehicleAnalysisBadges";
import { cn } from "@/lib/cn";

const BEST_OPPORTUNITIES_LIMIT = 8;
const BELOW_MARKET_LIMIT = 5;
const TO_VERIFY_LIMIT = 6;
/** abaixo disso (%) já é considerado "meaningfully" abaixo do mercado pra entrar na seção. */
const BELOW_MARKET_THRESHOLD = -10;
/** alertas informativos sobre a própria comparação (não sobre o veículo) não contam como "ponto pra verificar". */
const INFORMATIONAL_ALERT_TYPES = new Set(["insufficient_market_sample"]);

function titleFor(r: AdRow): string {
  return [r.marca, r.modelo].filter(Boolean).join(" ") || r.modeloVersao;
}

function isRelevantAlert(a: VehicleAlert): boolean {
  return !INFORMATIONAL_ALERT_TYPES.has(a.type);
}

/**
 * Alguns registros na base não são veículos de fato (anúncios mal categorizados que caem
 * no grupo "?|?|?" e acabam comparados entre si, gerando diffs de preço absurdos tipo
 * -99%). Sem marca nem modelo reconhecidos pela IA, não dá pra tratar como carro nas
 * seções de destaque — evita, por exemplo, mostrar um "tênis" como oportunidade de -99%.
 */
function isPlausibleVehicle(r: AdRow): boolean {
  return r.marca != null || r.modelo != null;
}

function pointsToVerifyText(n: number): string {
  if (n === 0) return "Sem pontos para verificar";
  return n === 1 ? "1 ponto para verificar" : `${n} pontos para verificar`;
}

function pct(n: number, total: number): number | null {
  return total > 0 ? Math.round((n / total) * 100) : null;
}

export function Dashboard() {
  const { rows, status, error, refetch } = useDb();
  const stats = useMemo(() => computeStats(rows), [rows]);

  const goodOpportunityCount = useMemo(
    () => rows.filter((r) => r.analysis.opportunityLabel === "good" || r.analysis.opportunityLabel === "excellent").length,
    [rows],
  );

  const marketAvailableCount = useMemo(
    () => rows.filter((r) => isPlausibleVehicle(r) && r.analysis.priceStatus != null).length,
    [rows],
  );

  const toVerifyCount = useMemo(
    () => rows.filter((r) => isPlausibleVehicle(r) && r.analysis.alerts.some(isRelevantAlert)).length,
    [rows],
  );

  // "boa oportunidade, mas sem exagerar" — score alto, comparação de mercado utilizável, e
  // sem múltiplos alertas relevantes acumulados (não empurra um carro com 3 pontos de
  // atenção só porque o preço parece ótimo).
  const bestOpportunities = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            isPlausibleVehicle(r) &&
            r.price != null &&
            r.analysis.priceStatus != null &&
            (r.analysis.opportunityLabel === "good" || r.analysis.opportunityLabel === "excellent") &&
            r.analysis.alerts.filter(isRelevantAlert).length <= 1,
        )
        .sort((a, b) => (b.analysis.opportunityScore ?? 0) - (a.analysis.opportunityScore ?? 0))
        .slice(0, BEST_OPPORTUNITIES_LIMIT),
    [rows],
  );

  const belowMarket = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            isPlausibleVehicle(r) &&
            r.analysis.priceDifferencePercent != null &&
            r.analysis.priceDifferencePercent <= BELOW_MARKET_THRESHOLD,
        )
        .sort((a, b) => (a.analysis.priceDifferencePercent ?? 0) - (b.analysis.priceDifferencePercent ?? 0))
        .slice(0, BELOW_MARKET_LIMIT),
    [rows],
  );

  const toVerify = useMemo(
    () =>
      rows
        .filter((r) => isPlausibleVehicle(r) && r.analysis.alerts.some(isRelevantAlert))
        .sort((a, b) => b.analysis.alerts.filter(isRelevantAlert).length - a.analysis.alerts.filter(isRelevantAlert).length)
        .slice(0, TO_VERIFY_LIMIT),
    [rows],
  );

  if (status === "loading") return <Loading />;
  if (status === "error") return <ErrorBox message={error ?? "Erro"} onRetry={refetch} />;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard">
        <ProxyStatus />
      </PageHeader>

      {status === "empty" ? (
        <Empty />
      ) : (
        <>
          {/* 1. Resumo */}
          <section className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <SummaryCard label="Veículos analisados" value={formatNumber(stats.total)} hint="na base atual" />
              <SummaryCard
                label="Preço típico"
                value={formatBRL(stats.medianPrice)}
                hint={stats.avgPrice != null ? `Preço mediano · média ${formatBRL(stats.avgPrice)}` : "Preço mediano"}
              />
              <SummaryCard
                label="Boas oportunidades"
                value={`${formatNumber(goodOpportunityCount)}`}
                hint={
                  pct(goodOpportunityCount, stats.total) != null
                    ? `${pct(goodOpportunityCount, stats.total)}% dos anúncios analisados`
                    : undefined
                }
                accent
              />
              <SummaryCard
                label="Pontos para verificar"
                value={formatNumber(toVerifyCount)}
                hint="dados que merecem verificação"
              />
              <SummaryCard
                label="Comparação de mercado"
                value={pct(marketAvailableCount, stats.total) != null ? `${pct(marketAvailableCount, stats.total)}%` : "—"}
                hint="dos anúncios com comparação disponível"
              />
            </div>
            <p className="text-xs text-subtle">
              Alguns anúncios possuem poucos veículos semelhantes para comparação. Nesses casos, a análise de preço é
              limitada.
            </p>
          </section>

          {/* 2. Melhores oportunidades */}
          <Section
            title="Melhores oportunidades"
            caption="Veículos que se destacam pelos dados disponíveis — não é uma recomendação de compra."
          >
            {bestOpportunities.length === 0 ? (
              <EmptyNote text="Nenhum anúncio se destacou nesse critério ainda." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {bestOpportunities.map((r) => (
                  <VehicleMiniCard key={r.id} row={r}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <MarketStatusBadge analysis={r.analysis} />
                      <OpportunityBadge analysis={r.analysis} />
                    </div>
                    <p className="text-xs text-subtle">
                      {pointsToVerifyText(r.analysis.alerts.filter(isRelevantAlert).length)}
                    </p>
                  </VehicleMiniCard>
                ))}
              </div>
            )}
          </Section>

          {/* 3. Abaixo do preço esperado */}
          <Section title="Abaixo do preço esperado" caption="Anúncios com preço bem abaixo da média de similares.">
            {belowMarket.length === 0 ? (
              <EmptyNote text="Ainda não há veículos suficientes para essa comparação." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {belowMarket.map((r) => {
                  const extreme = r.analysis.alerts.some((a) => a.type === "price_far_below_market");
                  return (
                    <VehicleMiniCard key={r.id} row={r}>
                      {extreme ? (
                        <p className="text-xs font-semibold text-warn">Preço muito abaixo do padrão — verificar</p>
                      ) : (
                        <p className="text-xs font-semibold text-ok">{marketPhrase(r.analysis)} do mercado</p>
                      )}
                      {r.analysis.marketAveragePrice != null && (
                        <p className="text-xs text-subtle">
                          Média dos similares: {formatBRL(r.analysis.marketAveragePrice)}
                        </p>
                      )}
                    </VehicleMiniCard>
                  );
                })}
              </div>
            )}
          </Section>

          {/* 4. Pontos para verificar */}
          <Section title="Pontos para verificar" caption="Dados que merecem uma checagem antes de decidir — não são acusações.">
            {toVerify.length === 0 ? (
              <EmptyNote text="Nenhum ponto relevante para verificar no momento." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {toVerify.map((r) => {
                  const relevant = r.analysis.alerts.filter(isRelevantAlert);
                  const [first, ...rest] = relevant;
                  return (
                    <VehicleMiniCard key={r.id} row={r}>
                      {first && (
                        <div className="flex flex-col gap-1">
                          <Badge tone={first.severity === "danger" ? "danger" : "warn"} className="w-fit">
                            {first.title}
                          </Badge>
                          <p className="text-xs text-muted">{first.description}</p>
                        </div>
                      )}
                      {rest.length > 0 && (
                        <p className="text-xs text-subtle">
                          +{rest.length} outro{rest.length > 1 ? "s" : ""} ponto{rest.length > 1 ? "s" : ""}
                        </p>
                      )}
                    </VehicleMiniCard>
                  );
                })}
              </div>
            )}
          </Section>

          {/* 5. Explorar o mercado (analítico, demotido) */}
          <Section title="Explorar o mercado" caption="Visão agregada da base — informação secundária pra apoiar a decisão.">
            <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted">
              <span>
                Anúncios com preço: <strong className="text-fg tnum">{formatNumber(stats.withPrice)}</strong>
              </span>
              <span>
                Com queda de preço: <strong className="text-fg tnum">{formatNumber(stats.priceDrops)}</strong>
              </span>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <DistTable title="Anúncios por marca" rows={stats.byMarca} total={stats.total} />
              <DistTable title="Anúncios por ano" rows={stats.byAno} total={stats.total} />
            </div>
          </Section>

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

function SummaryCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={cn("mt-1 text-xl tnum", accent && "text-accent")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <p className="text-sm font-semibold">{title}</p>
        {caption && <p className="text-xs text-subtle">{caption}</p>}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="py-4 text-center text-sm text-subtle">{text}</p>;
}

function VehicleMiniCard({ row, children }: { row: AdRow; children: React.ReactNode }) {
  return (
    <Link
      to={`/anuncio/${row.id}`}
      className="flex flex-col gap-1.5 border border-border bg-surface p-3 transition-colors duration-DEFAULT hover:border-accent"
    >
      <p className="truncate text-sm font-semibold" title={titleFor(row)}>
        {titleFor(row)}
        {row.ano ? ` ${row.ano}` : ""}
      </p>
      <div>
        <p className="tnum text-sm font-semibold">{formatBRL(row.price)}</p>
        <p className="tnum text-xs text-muted">{formatKm(row.km)}</p>
      </div>
      {children}
    </Link>
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
