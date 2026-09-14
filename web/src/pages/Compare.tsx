import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ExternalLink, Minus } from "lucide-react";
import { useDb } from "@/lib/useDb";
import { toRows } from "@/lib/rows";
import { formatBRL, formatKm, formatPricePerKm } from "@/lib/format";
import { imgFallback, proxiedImg } from "@/lib/img";
import { PageHeader } from "@/components/Layout";
import { Empty, ErrorBox, Loading } from "@/components/States";
import { cn } from "@/lib/cn";

function optionsOf(properties: { label: string; value: string }[] | undefined): string[] {
  const raw = properties?.find((p) => p.label.toLowerCase() === "opcionais")?.value ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function Compare() {
  const [params] = useSearchParams();
  const { db, status, error, refetch } = useDb();

  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  const rows = useMemo(
    () => toRows(Object.fromEntries(ids.filter((i) => db[i]).map((i) => [i, db[i]]))),
    [db, ids],
  );

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Comparador (${rows.length})`} />

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
                    {r.record.detail.title || r.modeloVersao}
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
  rows: ReturnType<typeof toRows>;
  render: (r: ReturnType<typeof toRows>[number]) => React.ReactNode;
  best?: (r: ReturnType<typeof toRows>[number]) => boolean;
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
