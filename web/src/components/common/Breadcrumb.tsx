import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface Crumb {
  label: string;
  to?: string;
}

const HOME: Crumb = { label: "Dashboard", to: "/" };
const LIST: Crumb = { label: "Listagem", to: "/listagem" };

function crumbsFor(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Dashboard" }];
  if (pathname.startsWith("/listagem")) return [HOME, { label: "Listagem" }];
  if (pathname.startsWith("/anuncio")) return [HOME, LIST, { label: "Anúncio" }];
  if (pathname.startsWith("/comparador")) return [HOME, LIST, { label: "Comparador" }];
  if (pathname.startsWith("/ia")) return [HOME, { label: "IA" }];
  if (pathname.startsWith("/db")) return [HOME, { label: "DB / Config" }];
  return [HOME];
}

// Sufixo opcional ("Filtrado (730 resultados)") que a página atual injeta no fim da trilha.
const SuffixCtx = createContext<(s: string | null) => void>(() => {});

export function BreadcrumbProvider({ children }: { children: (suffix: string | null) => ReactNode }) {
  const [suffix, setSuffix] = useState<string | null>(null);
  return <SuffixCtx.Provider value={setSuffix}>{children(suffix)}</SuffixCtx.Provider>;
}

/** Chame numa página para acrescentar um último nível à trilha; limpa ao desmontar. */
export function useBreadcrumbSuffix(suffix: string | null) {
  const set = useContext(SuffixCtx);
  useEffect(() => {
    set(suffix);
    return () => set(null);
  }, [set, suffix]);
}

export function Breadcrumb({ suffix }: { suffix: string | null }) {
  const { pathname } = useLocation();
  const base = crumbsFor(pathname);
  // Com sufixo, o último item da rota vira link (clicar volta ao estado sem filtro).
  const items: Crumb[] = suffix
    ? [...base.slice(0, -1), { ...base[base.length - 1], to: pathname }, { label: suffix }]
    : base;

  return (
    <nav aria-label="Você está aqui" className="mb-4 text-xs text-subtle">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li
              key={`${c.label}${i}`}
              // Mobile: só os dois últimos níveis.
              className={cn("items-center gap-1", i < items.length - 2 ? "hidden sm:inline-flex" : "inline-flex")}
            >
              {last || !c.to ? (
                <span aria-current={last ? "page" : undefined} className={cn(last && "font-semibold text-muted")}>
                  {c.label}
                </span>
              ) : (
                <Link to={c.to} className="hover:text-fg hover:underline">
                  {c.label}
                </Link>
              )}
              {!last && <ChevronRight aria-hidden className="h-3 w-3" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
