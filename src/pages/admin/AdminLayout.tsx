import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Globe, ShieldCheck, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadNotification } from "@/hooks/useLeadNotification";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Acessos", path: "/admin/acessos", icon: Globe },
  { label: "Controle", path: "/admin/controle", icon: ShieldCheck },
  { label: "Fluxo", path: "/admin/fluxo", icon: GitBranch },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  useLeadNotification();

  return (
    <div className="dark flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 bg-card border-r border-border flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-border">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Sistema Ops</p>
          <h2 className="font-mono font-bold text-sm text-foreground tracking-wide mt-0.5">OPS PANEL</h2>
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
