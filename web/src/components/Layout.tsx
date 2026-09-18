import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Table2, GitCompareArrows, Database, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOnboarding } from "@/lib/useOnboarding";
import { ProxyStatus } from "./ProxyStatus";
import { Breadcrumb, BreadcrumbProvider } from "./common/Breadcrumb";
import { HelpButton } from "./common/HelpButton";
import { Onboarding } from "./common/Onboarding";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/listagem", label: "Listagem", icon: Table2, end: false },
  { to: "/comparador", label: "Comparador", icon: GitCompareArrows, end: false },
  { to: "/ia", label: "IA", icon: BrainCircuit, end: false },
  { to: "/db", label: "DB / Config", icon: Database, end: false },
];

export function Layout() {
  const onboarding = useOnboarding();
  return (
    <div className="grid min-h-screen md:grid-cols-[184px_1fr]">
      <aside className="flex flex-col gap-2 border-b border-border bg-surface px-3 py-2 md:gap-6 md:border-b-0 md:border-r md:py-4">
        <div className="hidden md:block">
          <p className="text-sm font-semibold">OLX Workspace</p>
          <p className="text-xs text-muted">Painel de análise</p>
        </div>
        {/* < md: barra horizontal rolável; ≥ md: coluna lateral */}
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex h-[44px] shrink-0 items-center gap-2 rounded-sm px-3 text-sm transition-colors duration-DEFAULT md:h-auto md:px-2 md:py-1",
                  isActive ? "bg-accent-weak font-semibold text-accent" : "text-muted hover:bg-bg hover:text-fg",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <ProxyStatus className="hidden md:mt-auto md:flex" />
      </aside>

      <main className="min-w-0 px-4 py-4 md:px-8 md:py-6">
        <BreadcrumbProvider>
          {(suffix) => (
            <>
              <Breadcrumb suffix={suffix} />
              <Outlet />
            </>
          )}
        </BreadcrumbProvider>
      </main>

      {onboarding.open && <Onboarding onClose={onboarding.close} />}
      <HelpButton onTour={onboarding.start} />
    </div>
  );
}

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
