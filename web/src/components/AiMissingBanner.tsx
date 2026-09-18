import { Link, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useAiStatus } from "@/lib/useDb";

/** Aviso global: o sistema só funciona com IA. Some na própria página de Config, que já tem o aviso. */
export function AiMissingBanner() {
  const { state } = useAiStatus();
  const { pathname } = useLocation();
  if (state !== "nokey" || pathname.startsWith("/db")) return null;
  return (
    <div role="alert" className="mb-4 flex animate-slide-down flex-wrap items-center gap-2 border border-warn bg-warn/10 p-3 text-sm text-warn">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="flex-1">
        <strong>Nenhuma IA configurada.</strong> A análise dos anúncios só funciona com IA.
      </p>
      <Link to="/db" className="font-semibold underline">
        Configurar agora
      </Link>
    </div>
  );
}
