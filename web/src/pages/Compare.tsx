import { useMemo, useState } from "react";
import { LearnNote, LearnPage } from "@/components/learning/Learn";
import { Link, useSearchParams } from "react-router-dom";
import { Brain, Check, ExternalLink, Gauge, Minus } from "lucide-react";
import { api, ApiError, type CompareCarInput } from "@/lib/api";
import { useDb } from "@/lib/useDb";
import { toRows } from "@/lib/rows";
import { formatBRL, formatKm, formatPricePerKm } from "@/lib/format";
import { imgFallback, proxiedImg } from "@/lib/img";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading } from "@/components/States";
import { cn } from "@/lib/cn";
import type { AdRow, CarMetric, CompareRankingItem } from "@/types";
import { VehicleCompactSummary } from "@/components/VehicleCompactSummary";

function fmtKmL(v: number | null | undefined): string {
  return v != null ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/l` : "—";
}

function optionsOf(properties: { label: string; value: string }[] | undefined): string[] {
  const raw = properties?.find((p) => p.label.toLowerCase() === "opcionais")?.value ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function displayName(r: AdRow): string {
  return r.record.detail.title || r.modeloVersao;
}

/**
 * Diferenças determinísticas, geradas só de dados estruturados já disponíveis — nada de
 * texto de IA aqui. Com 2 veículos, compara par a par (valor da diferença). Com 3-4,
 * aponta o extremo de cada dimensão (não um "vencedor geral" — cada frase é sobre uma
 * dimensão só). Só entra na lista o que de fato diferencia (sem empate, sem dado ausente).
 */
function computeDifferences(rows: AdRow[]): string[] {
  const lines: string[] = [];

  if (rows.length === 2) {
    const [a, b] = rows;

    if (a.price != null && b.price != null && a.price !== b.price) {
      const [cheaper, pricier] = a.price < b.price ? [a, b] : [b, a];
      lines.push(
        `${displayName(cheaper)} é ${formatBRL(Math.abs(a.price - b.price))} mais barato que ${displayName(pricier)}.`,
      );
    }

    if (a.km != null && b.km != null && a.km !== b.km) {
      const [lower, higher] = a.km < b.km ? [a, b] : [b, a];
      lines.push(`${displayName(lower)} tem ${formatKm(Math.abs(a.km - b.km))} a menos que ${displayName(higher)}.`);
    }

    if (a.ano != null && b.ano != null && a.ano !== b.ano) {
      const [newer, older] = a.ano > b.ano ? [a, b] : [b, a];
      const diff = Math.abs(a.ano - b.ano);
      lines.push(`${displayName(newer)} é ${diff} ano${diff > 1 ? "s" : ""} mais novo que ${displayName(older)}.`);
    }

    const aDiff = a.analysis.priceDifferencePercent;
    const bDiff = b.analysis.priceDifferencePercent;
    if (aDiff != null && bDiff != null && Math.abs(aDiff) !== Math.abs(bDiff)) {
      const closer = Math.abs(aDiff) < Math.abs(bDiff) ? a : b;
      lines.push(`${displayName(closer)} está mais próximo do preço médio do mercado.`);
    }

    const aAlerts = a.analysis.alerts.length;
    const bAlerts = b.analysis.alerts.length;
    if (aAlerts !== bAlerts) {
      const more = aAlerts > bAlerts ? a : b;
      lines.push(`${displayName(more)} possui mais alertas (${Math.max(aAlerts, bAlerts)} vs ${Math.min(aAlerts, bAlerts)}).`);
    }

    return lines;
  }

  // 3-4 veículos: extremo de cada dimensão, só quando há pelo menos 2 valores pra comparar.
  const withPrice = rows.filter((r): r is AdRow & { price: number } => r.price != null);
  if (withPrice.length >= 2) {
    const cheapest = withPrice.reduce((m, r) => (r.price < m.price ? r : m));
    lines.push(`${displayName(cheapest)} tem o menor preço (${formatBRL(cheapest.price)}).`);
  }

  const withKm = rows.filter((r): r is AdRow & { km: number } => r.km != null);
  if (withKm.length >= 2) {
    const lowestKm = withKm.reduce((m, r) => (r.km < m.km ? r : m));
    lines.push(`${displayName(lowestKm)} tem a menor quilometragem (${formatKm(lowestKm.km)}).`);
  }

  const withAno = rows.filter((r): r is AdRow & { ano: number } => r.ano != null);
  if (withAno.length >= 2) {
    const newest = withAno.reduce((m, r) => (r.ano > m.ano ? r : m));
    lines.push(`${displayName(newest)} é o mais novo (${newest.ano}).`);
  }

  const withMarket = rows.filter((r) => r.analysis.priceDifferencePercent != null);
  if (withMarket.length >= 2) {
    const closest = withMarket.reduce((m, r) =>
      Math.abs(r.analysis.priceDifferencePercent!) < Math.abs(m.analysis.priceDifferencePercent!) ? r : m,
    );
    lines.push(`${displayName(closest)} está mais próximo do preço médio do mercado.`);
  }

  const maxAlerts = Math.max(...rows.map((r) => r.analysis.alerts.length));
  if (maxAlerts > 0) {
    const fewest = rows.reduce((m, r) => (r.analysis.alerts.length < m.analysis.alerts.length ? r : m));
    if (fewest.analysis.alerts.length < maxAlerts) {
      lines.push(`${displayName(fewest)} tem menos alertas (${fewest.analysis.alerts.length}).`);
    }
  }

  return lines;
}

/**
 * Frase de tradeoff (só com exatamente 2 veículos e quando o preço mais perto do mercado e
 * a menor km não são o mesmo carro — senão não há tradeoff real, um deles "ganha" nas duas
 * dimensões e a frase ficaria redundante com computeDifferences).
 */
function computeTradeoff(rows: AdRow[]): string | null {
  if (rows.length !== 2) return null;
  const [a, b] = rows;
  const aDiff = a.analysis.priceDifferencePercent;
  const bDiff = b.analysis.priceDifferencePercent;
  if (aDiff == null || bDiff == null || a.km == null || b.km == null || a.km === b.km) return null;

  const closerToMarket = Math.abs(aDiff) <= Math.abs(bDiff) ? "primeiro" : "segundo";
  const lowerKm = a.km <= b.km ? "primeiro" : "segundo";
  if (closerToMarket === lowerKm) return null;

  return `O ${closerToMarket} veículo tem preço mais próximo do mercado, enquanto o ${lowerKm} possui menor quilometragem.`;
}

export function Compare() {
  const [params] = useSearchParams();
  const { db, status, error, refetch } = useDb();

  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  const rows = useMemo(
    () => toRows(Object.fromEntries(ids.filter((i) => db[i]).map((i) => [i, db[i]]))),
    [db, ids],
  );

  const differences = useMemo(() => computeDifferences(rows), [rows]);
  const tradeoff = useMemo(() => computeTradeoff(rows), [rows]);

  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [ranking, setRanking] = useState<CompareRankingItem[] | null>(null);

  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, CarMetric> | null>(null);

  function carsInput(): CompareCarInput[] {
    return rows.map((r) => ({
      id: r.id,
      titulo: r.record.detail.title,
      marca: r.marca,
      modelo: r.modelo,
      versao: r.versao,
      ano: r.ano,
      motor: r.record.categoria?.motor ?? null,
      combustivel: r.record.categoria?.combustivel ?? null,
      cambio: r.record.categoria?.cambio ?? null,
      carroceria: r.record.categoria?.carroceria ?? null,
      km: r.km,
      preco: r.price,
      score: r.record.categoria?.score ?? null,
    }));
  }

  async function runCompare(): Promise<void> {
    setComparing(true);
    setCompareError(null);
    try {
      const res = await api.compareCars(carsInput());
      if (!res.ranking) {
        setCompareError(res.raw ? `IA não retornou JSON válido: ${res.raw.slice(0, 200)}` : "IA não retornou um ranking válido.");
        return;
      }
      setRanking([...res.ranking].sort((a, b) => a.posicao - b.posicao));
    } catch (err) {
      setCompareError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setComparing(false);
    }
  }

  async function runMetrics(): Promise<void> {
    setLoadingMetrics(true);
    setMetricsError(null);
    try {
      const res = await api.carMetrics(carsInput());
      if (!res.metrics) {
        setMetricsError(res.raw ? `IA não retornou JSON válido: ${res.raw.slice(0, 200)}` : "IA não retornou métricas válidas.");
        return;
      }
      setMetrics(Object.fromEntries(res.metrics.map((m) => [m.id, m])));
    } catch (err) {
      setMetricsError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoadingMetrics(false);
    }
  }

  if (status === "loading") return <Loading />;
  if (status === "error") return <ErrorBox message={error ?? "Erro"} onRetry={refetch} />;

  if (rows.length < 2) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title="Comparador" />
        <Empty
          title="Selecione de 2 a 4 anúncios"
          hint={
            <>
              Vá para a <Link to="/listagem" className="text-accent hover:underline">Listagem</Link>,
              marque de 2 a 4 linhas e clique em "Comparar".
            </>
          }
        />
      </div>
    );
  }

  const minPrice = Math.min(...(rows.map((r) => r.price).filter((n): n is number => n != null)));
  const minKm = Math.min(...(rows.map((r) => r.km).filter((n): n is number => n != null)));
  const maxAno = Math.max(...(rows.map((r) => r.ano).filter((n): n is number => n != null)));

  const allOptions = [...new Set(rows.flatMap((r) => optionsOf(r.record.detail.properties)))].sort();
  const hasAiOutput = comparing || compareError || ranking || loadingMetrics || metricsError || metrics;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Comparador (${rows.length})`}>
        <Button size="md" onClick={runCompare} disabled={comparing}>
          <Brain className={`h-3 w-3 ${comparing ? "animate-pulse" : ""}`} />
          {comparing ? "Comparando..." : "Comparar com IA"}
        </Button>
        <Button size="md" onClick={runMetrics} disabled={loadingMetrics}>
          <Gauge className={`h-3 w-3 ${loadingMetrics ? "animate-pulse" : ""}`} />
          {loadingMetrics ? "Buscando métricas..." : "Exibir métricas"}
        </Button>
      </PageHeader>

      <LearnPage
        title="Comparador"
        what="Coloca de 2 a 4 carros lado a lado para você enxergar diferenças de preço, km, ano e opcionais."
        can={[
          "Ler \"Principais diferenças\": um resumo calculado direto dos dados, sem IA.",
          "\"Comparar com IA\": a IA ordena os carros do melhor ao pior custo-benefício e explica por quê.",
          "\"Exibir métricas\": a IA estima consumo, potência e peso de cada modelo.",
          "Clicar no nome de um carro para abrir a análise completa.",
        ]}
        read="Na tabela, o melhor valor de cada linha (menor preço, menor km, ano mais novo) é o destaque. Ranking e métricas da IA são estimativas baseadas em conhecimento geral do modelo — confirme antes de decidir."
      />

      {/* Resumos compactos — a primeira coisa que o comprador vê */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <VehicleCompactSummary key={r.id} row={r} title={displayName(r)} />
        ))}
      </div>

      {/* Principais diferenças — determinístico, sem IA */}
      {(differences.length > 0 || tradeoff) && (
        <section className="border border-border bg-surface">
          <p className="border-b border-border px-3 py-2 text-sm font-semibold">Principais diferenças</p>
          <div className="flex flex-col gap-2 p-3 text-sm">
            <LearnNote>
              <p>Resumo feito por regras simples sobre os dados dos carros (diferença de preço, km e ano) — não usa IA e não gasta sua chave.</p>
            </LearnNote>
            {differences.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {differences.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            {tradeoff && <p className="text-muted">{tradeoff}</p>}
          </div>
        </section>
      )}

      {/* Tabela detalhada de atributos */}
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <Th>Anúncio</Th>
              {rows.map((r) => (
                <td key={r.id} className="min-w-[200px] p-3 align-top">
                  <div className="aspect-[4/3] overflow-hidden border border-border">
                    {r.thumb ? (
                      <img
                        src={proxiedImg(r.thumb)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => imgFallback(e, r.thumb)}
                      />
                    ) : null}
                  </div>
                  <Link
                    to={`/anuncio/${r.id}`}
                    className="mt-2 block font-semibold hover:text-accent"
                  >
                    {displayName(r)}
                  </Link>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
                  >
                    <ExternalLink className="h-3 w-3" />
                    OLX
                  </a>
                </td>
              ))}
            </tr>

            <Row label="Preço" rows={rows} render={(r) => formatBRL(r.price)} best={(r) => r.price === minPrice} />
            <Row label="Preço antigo" rows={rows} render={(r) => (r.priceOld != null ? formatBRL(r.priceOld) : "—")} />
            <Row label="Km" rows={rows} render={(r) => formatKm(r.km)} best={(r) => r.km === minKm} />
            <Row label="R$/km" rows={rows} render={(r) => formatPricePerKm(r.pricePerKm)} />
            <Row label="Ano" rows={rows} render={(r) => r.ano ?? "—"} best={(r) => r.ano === maxAno} />
            <Row label="Marca" rows={rows} render={(r) => r.marca ?? "—"} />
            <Row label="Versão" rows={rows} render={(r) => r.versao ?? "—"} />
            <Row label="Motor" rows={rows} render={(r) => r.record.categoria?.motor ?? "—"} />
            <Row label="Câmbio" rows={rows} render={(r) => r.record.categoria?.cambio ?? "—"} />
            <Row label="Combustível" rows={rows} render={(r) => r.record.categoria?.combustivel ?? "—"} />
            {metrics && (
              <>
                <Row
                  label="Consumo cidade (gasolina)"
                  rows={rows}
                  render={(r) => fmtKmL(metrics[r.id]?.consumoCidadeGasolina)}
                />
                <Row
                  label="Consumo estrada (gasolina)"
                  rows={rows}
                  render={(r) => fmtKmL(metrics[r.id]?.consumoEstradaGasolina)}
                />
                <Row
                  label="Consumo cidade (álcool)"
                  rows={rows}
                  render={(r) => fmtKmL(metrics[r.id]?.consumoCidadeAlcool)}
                />
                <Row
                  label="Consumo estrada (álcool)"
                  rows={rows}
                  render={(r) => fmtKmL(metrics[r.id]?.consumoEstradaAlcool)}
                />
                <Row
                  label="Potência"
                  rows={rows}
                  render={(r) => {
                    const cv = metrics[r.id]?.potenciaCv;
                    return cv != null ? `${cv} cv` : "—";
                  }}
                  best={(r) => metrics[r.id]?.potenciaCv === Math.max(...Object.values(metrics).map((m) => m.potenciaCv ?? 0))}
                />
                <Row
                  label="Peso"
                  rows={rows}
                  render={(r) => {
                    const kg = metrics[r.id]?.pesoKg;
                    return kg != null ? `${kg.toLocaleString("pt-BR")} kg` : "—";
                  }}
                />
              </>
            )}
            <Row label="Local" rows={rows} render={(r) => r.location ?? "—"} />

            <tr className="border-b border-border bg-bg">
              <Th>Opcionais</Th>
              {rows.map((r) => (
                <td key={r.id} className="p-3 text-right text-muted tnum">
                  {optionsOf(r.record.detail.properties).length}
                </td>
              ))}
            </tr>
            {allOptions.map((opt) => (
              <tr key={opt} className="border-b border-border last:border-0">
                <Th>{opt}</Th>
                {rows.map((r) => {
                  const has = optionsOf(r.record.detail.properties).includes(opt);
                  return (
                    <td key={r.id} className="p-3 text-center">
                      {has ? (
                        <Check className="mx-auto h-3 w-3 text-ok" />
                      ) : (
                        <Minus className="mx-auto h-3 w-3 text-subtle" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Análise complementar da IA — texto livre, só depois dos dados estruturados */}
      {hasAiOutput && (
        <section className="border border-border bg-surface">
          <p className="border-b border-border px-3 py-2 text-sm font-semibold">Análise complementar da IA</p>
          <div className="flex flex-col gap-4 p-3 text-sm">
            {comparing && <p className="text-muted">Aguardando a IA (pode levar um pouco)...</p>}
            {compareError && <p className="text-danger">{compareError}</p>}
            {ranking && (
              <ol className="flex flex-col gap-2">
                {ranking.map((item) => {
                  const row = rows.find((r) => r.id === item.id);
                  return (
                    <li
                      key={item.id}
                      className={cn("border border-border p-3", item.posicao === 1 && "border-ok bg-ok-bg")}
                    >
                      <span className="font-semibold">
                        {item.posicao}º — {row ? displayName(row) : item.id}
                      </span>
                      <p className="mt-1 text-muted">{item.texto}</p>
                    </li>
                  );
                })}
              </ol>
            )}
            {loadingMetrics && <p className="text-muted">Buscando métricas com a IA...</p>}
            {metricsError && <p className="text-danger">{metricsError}</p>}
            {metrics && Object.values(metrics).some((m) => m.nota) && (
              <div className="flex flex-col gap-2">
                {rows.map((r) =>
                  metrics[r.id]?.nota ? (
                    <p key={r.id}>
                      <span className="font-semibold">{displayName(r)}:</span>{" "}
                      <span className="text-muted">{metrics[r.id]?.nota}</span>
                    </p>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <td className="w-[140px] bg-bg p-3 align-top font-semibold text-muted">{children}</td>;
}

function Row({
  label,
  rows,
  render,
  best,
}: {
  label: string;
  rows: AdRow[];
  render: (r: AdRow) => React.ReactNode;
  best?: (r: AdRow) => boolean;
}) {
  return (
    <tr className="border-b border-border">
      <Th>{label}</Th>
      {rows.map((r) => (
        <td
          key={r.id}
          className={cn(
            "p-3 text-right tnum",
            best?.(r) && "font-semibold text-ok",
          )}
        >
          {render(r)}
        </td>
      ))}
    </tr>
  );
}
