import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLearning } from "@/lib/learning";

/** Nota explicativa avulsa; só aparece com o modo aprendizado ligado. */
export function LearnNote({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  const { enabled } = useLearning();
  if (!enabled) return null;
  return (
    <aside
      aria-label="Modo aprendizado"
      className={cn("flex animate-slide-down items-start gap-2 border border-accent/40 bg-accent-weak p-3 text-sm text-fg", className)}
    >
      <GraduationCap aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="font-semibold text-accent">{title}</p>}
        <div className="flex flex-col gap-1 text-muted [&_strong]:font-semibold [&_strong]:text-fg">{children}</div>
      </div>
    </aside>
  );
}

/** Explicação de uma tela inteira: o que ela é, o que dá pra fazer nela e como ler os números. */
export function LearnPage({ title, what, can, read }: { title: string; what: ReactNode; can: ReactNode[]; read?: ReactNode }) {
  return (
    <LearnNote title={`Modo aprendizado — ${title}`}>
      <p>{what}</p>
      <p className="mt-1 font-semibold text-fg">O que você pode fazer aqui</p>
      <ul className="list-disc pl-4">
        {can.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      {read && (
        <>
          <p className="mt-1 font-semibold text-fg">Como ler</p>
          <p>{read}</p>
        </>
      )}
    </LearnNote>
  );
}

/** Interruptor no menu lateral. */
export function LearningToggle({ className }: { className?: string }) {
  const { enabled, toggle } = useLearning();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      title="Mostra explicações em cada tela sobre o que cada dado significa e o que dá pra fazer"
      className={cn(
        "flex h-[44px] shrink-0 items-center gap-2 rounded-sm px-3 text-sm transition-colors duration-DEFAULT md:h-auto md:px-2 md:py-1",
        enabled ? "bg-accent-weak font-semibold text-accent" : "text-muted hover:bg-bg hover:text-fg",
        className,
      )}
    >
      <GraduationCap aria-hidden className="h-4 w-4" />
      Modo aprendizado
      <span className="ml-auto rounded-sm border border-current px-1 text-[10px] uppercase">{enabled ? "on" : "off"}</span>
    </button>
  );
}
