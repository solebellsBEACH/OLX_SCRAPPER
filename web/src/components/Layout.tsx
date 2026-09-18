import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Table2, GitCompareArrows, Settings } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOnboarding } from "@/lib/useOnboarding";
import { ProxyStatus } from "./ProxyStatus";
import { Breadcrumb, BreadcrumbProvider } from "./common/Breadcrumb";
import { HelpButton } from "./common/HelpButton";
import { Onboarding } from "./common/Onboarding";
import { AiMissingBanner } from "./AiMissingBanner";
import { ThemeToggle } from "./ThemeToggle";
import { LearningToggle } from "./learning/Learn";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/listagem", label: "Listagem", icon: Table2, end: false },
  { to: "/comparador", label: "Comparador", icon: GitCompareArrows, end: false },
  { to: "/db", label: "Config", icon: Settings, end: false },
];

export function Layout() {
  const { pathname } = useLocation();
  const onboarding = useOnboarding();
  return (
    <div className="grid min-h-screen md:grid-cols-[184px_1fr]">
      <aside className="animate-slide-in-left flex flex-col gap-2 border-b border-border bg-surface px-3 py-2 md:sticky md:top-0 md:h-screen md:gap-6 md:overflow-y-auto md:border-b-0 md:border-r md:py-4">
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
        <div className="flex flex-col gap-2 md:mt-auto">
          <LearningToggle />
          <ThemeToggle />
          <ProxyStatus className="hidden md:flex" />
        </div>
      </aside>

      <main className="min-w-0 px-4 py-4 md:px-8 md:py-6">
        <AiMissingBanner />
        <BreadcrumbProvider>
          {(suffix) => (
            <>
              <Breadcrumb suffix={suffix} />
              <div key={pathname} className="animate-fade-in">
                <Outlet />
              </div>
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
