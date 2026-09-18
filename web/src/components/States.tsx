import type { ReactNode } from "react";
import { Loader2, Inbox, PlugZap } from "lucide-react";
import { Button } from "./ui/button";

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function Empty({
  title = "Nenhum anúncio no DB ainda",
  hint,
}: {
  title?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 border border-border bg-surface p-12 text-center">
      <Inbox className="h-6 w-6 text-subtle" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-[420px] text-sm text-muted">
        {hint ?? "Colete anúncios pela extensão e analise os selecionados para preencher o db.json."}
      </p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-danger-border bg-danger-bg p-12 text-center">
      <PlugZap className="h-6 w-6 text-danger" />
      <p className="text-sm font-semibold text-danger">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
