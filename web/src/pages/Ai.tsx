import { useEffect, useState } from "react";
import { Save, Zap } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox, Loading } from "@/components/States";
import type { AiConfig, AiProviderId } from "@/types";

const PROVIDER_ORDER: AiProviderId[] = ["deepseek", "openai"];

export function Ai() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  /** Aba selecionada no formulário — não precisa ser a mesma que está ativa no proxy. */
  const [tab, setTab] = useState<AiProviderId>("deepseek");
  const [switching, setSwitching] = useState(false);

  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [test, setTest] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  function load() {
    setStatus("loading");
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        setTab(c.provider);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : String(err));
        setStatus("error");
      });
  }

  useEffect(load, []);

  // Ao trocar de aba, preenche o formulário com a config salva desse provedor.
  useEffect(() => {
    if (!config) return;
    const c = config.providers[tab];
    setApiUrl(c.apiUrl);
    setModel(c.model);
    setTimeoutMs(String(c.timeoutMs));
    setApiKey("");
    setSaveMsg(null);
  }, [tab, config]);

  async function makeActive(id: AiProviderId) {
    if (!config || id === config.provider) {
      setTab(id);
      return;
    }
    setSwitching(true);
    try {
      const c = await api.setActiveProvider(id);
      setConfig(c);
      setTab(id);
      setTest(null);
    } catch (err) {
      setSaveMsg(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSwitching(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const c = await api.updateProviderConfig(tab, {
        apiUrl,
        model,
        timeoutMs: Number(timeoutMs) || undefined,
        apiKey: apiKey || undefined,
      });
      setConfig(c);
      setApiKey("");
      setSaveMsg("Salvo em proxy/.env.");
    } catch (err) {
      setSaveMsg(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  /** Sempre testa o provedor ATIVO no proxy (a aba pode estar só em preview). */
  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const h = await api.health();
      if (!h.hasKey) {
        setTest(`Proxy online, mas o provedor ativo (${h.provider ?? "?"}) não tem chave configurada.`);
        return;
      }
      const res = await api.analyze([
        { index: 0, title: "Honda Civic EXL 2.0 2018", details: ["Câmbio: Automático"] },
      ]);
      setTest(
        res.categorias
          ? `OK — ${h.provider ?? ""} · ${h.model}. Retorno: ${JSON.stringify(res.categorias[0])}`
          : `Sem categorias. raw: ${res.raw ?? "—"}`,
      );
    } catch (err) {
      setTest(err instanceof ApiError ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  if (status === "loading") return <Loading />;
  if (status === "error" || !config) return <ErrorBox message={error ?? "Falha ao carregar"} onRetry={load} />;

  const current = config.providers[tab];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="IA" />

      <Card title="Provedor">
        <div className="flex flex-wrap gap-2">
          {PROVIDER_ORDER.map((id) => {
            const p = config.providers[id];
            const isActive = config.provider === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => makeActive(id)}
                disabled={switching}
                className={cn(
                  "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors duration-DEFAULT disabled:opacity-50",
                  tab === id ? "border-accent bg-accent-weak font-semibold text-accent" : "border-border bg-surface text-fg hover:bg-bg",
                )}
              >
                {p.label}
                {isActive && (
                  <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-fg">
                    ativo
                  </span>
                )}
                {!p.hasKey && <span className="text-[10px] text-danger">sem chave</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-subtle">
          Clique num provedor pra torná-lo o ativo (é o que "Testar IA" e as análises da extensão usam).
          Abaixo você edita a configuração de cada um, mesmo sem trocar o ativo.
        </p>
      </Card>

      <Card title={`Configuração — ${current.label}`}>
        <div className="flex flex-col gap-3">
          <Field label="URL da API">
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.exemplo.com/chat/completions" />
          </Field>
          <Field label="Modelo">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="modelo" />
          </Field>
          <Field label="Timeout (ms)">
            <Input
              type="number"
              min={10_000}
              max={300_000}
              step={1000}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
            />
          </Field>
          <Field label={`Chave da API${current.hasKey ? ` (atual: ${current.keyPreview})` : ""}`}>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={current.hasKey ? "deixe em branco para manter a atual" : "sk-..."}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button size="md" onClick={save} disabled={saving}>
              <Save className="h-3 w-3" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            {saveMsg && <p className="text-xs text-subtle">{saveMsg}</p>}
          </div>
        </div>
        <p className="mt-3 text-xs text-subtle">
          Gravado em <code>proxy/.env</code>. Não é preciso reiniciar o proxy — o valor é aplicado na hora.
        </p>
      </Card>

      <Card title="Testar">
        <Button size="md" onClick={runTest} disabled={testing}>
          <Zap className={`h-3 w-3 ${testing ? "animate-pulse" : ""}`} />
          {testing ? "Analisando..." : `Testar IA (${config.providers[config.provider].label})`}
        </Button>
        {testing && <p role="status" className="mt-3 text-sm text-muted">Aguardando a IA. Isso pode levar alguns minutos.</p>}
        {test && (
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border border-border bg-bg p-3 text-xs">
            {test}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
