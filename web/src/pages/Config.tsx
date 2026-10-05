import { useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useDb } from "@/lib/useDb";
import { exportDbJson, exportRowsCsv, exportRowsJson } from "@/lib/exporters";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ErrorBox, Loading } from "@/components/States";
import { LearnPage } from "@/components/learning/Learn";
import { AiProviders } from "@/components/config/AiProviders";

export function Config() {
  const { db, rows, status, error, refetch } = useDb();
  const [msg, setMsg] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function clear() {
    if (!confirm("Apagar todos os anúncios salvos? Não dá pra desfazer.")) return;
    setClearing(true);
    try {
      await api.clearDb();
      refetch();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    setMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error("Arquivo não é um JSON de objeto");
      await api.importDb(parsed);
      refetch();
      setMsg(`Importado: ${Object.keys(parsed).length} registro(s) mesclados.`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : `Falha ao importar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (status === "loading") return <Loading />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" />

      <LearnPage
        title="Configurações"
        what="Onde você liga a IA (obrigatória para analisar anúncios) e cuida dos anúncios salvos pela extensão."
        can={[
          "Cadastrar vários provedores de IA, escolher o modelo de cada um e definir qual está ativo.",
          "Testar a IA ativa com um anúncio de exemplo.",
          "Baixar seus anúncios em planilha (CSV) ou arquivo JSON.",
          "Apagar todos os anúncios salvos (zona de perigo, sem volta).",
          "Em \"Avançado\": restaurar um backup e ver os dados brutos.",
        ]}
        read="As chaves de API ficam só neste navegador e são enviadas apenas ao provedor escolhido. O tempo máximo de espera é quanto aguardar a resposta da IA antes de desistir."
      />

      <AiProviders />

      <Card title="Exportar">
        <div className="flex flex-wrap gap-2">
          <Button size="md" onClick={() => exportRowsCsv(rows)}>
            <Download className="h-3 w-3" />
            Planilha CSV ({rows.length})
          </Button>
          <Button size="md" onClick={() => exportRowsJson(rows)}>
            <Download className="h-3 w-3" />
            JSON (linhas)
          </Button>
        </div>
      </Card>

      <Card title="Zona de perigo">
        <Button size="md" variant="danger" onClick={clear} disabled={clearing}>
          <Trash2 className="h-3 w-3" />
          Apagar todos os anúncios salvos
        </Button>
      </Card>

      {msg && (
        <Card title="Aviso">
          <p className="text-xs text-danger">{msg}</p>
        </Card>
      )}

      {/* Avançado: backup/restauração e dados brutos — não é pro uso do dia a dia */}
      <details className="border border-border bg-surface">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">Avançado</summary>
        <div className="flex flex-col gap-4 border-t border-border p-3">
          <Card title="Restaurar backup">
            <p className="mb-2 text-xs text-subtle">
              Traz os anúncios de um arquivo de backup exportado antes (botão "Baixar backup completo"). Junta com o que
              já existe — não apaga nada.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
            <Button size="md" onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload className="h-3 w-3" />
              {importing ? "Importando…" : "Selecionar arquivo"}
            </Button>
          </Card>

          <Card title="Backup completo">
            <p className="mb-2 text-xs text-subtle">Arquivo com todos os anúncios salvos, do jeito que a extensão guarda.</p>
            <Button size="md" onClick={() => exportDbJson(db)}>
              <Download className="h-3 w-3" />
              Baixar backup completo
            </Button>
          </Card>

          <Card title={`Dados brutos (${Object.keys(db).length} anúncios)`}>
            {error ? (
              <ErrorBox message={error} onRetry={refetch} />
            ) : (
              <pre
                tabIndex={0}
                aria-label="Dados brutos dos anúncios salvos"
                className="max-h-[520px] overflow-auto border border-border bg-bg p-3 text-xs tnum focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {JSON.stringify(db, null, 2)}
              </pre>
            )}
          </Card>
        </div>
      </details>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface">
      <p className="border-b border-border px-3 py-2 text-sm font-semibold">{title}</p>
      <div className="p-3">{children}</div>
    </section>
  );
}
