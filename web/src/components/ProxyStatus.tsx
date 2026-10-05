import { cn } from "@/lib/cn";
import { useAiStatus } from "@/lib/useDb";

// Ponto colorido + texto. Sem card (regra do dashboard).
export function ProxyStatus({ className }: { className?: string }) {
  const { state, detail } = useAiStatus();

  const map = {
    checking: { dot: "bg-subtle", text: "Verificando IA…" },
    ready: { dot: "bg-ok", text: "IA configurada" },
    nokey: { dot: "bg-warn", text: "Nenhuma IA configurada" },
  }[state];

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)} title={detail}>
      <span className={cn("h-2 w-2 rounded-full", map.dot)} />
      <span className={state === "nokey" ? "text-warn" : "text-muted"}>{map.text}</span>
    </div>
  );
}
