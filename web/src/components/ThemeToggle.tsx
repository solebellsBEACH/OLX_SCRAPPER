import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePref } from "@/lib/theme";

const INFO: Record<ThemePref, { label: string; icon: typeof Sun }> = {
  system: { label: "Tema: sistema", icon: Monitor },
  light: { label: "Tema: claro", icon: Sun },
  dark: { label: "Tema: escuro", icon: Moon },
};

/** Alterna Sistema → Claro → Escuro a cada clique. */
export function ThemeToggle({ className }: { className?: string }) {
  const { pref, cycle } = useTheme();
  const { label, icon: Icon } = INFO[pref];
  return (
    <button
      type="button"
      onClick={cycle}
      title="Clique para alternar entre sistema, claro e escuro"
      className={cn(
        "flex h-[44px] shrink-0 items-center gap-2 rounded-sm px-3 text-sm text-muted transition-colors duration-DEFAULT hover:bg-bg hover:text-fg md:h-auto md:px-2 md:py-1",
        className,
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
      {label}
    </button>
  );
}
