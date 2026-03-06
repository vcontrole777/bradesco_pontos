import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Globe, ShieldCheck, GitBranch, LogOut, Eye, EyeOff, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadNotification } from "@/hooks/useLeadNotification";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string;

const NAV_ITEMS = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Acessos", path: "/admin/acessos", icon: Globe },
  { label: "Controle", path: "/admin/controle", icon: ShieldCheck },
  { label: "Fluxo", path: "/admin/fluxo", icon: GitBranch },
];

type Status = "loading" | "authenticated" | "unauthenticated";

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password,
      });

      if (signInError || !data.user) {
        setError("Senha incorreta.");
        setLoading(false);
        return;
      }

      // Verify admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .single();

      if (roleData?.role !== "admin") {
        await supabase.auth.signOut();
        setError("Acesso negado.");
        setLoading(false);
        return;
      }

      onLogin();
    } catch {
      setError("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Sistema Ops</p>
          <h1 className="font-mono font-bold text-lg text-foreground tracking-wide mt-1">OPS PANEL</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="••••••••"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useLeadNotification();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setStatus("unauthenticated"); return; }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      setStatus(data?.role === "admin" ? "authenticated" : "unauthenticated");
    });
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setStatus("unauthenticated");
  }

  if (status === "loading") {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground font-mono">Carregando...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginScreen onLogin={() => setStatus("authenticated")} />;
  }

  return (
    <div className="dark flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-card border-r border-border flex-col shrink-0">
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
        <div className="border-t border-border p-2">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-2">
            <p className="font-mono font-bold text-sm text-foreground tracking-wide">OPS</p>
          </div>
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="border-t border-border bg-card pb-2">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sair
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto pt-16 md:pt-6">
        <Outlet />
      </main>
    </div>
  );
}
