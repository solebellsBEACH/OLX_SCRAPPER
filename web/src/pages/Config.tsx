import { useState } from "react";
import { Download, RotateCcw, Trash2 } from "lucide-react";
import { api, ApiError, getProxyUrl, setProxyUrl } from "@/lib/api";
import { useDb } from "@/lib/useDb";
import { exportDbJson, exportRowsCsv, exportRowsJson } from "@/lib/exporters";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox, Loading } from "@/components/States";

export function Config() {
  const { db, rows, status, error, refetch } = useDb();
  const [url, setUrl] = useState(getProxyUrl());
  const [msg, setMsg] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  async function clear() {
    if (!confirm("Zerar o db.json inteiro? Não dá pra desfazer.")) return;
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

  if (status === "loading") return <Loading />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="DB / Config" />

      <Card title="Endpoint do proxy">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8787"
            className="w-[280px]"
          />
          <Button
            size="md"
            onClick={() => {
              setProxyUrl(url);
              refetch();
            }}
          >
            Salvar
          </Button>
          <Button
            size="md"
            variant="ghost"
            onClick={() => {
              setProxyUrl("");
              setUrl("http://localhost:8787");
              refetch();
            }}
          >
            <RotateCcw className="h-3 w-3" />
            Padrão
          </Button>
        </div>
        <p className="mt-2 text-xs text-subtle">Guardado em localStorage (olx.proxyUrl).</p>
      </Card>

      {msg && (
        <Card title="Aviso">
          <p className="text-xs text-danger">{msg}</p>
        </Card>
      )}

      <Card title="Exportar">
        <div className="flex flex-wrap gap-2">
          <Button size="md" onClick={() => exportRowsCsv(rows)}>
            <Download className="h-3 w-3" />
            CSV ({rows.length})
          </Button>
          <Button size="md" onClick={() => exportRowsJson(rows)}>
            <Download className="h-3 w-3" />
            JSON (linhas)
          </Button>
          <Button size="md" onClick={() => exportDbJson(db)}>
            <Download className="h-3 w-3" />
            db.json cru
          </Button>
        </div>
      </Card>

      <Card title="Zona de perigo">
        <Button size="md" variant="danger" onClick={clear} disabled={clearing}>
          <Trash2 className="h-3 w-3" />
          Limpar DB
        </Button>
      </Card>

      <Card title={`JSON cru (${Object.keys(db).length} registros)`}>
        {error ? (
          <ErrorBox message={error} onRetry={refetch} />
        ) : (
          <pre className="max-h-[520px] overflow-auto border border-border bg-bg p-3 text-xs tnum">
            {JSON.stringify(db, null, 2)}
          </pre>
        )}
      </Card>
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
