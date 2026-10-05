import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Plus, Save, Trash2, Zap } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorBox, Loading } from "@/components/States";
import type { AiConfig, AiPreset, AiProvider } from "@/types";

/** Valor do select de modelo que troca pra digitação livre. */
const OTHER_MODEL = "__other__";
const CUSTOM_PRESET_ID = "custom";
const DEFAULT_TIMEOUT_MS = 180_000;

interface FormState {
  /** undefined = novo provedor. */
  id?: string;
  presetId: string;
  label: string;
  apiUrl: string;
  /** Id escolhido no select, ou OTHER_MODEL. */
  modelChoice: string;
  customModel: string;
  /** em segundos no formulário; o provedor guarda em ms (timeoutMs). */
  timeoutSec: string;
  apiKey: string;
}

function newForm(preset: AiPreset): FormState {
  return {
    presetId: preset.id,
    label: "",
    apiUrl: preset.apiUrl,
    modelChoice: preset.models[0]?.id ?? OTHER_MODEL,
    customModel: "",
    timeoutSec: String(DEFAULT_TIMEOUT_MS / 1000),
    apiKey: "",
  };
}

function editForm(p: AiProvider, preset: AiPreset): FormState {
  const known = preset.models.some((m) => m.id === p.model);
  return {
    id: p.id,
    presetId: p.presetId,
    label: p.label,
    apiUrl: p.apiUrl,
    modelChoice: known ? p.model : OTHER_MODEL,
    customModel: known ? "" : p.model,
    timeoutSec: String(Math.round(p.timeoutMs / 1000)),
    apiKey: "",
  };
}

const errMsg = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

/** Pede acesso ao domínio da API quando ele não é um dos provedores do catálogo (endpoint próprio). */
async function ensureHostAccess(apiUrl: string): Promise<boolean> {
  try {
    const origins = [`${new URL(apiUrl).origin}/*`];
    if (await chrome.permissions.contains({ origins })) return true;
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

export function AiProviders() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  function load() {
    setStatus("loading");
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        setStatus("ready");
        // Sem nenhum provedor: já abre o formulário pra cadastrar o primeiro.
        if (c.providers.length === 0 && c.presets[0]) setForm((f) => f ?? newForm(c.presets[0]));
      })
      .catch((err) => {
        setError(errMsg(err));
        setStatus("error");
      });
  }

  useEffect(load, []);

  if (status === "loading") return <Loading />;
  if (status === "error" || !config) return <ErrorBox message={error ?? "Falha ao carregar"} onRetry={load} />;

  const presetOf = (id: string) => config.presets.find((p) => p.id === id) ?? config.presets[config.presets.length - 1];
  const active = config.providers.find((p) => p.id === config.activeId) ?? null;
  const activeReady = Boolean(active && (active.hasKey || active.presetId === CUSTOM_PRESET_ID));

  async function run(fn: () => Promise<AiConfig>, okMsg?: string) {
    setMsg(null);
    try {
      setConfig(await fn());
      if (okMsg) setMsg(okMsg);
      return true;
    } catch (err) {
      setMsg(errMsg(err));
      return false;
    }
  }

  async function save() {
    if (!form) return;
    const preset = presetOf(form.presetId);
    const model = (form.modelChoice === OTHER_MODEL ? form.customModel : form.modelChoice).trim();
    if (!model) {
      setMsg("Escolha ou informe o modelo.");
      return;
    }
    setSaving(true);
    // Primeiro await do clique: o pedido de permissão precisa do gesto do usuário.
    if (!(await ensureHostAccess(form.apiUrl))) {
      setMsg("Sem permissão pra acessar esse endereço. Aceite o pedido do navegador para continuar.");
      setSaving(false);
      return;
    }
    const ok = await run(
      () =>
        api.saveProvider({
          id: form.id,
          presetId: form.presetId,
          label: form.label || preset.label,
          apiUrl: form.apiUrl,
          model,
          timeoutMs: Number(form.timeoutSec) ? Number(form.timeoutSec) * 1000 : undefined,
          apiKey: form.apiKey || undefined,
        }),
      "Salvo.",
    );
    if (ok) setForm(null);
    setSaving(false);
  }

  async function remove(p: AiProvider) {
    if (!confirm(`Remover "${p.label}"? A chave salva será apagada.`)) return;
    await run(() => api.removeProvider(p.id));
    if (form?.id === p.id) setForm(null);
  }

  /** Sempre testa o provedor ATIVO. */
  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await api.analyze([{ index: 0, title: "Honda Civic EXL 2.0 2018", details: ["Câmbio: Automático"] }]);
      setTest(
        res.categorias
          ? `OK — ${active?.label} · ${active?.model}. Retorno: ${JSON.stringify(res.categorias[0])}`
          : `Sem categorias. raw: ${res.raw ?? "—"}`,
      );
    } catch (err) {
      setTest(errMsg(err));
    } finally {
      setTesting(false);
    }
  }

  const preset = form ? presetOf(form.presetId) : null;
  const isCustom = preset?.id === CUSTOM_PRESET_ID;
  const editing = Boolean(form?.id);
  const editingProvider = editing ? config.providers.find((p) => p.id === form?.id) : undefined;

  return (
    <div className="flex flex-col gap-6" id="ia">
      {!activeReady && (
        <div role="alert" className="flex items-start gap-2 border border-warn bg-warn/10 p-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Nenhuma IA configurada.</strong> O sistema só funciona com IA: cadastre um provedor abaixo, informe a
            chave da API e escolha o modelo.
          </p>
        </div>
      )}

      <Card title="Provedores de IA">
        {config.providers.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {config.providers.map((p) => {
              const isActive = p.id === config.activeId;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 border border-border bg-bg p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.label}
                      {isActive && (
                        <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-fg">
                          ativo
                        </span>
                      )}
                      {!p.hasKey && p.presetId !== CUSTOM_PRESET_ID && <span className="text-[10px] font-normal text-danger">sem chave</span>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {p.model}
                      {p.keyPreview ? ` · chave ${p.keyPreview}` : ""}
                    </p>
                  </div>
                  {!isActive && (
                    <Button size="md" onClick={() => run(() => api.setActiveProvider(p.id))}>
                      Usar
                    </Button>
                  )}
                  <Button size="md" onClick={() => setForm(editForm(p, presetOf(p.presetId)))}>
                    Editar
                  </Button>
                  <Button size="md" variant="danger" onClick={() => remove(p)} aria-label={`Remover ${p.label}`}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-subtle">Nenhum provedor cadastrado ainda.</p>
        )}
        {!form && (
          <div className="mt-3">
            <Button size="md" onClick={() => setForm(newForm(config.presets[0]))}>
              <Plus className="h-3 w-3" />
              Adicionar provedor
            </Button>
          </div>
        )}
        {msg && !form && <p className="mt-2 text-xs text-subtle">{msg}</p>}
      </Card>

      {form && preset && (
        <Card title={editing ? `Editar — ${editingProvider?.label ?? preset.label}` : "Adicionar provedor"}>
          <div className="flex flex-col gap-3">
            <Field label="Provedor">
              <Select
                value={form.presetId}
                disabled={editing}
                onChange={(e) => setForm(newForm(presetOf(e.target.value)))}
              >
                {config.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Nome (opcional)">
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={preset.label} />
            </Field>

            <Field label="URL da API">
              <Input
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                placeholder="https://servidor/v1/chat/completions"
              />
            </Field>

            <Field label="Modelo">
              <Select value={form.modelChoice} onChange={(e) => setForm({ ...form, modelChoice: e.target.value })}>
                {preset.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value={OTHER_MODEL}>{isCustom ? "Digitar o nome do modelo…" : "Outro modelo (digitar)…"}</option>
              </Select>
              {form.modelChoice === OTHER_MODEL && (
                <Input
                  value={form.customModel}
                  onChange={(e) => setForm({ ...form, customModel: e.target.value })}
                  placeholder="id exato do modelo, ex.: llama3.1"
                />
              )}
            </Field>

            <Field label={`Chave da API${editingProvider?.hasKey ? ` (atual: ${editingProvider.keyPreview})` : ""}`}>
              <Input
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={editingProvider?.hasKey ? "deixe em branco para manter a atual" : preset.keyPlaceholder}
              />
              {preset.keyUrl && (
                <a
                  href={preset.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  Gerar chave <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </Field>

            <Field label="Tempo máximo de espera (segundos)">
              <Input
                type="number"
                min={10}
                max={300}
                step={1}
                value={form.timeoutSec}
                onChange={(e) => setForm({ ...form, timeoutSec: e.target.value })}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="md" onClick={save} disabled={saving}>
                <Save className="h-3 w-3" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
              {config.providers.length > 0 && (
                <Button size="md" onClick={() => { setForm(null); setMsg(null); }}>
                  Cancelar
                </Button>
              )}
              {msg && <p className="text-xs text-danger">{msg}</p>}
            </div>
          </div>
          <p className="mt-3 text-xs text-subtle">
            Guardado só neste navegador e enviado somente ao provedor escolhido. Vale na hora.
          </p>
        </Card>
      )}

      {active && (
        <Card title="Testar">
          <Button size="md" onClick={runTest} disabled={testing || !activeReady}>
            <Zap className={`h-3 w-3 ${testing ? "animate-pulse" : ""}`} />
            {testing ? "Analisando..." : `Testar IA (${active.label})`}
          </Button>
          {testing && <p role="status" className="mt-3 text-sm text-muted">Aguardando a IA. Isso pode levar alguns minutos.</p>}
          {test && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border border-border bg-bg p-3 text-xs">{test}</pre>
          )}
        </Card>
      )}
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
