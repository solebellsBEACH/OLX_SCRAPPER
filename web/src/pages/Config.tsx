import { useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useDb } from "@/lib/useDb";
import { exportDbJson, exportRowsCsv, exportRowsJson } from "@/lib/exporters";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ErrorBox, Loading } from "@/components/States";

export function Config() {
  const { db, rows, status, error, refetch } = useDb();
  const [msg, setMsg] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function clear() {
    if (!confirm("Zerar a base inteira? Não dá pra desfazer.")) return;
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
      <PageHeader title="DB / Config" />

      <Card title="Importar db.json">
        <p className="mb-2 text-xs text-subtle">
          Traz os registros de um db.json exportado (ex.: da versão anterior com proxy local) pra dentro da extensão. Faz
          merge por id — não apaga o que já existe.
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
