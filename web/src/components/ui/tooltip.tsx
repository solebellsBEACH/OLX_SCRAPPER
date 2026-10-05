import { useId, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Balão preto/branco que aparece no hover e no foco do teclado e some ao sair.
 * pointer-events-none: nunca captura o mouse nem bloqueia o conteúdo por baixo.
 * Texto curto (≤ 60 caracteres). Posição fixa (top/bottom), centralizada no gatilho.
 */
export function Tooltip({
  text,
  side = "top",
  children,
  className,
}: {
  text: string;
  side?: "top" | "bottom";
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("group relative inline-flex", className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-30 w-max max-w-[220px] -translate-x-1/2 rounded-sm bg-tip-bg px-2 py-1 text-xs font-normal text-tip-fg opacity-0 transition-opacity duration-DEFAULT",
          "group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-full mb-1" : "top-full mt-1",
        )}
      >
        {text}
      </span>
    </span>
  );
}

/** Ícone "?" cinza discreto + tooltip. */
export function HelpTip({ text, side = "bottom" }: { text: string; side?: "top" | "bottom" }) {
  return (
    <Tooltip text={text} side={side}>
      {/* <button> (e não <span>) pra o aria-label ter um papel que o leitor de tela anuncie;
          stopPropagation: não abre/fecha a linha da tabela ao tocar no "?" */}
      <button
        type="button"
        aria-label={text}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-help rounded-full text-subtle hover:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <HelpCircle aria-hidden className="h-3 w-3" />
      </button>
    </Tooltip>
  );
}

export const HELP = {
  preco: "Preço vs. similares: verde = bom negócio, laranja = caro",
  status: "Avaliação do preço: verde bom, amarelo normal, laranja caro",
  alertas: "Problemas detectados no anúncio (ex.: preço muito alto)",
  mercado: "Quanto se esperaria pagar por um carro assim",
  local: "Cidade onde o carro está anunciado",
} as const;
