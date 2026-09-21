import { useMemo, useState } from "react";
import { LearnNote, LearnPage } from "@/components/learning/Learn";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useDb } from "@/lib/useDb";
import { toRows } from "@/lib/rows";
import { formatBRL, formatDate, formatKm } from "@/lib/format";
import { imgFallback, proxiedImg } from "@/lib/img";
import type { AdCategoria } from "@/types";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorBox, Loading } from "@/components/States";
import { VehicleSummary } from "@/components/VehicleSummary";

export function Detail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { db, status, error, refetch } = useDb();
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<null | "analyze" | "remove">(null);
  const [msg, setMsg] = useState<string | null>(null);

  const record = db[id];
  const row = useMemo(() => (record ? toRows({ [id]: record })[0] : null), [db, id, record]);

  if (status === "loading") return <Loading />;
  if (status === "error") return <ErrorBox message={error ?? "Erro"} onRetry={refetch} />;
  if (!record || !row) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title="Anúncio não encontrado" />
        <Link to="/listagem" className="text-sm text-accent hover:underline">
          ← Voltar para a Listagem
        </Link>
      </div>
    );
  }

  const { detail } = record;
  const cat = record.categoria;
  const images = detail.images ?? [];

  async function reanalyze() {
    setBusy("analyze");
    setMsg(null);
    try {
      const section = {
        index: 0,
        title: detail.title,
        price: detail.price,
        description: (detail.description ?? "").replace(/<[^>]+>/g, " "),
        details: detail.properties?.map((p) => `${p.label}: ${p.value}`) ?? [],
      };
      const res = await api.analyze([section]);
      const c = res.categorias?.[0];
      if (!c) throw new ApiError(res.raw ?? "IA não retornou categoria", "payload");
      const categoria = c as unknown as AdCategoria;
      await api.mergeRecord({ id, categoria, analyzedAt: Date.now() });
      setMsg("Categoria atualizada.");
      refetch();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Remover este anúncio do db.json?")) return;
    setBusy("remove");
    try {
      await api.removeRecord(id);
      navigate("/listagem");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={detail.title || `Anúncio ${id}`}>
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3 w-3" />
          Voltar
        </Button>
        <a href={row.url} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline">
            <ExternalLink className="h-3 w-3" />
            Abrir no OLX
          </Button>
        </a>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={reanalyze}>
          <RefreshCw className={`h-3 w-3 ${busy === "analyze" ? "animate-spin" : ""}`} />
          {busy === "analyze" ? "Analisando..." : "Reanalisar"}
        </Button>
        <Button size="sm" variant="danger" disabled={busy !== null} onClick={remove}>
          <Trash2 className="h-3 w-3" />
          Remover do DB
        </Button>
      </PageHeader>

      <LearnPage
        title="Anúncio"
        what="Análise completa de um único carro: fotos, preço, comparação com o mercado, especificações estimadas pela IA e os dados originais do anúncio."
        can={[
          "\"Abrir no OLX\": vai ao anúncio original.",
          "\"Reanalisar\": abre o anúncio de novo, extrai os dados e pede outra categorização à IA (use se a análise veio incompleta).",
          "\"Remover do DB\": apaga este carro da sua base (não dá para desfazer).",
          "Clicar nas miniaturas para trocar a foto grande.",
          "Abrir \"Ver como essa análise foi calculada\" para ver a conta passo a passo.",
        ]}
        read="O preço riscado é o preço anterior do anúncio (houve queda). A etiqueta “oportunidade” aparece quando a análise considera o negócio atrativo."
      />
      {busy === "analyze" && <p role="status" className="text-sm text-muted">Aguardando a IA. Isso pode levar alguns minutos.</p>}
      {msg && (
        <p className="border border-border bg-surface p-3 text-sm text-muted">{msg}</p>
      )}

      <VehicleSummary analysis={row.analysis} price={row.price} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Galeria */}
        <div className="flex flex-col gap-2">
          <div className="aspect-[4/3] overflow-hidden border border-border bg-surface">
            {images[active] ? (
              <img
                src={proxiedImg(images[active])}
                alt={detail.title ?? ""}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(e) => imgFallback(e, images[active])}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-subtle">
                sem imagem
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-6 gap-1">
              {images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setActive(i)}
                  className={`aspect-square overflow-hidden border ${
                    i === active ? "border-accent" : "border-border"
                  }`}
                >
                  <img
                    src={proxiedImg(src)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => imgFallback(e, src)}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dados */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-lg font-semibold tnum">{formatBRL(row.price)}</span>
            {row.priceOld != null && (
              <span className="text-sm text-muted line-through tnum">{formatBRL(row.priceOld)}</span>
            )}
            {row.opportunity && <Badge tone="ok">oportunidade</Badge>}
            <span className="text-sm text-muted">{detail.location ?? "—"}</span>
            <span className="text-sm text-subtle tnum">{formatDate(row.date)}</span>
          </div>

          <LearnNote title="Como a análise é calculada">
            <p>A <strong>oportunidade</strong> começa em 50 e sobe ou desce conforme o preço frente à média de similares: 5% a 10% abaixo dá +10, 10% a 20% abaixo +20, 20% ou mais abaixo +30 (preço 25% abaixo ou pior é tratado com cautela: bônus só +15 e um alerta). Acima do mercado desconta na mesma escala, até -30.</p>
            <p>A <strong>condição estimada pela IA</strong> ajusta de -5 a +10 e <strong>km suspeita</strong> tira pontos. Rótulos: 85+ Excelente, 70+ Boa, 50+ Dentro do esperado, abaixo disso Pouco atrativa.</p>
            <p>A <strong>confiança</strong> diz o quanto dá para confiar na análise: sobe quando há preço, ano, km, marca/modelo e nota da IA, e quando há pelo menos 2 (idealmente 5+) anúncios para comparar. 75+ é Alta, 50+ Média.</p>
          </LearnNote>
          <Section title="Especificações">
            <p className="mb-2 text-xs text-subtle">Estimadas pela IA a partir do anúncio.</p>
            <LearnNote className="mb-3">
              <p>A IA lê o título e a descrição e preenche marca, modelo, versão, motor etc. Ela pode errar ou deixar em branco (—) o que não aparece no texto; a <strong>km suspeita</strong> compara a km anunciada com a idade do carro (média muito baixa por ano pode indicar odômetro adulterado).</p>
            </LearnNote>
            {cat ? (
              <>
                {cat.kmSuspeito && (
                  <div className="mb-3 flex items-start gap-2 border border-warn-border bg-warn-bg p-3 text-sm text-warn">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>Km suspeita.</strong> {cat.kmSuspeitoMotivo ?? "Muito baixa pra idade do carro — possível odômetro adulterado."}
                    </span>
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                  <Item k="Marca" v={cat.marca} />
                  <Item k="Modelo" v={cat.modelo} />
                  <Item k="Versão" v={cat.versao} />
                  <Item k="Ano" v={cat.ano} />
                  <Item k="Motor" v={cat.motor} />
                  <Item k="Combustível" v={cat.combustivel} />
                  <Item k="Câmbio" v={cat.cambio} />
                  <Item k="Portas" v={cat.portas} />
                  <Item k="Carroceria" v={cat.carroceria} />
                  <Item k="Km" v={formatKm(row.km)} />
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted">Sem categoria da IA. Use "Reanalisar".</p>
            )}
          </Section>

          <Section title={`Dados do anúncio (${detail.properties?.length ?? 0})`}>
            <LearnNote className="mb-3">
              <p>Campos exatamente como o vendedor preencheu no OLX, sem interpretação da IA.</p>
            </LearnNote>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {detail.properties?.map((p) => <Item key={p.label} k={p.label} v={p.value} />)}
            </dl>
          </Section>

          <Section title="Descrição">
            <div
              className="whitespace-pre-wrap text-sm text-fg"
              dangerouslySetInnerHTML={{
                __html: (detail.description ?? "—").replace(/<(?!br\s*\/?)[^>]+>/gi, ""),
              }}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-surface">
      <p className="border-b border-border px-3 py-2 text-sm font-semibold">{title}</p>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1 last:border-0">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="text-sm text-right tnum">{v == null || v === "" ? "—" : String(v)}</dd>
    </div>
  );
}
