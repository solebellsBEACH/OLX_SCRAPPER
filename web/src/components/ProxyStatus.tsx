import { cn } from "@/lib/cn";
import { useProxyHealth } from "@/lib/useDb";

// Ponto colorido + texto. Sem card (regra do dashboard).
export function ProxyStatus({ className }: { className?: string }) {
  const { state, detail } = useProxyHealth();

  const map = {
    checking: { dot: "bg-subtle", text: "Verificando proxy…" },
    online: { dot: "bg-ok", text: "Proxy online" },
    nokey: { dot: "bg-warn", text: "Proxy online, sem chave DeepSeek" },
    offline: { dot: "bg-danger", text: "Proxy offline em http://localhost:8787" },
  }[state];

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)} title={detail}>
      <span className={cn("h-2 w-2 rounded-full", map.dot)} />
      <span className={state === "offline" ? "text-danger" : "text-muted"}>{map.text}</span>
    </div>
  );
}
