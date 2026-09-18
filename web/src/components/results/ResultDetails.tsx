import { Link } from "react-router-dom";
import { ExternalLink, AlertTriangle } from "lucide-react";
import type { AdRow } from "@/types";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { HELP, HelpTip } from "@/components/ui/tooltip";
import { LearnNote } from "@/components/learning/Learn";
import { opportunityPhrase } from "./StatusBadge";

function Item({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1 text-xs font-semibold text-muted">
        {label}
        {help && <HelpTip text={help} />}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Detalhes expandidos de um anúncio (usado pela linha da tabela e pelo card mobile). */
export function ResultDetails({ row }: { row: AdRow }) {
  const a = row.analysis;
  const props = row.record.detail?.properties ?? [];
  return (
    <div className="flex animate-fade-in flex-col gap-4 motion-reduce:animate-none">
      <LearnNote title="Detalhes do anúncio">
        <p><strong>Oportunidade</strong> é uma nota de 0 a 100 baseada principalmente no preço frente ao mercado, com ajustes pela condição estimada pela IA e pela quilometragem.</p>
        <p><strong>Mercado</strong> é o preço médio de outros anúncios da mesma marca, modelo e ano, e quantos anúncios entraram na conta. Com menos de 2 outros, não há comparação.</p>
        <p><strong>Alertas</strong> são pontos a conferir antes de decidir. <strong>Salvo em</strong> é quando o anúncio entrou na sua base.</p>
      </LearnNote>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Item label="Oportunidade" help={HELP.oportunidade}>
          {opportunityPhrase(a)}
          {a.opportunityScore != null && <span className="tnum text-subtle"> · {a.opportunityScore}/100</span>}
        </Item>
        <Item label="Mercado" help={HELP.mercado}>
          {a.marketAveragePrice != null ? (
            <>
              {formatBRL(a.marketAveragePrice)}
              <span className="text-subtle"> · {a.marketSampleSize} anúncios</span>
            </>
          ) : (
            <span className="text-subtle">Sem dados suficientes</span>
          )}
        </Item>
        <Item label="Local" help={HELP.local}>
          {row.location ?? <span className="text-subtle">—</span>}
        </Item>
        <Item label="Salvo em">{formatDate(row.date)}</Item>
      </dl>

      {a.alerts.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
            Alertas <HelpTip text={HELP.alertas} />
          </p>
          <ul className="flex flex-col gap-1">
            {a.alerts.map((al) => (
              <li key={al.type} className="flex items-start gap-1 text-sm text-warn">
                <AlertTriangle aria-hidden className="mt-1 h-3 w-3 shrink-0" />
                <span>
                  <strong className="font-semibold">{al.title}.</strong>{" "}
                  <span className="text-muted">{al.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.length > 0 && (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-4 gap-y-2 border-t border-border pt-3">
          {props.map((p) => (
            <div key={p.label} className="flex flex-col">
              <dt className="text-xs text-muted">{p.label}</dt>
              <dd className="text-sm">{p.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to={`/anuncio/${row.id}`} className="contents">
          <Button size="md" variant="default" tabIndex={-1}>
            Abrir análise completa
          </Button>
        </Link>
        {row.url && (
          <a href={row.url} target="_blank" rel="noreferrer" className="contents">
            <Button size="md">
              <ExternalLink className="h-3 w-3" />
              Ver na OLX
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
