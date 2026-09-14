import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Table2, GitCompareArrows, Database, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProxyStatus } from "./ProxyStatus";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/listagem", label: "Listagem", icon: Table2, end: false },
  { to: "/comparador", label: "Comparador", icon: GitCompareArrows, end: false },
  { to: "/ia", label: "IA", icon: BrainCircuit, end: false },
  { to: "/db", label: "DB / Config", icon: Database, end: false },
];

export function Layout() {
  return (
    <div className="grid min-h-screen grid-cols-[184px_1fr]">
      <aside className="flex flex-col gap-6 border-r border-border bg-surface px-3 py-4">
        <div>
          <p className="text-sm font-semibold">OLX Workspace</p>
          <p className="text-xs text-muted">Painel de análise</p>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors duration-DEFAULT",
                  isActive ? "bg-accent-weak font-semibold text-accent" : "text-muted hover:bg-bg hover:text-fg",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <ProxyStatus className="mt-auto" />
      </aside>

      <main className="min-w-0 px-8 py-6">
        <Outlet />
      </main>
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
