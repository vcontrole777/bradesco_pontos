import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, LogOut, Globe, ShieldCheck, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadNotification } from "@/hooks/useLeadNotification";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Acessos", path: "/admin/acessos", icon: Globe },
  { label: "Controle", path: "/admin/controle", icon: ShieldCheck },
  { label: "Fluxo", path: "/admin/fluxo", icon: GitBranch },
];

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? "";

export default function AdminLayout() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  // Hooks must be called before any conditional return
  useLeadNotification();

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") === "true") {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem("admin_auth", "true");
      setAuthenticated(true);
    } else {
      setError("Acesso negado");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_auth");
    setAuthenticated(false);
  };

  if (!authenticated) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
              // sistema restrito
            </p>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Painel Admin</h1>
          </div>
          <div className="space-y-2">
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="senha de acesso"
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
            {error && (
              <p className="font-mono text-xs text-destructive">✗ {error}</p>
            )}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Autenticar
          </button>
        </form>
      </div>
    );
  }




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
        <div className="p-2 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
