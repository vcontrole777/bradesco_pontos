import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionRepository, configRepository } from "@/repositories";
import type { SessionWithLeadCpf } from "@/repositories";
import {
  RefreshCw, Search, Trash2, ShieldBan, CheckSquare, Square,
  Wifi, WifiOff, Smartphone, Monitor, Globe,
} from "lucide-react";
import { toast } from "sonner";

// ── Security badges ─────────────────────────────────────────────────────────
function SecurityBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block rounded px-1 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider ${color}`}>
      {label}
    </span>
  );
}

function SecurityFlags({ s }: { s: SessionWithLeadCpf }) {
  const flags = [];
  if (s.is_vpn)     flags.push(<SecurityBadge key="vpn"     label="VPN"     color="bg-amber-500/20 text-amber-400 border border-amber-500/30" />);
  if (s.is_proxy)   flags.push(<SecurityBadge key="proxy"   label="Proxy"   color="bg-orange-500/20 text-orange-400 border border-orange-500/30" />);
  if (s.is_tor)     flags.push(<SecurityBadge key="tor"     label="Tor"     color="bg-red-500/20 text-red-400 border border-red-500/30" />);
  if (s.is_hosting) flags.push(<SecurityBadge key="hosting" label="Hosting" color="bg-blue-500/20 text-blue-400 border border-blue-500/30" />);
  if (flags.length === 0) return null;
  return <div className="flex flex-wrap gap-0.5 mt-0.5">{flags}</div>;
}

// ── Country flag emoji from ISO-3166 country code ──────────────────────────
function countryFlag(code?: string | null): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map((c) => 0x1f1e0 + c.charCodeAt(0) - 65),
  );
}

// ── Relative time ──────────────────────────────────────────────────────────
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h atrás`;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── Device label from user-agent + is_mobile field ────────────────────────
function formatDevice(s: SessionWithLeadCpf): string {
  if (s.is_mobile) return "Mobile";
  const ua = s.user_agent ?? "";
  if (ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone")) return "Mobile";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac"))     return "Mac";
  if (ua.includes("Linux"))   return "Linux";
  return "Outro";
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminAccessPage() {
  const [sessions, setSessions] = useState<SessionWithLeadCpf[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [blockedIps, setBlockedIps] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0); // re-render every minute to update relative times

  const fetchBlockedIps = async () => {
    try {
      const configs = await configRepository.getByKeys(["blocked_ips"]);
      const ips = (configs[0]?.config_value as string[] | null) ?? [];
      setBlockedIps(new Set(ips));
    } catch (e) {
      console.warn("Failed to fetch blocked IPs:", e);
    }
  };

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data, nextCursor: cursor } = await sessionRepository.findAllWithLeadCpf({ limit: 200 });
      setSessions(data);
      setNextCursor(cursor);
      setSelected(new Set());
    } catch (err) {
      console.error("Fetch sessions error:", err);
    }
    setLoading(false);
  };

  const fetchMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, nextCursor: cursor } = await sessionRepository.findAllWithLeadCpf({
        limit: 200,
        cursor: nextCursor,
      });
      setSessions((prev) => [...prev, ...data]);
      setNextCursor(cursor);
    } catch (err) {
      console.error("Fetch more sessions error:", err);
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    fetchSessions();
    fetchBlockedIps();

    // Realtime: refresh on any site_sessions change
    const channel = supabase
      .channel("admin-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, fetchSessions)
      .subscribe();

    // Re-render every 60 s so relative timestamps stay current
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.ip_address?.toLowerCase().includes(q)   ||
      s.city?.toLowerCase().includes(q)          ||
      s.region?.toLowerCase().includes(q)        ||
      s.country?.toLowerCase().includes(q)       ||
      s.page?.toLowerCase().includes(q)          ||
      s.lead_cpf?.toLowerCase().includes(q)      ||
      s.as_name?.toLowerCase().includes(q)       ||
      s.org?.toLowerCase().includes(q)           ||
      s.timezone?.toLowerCase().includes(q)
    );
  });

  // Online count from client-side state (updated via realtime above)
  const onlineCount  = sessions.filter((s) =>  s.is_online).length;
  const suspectCount = sessions.filter((s) => s.is_vpn || s.is_proxy || s.is_tor).length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Limpar TODOS os registros de acessos?")) return;
    await sessionRepository.deleteAll();
    toast.success("Acessos limpos");
    fetchSessions();
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Apagar ${selected.size} registro(s)?`)) return;
    await sessionRepository.bulkDelete(Array.from(selected));
    toast.success(`${selected.size} registro(s) apagado(s)`);
    fetchSessions();
  };

  const handleBlockIP = async (ip: string) => {
    if (!ip) return;
    if (!confirm(`Bloquear o IP ${ip}?`)) return;
    try {
      const appended = await configRepository.appendToList("blocked_ips", ip);
      if (!appended) {
        toast.info("IP já está bloqueado");
        return;
      }
      toast.success(`IP ${ip} bloqueado`);
      fetchBlockedIps();
    } catch (err) {
      console.error("Block IP error:", err);
      toast.error("Erro ao bloquear IP");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Acessos</h1>

          {/* Online badge */}
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-mono font-medium text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            {onlineCount} online
          </span>

          {/* Suspect badge — only shown when there are flagged sessions */}
          {suspectCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-mono font-medium text-amber-400">
              ⚠ {suspectCount} suspeito{suspectCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Apagar ({selected.size})
            </button>
          )}
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Limpar tudo
          </button>
          <button
            onClick={fetchSessions}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por IP, cidade, país, timezone, rede, página, CPF..."
          className="w-full rounded-lg border border-border bg-muted/30 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 text-center">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground transition-colors">
                    {selected.size === filtered.length && filtered.length > 0
                      ? <CheckSquare className="h-4 w-4" />
                      : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">IP / Segurança</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Localização</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Rede / ASN</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Página</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">CPF</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Dispositivo</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Início</th>
                <th className="px-4 py-3 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Carregando...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Nenhum acesso encontrado</td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const isSuspect = s.is_vpn || s.is_proxy || s.is_tor;
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-border last:border-0 transition-colors ${
                        selected.has(s.id) ? "bg-primary/5" :
                        isSuspect         ? "bg-amber-500/5 hover:bg-amber-500/10" :
                                            "hover:bg-muted/30"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => toggleSelect(s.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {selected.has(s.id)
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4" />}
                        </button>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {s.is_online ? (
                          <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
                            <span className="relative flex h-1.5 w-1.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                            </span>
                            Online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                            <WifiOff className="h-3 w-3 shrink-0" />
                            Offline
                          </span>
                        )}
                        {blockedIps.has(s.ip_address ?? "") && (
                          <span className="flex items-center gap-1 mt-1 text-[9px] font-mono font-bold uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1 py-0.5 w-fit">
                            <ShieldBan className="h-2.5 w-2.5 shrink-0" />
                            Bloqueado
                          </span>
                        )}
                      </td>

                      {/* IP + security flags */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground">{s.ip_address || "—"}</span>
                        <SecurityFlags s={s} />
                      </td>

                      {/* Location: flag + city + region + timezone */}
                      <td className="px-4 py-3">
                        <div className="text-xs text-foreground">
                          {countryFlag(s.country_code)}{" "}
                          {[s.city, s.region].filter(Boolean).join(", ") || s.country || "—"}
                        </div>
                        {s.timezone && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{s.timezone}</div>
                        )}
                      </td>

                      {/* Network / ASN */}
                      <td className="px-4 py-3">
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {s.as_name || s.org || "—"}
                        </div>
                        {s.as_type && (
                          <span className={`inline-block text-[9px] font-mono uppercase tracking-wider rounded px-1 py-0.5 mt-0.5 border ${
                            s.as_type === "hosting"  ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                            s.as_type === "business" ? "bg-purple-500/15 text-purple-400 border-purple-500/30" :
                                                       "bg-muted text-muted-foreground border-border"
                          }`}>
                            {s.as_type}
                          </span>
                        )}
                      </td>

                      {/* Page */}
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                          {s.page}
                        </span>
                      </td>

                      {/* CPF */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.lead_cpf || "—"}</td>

                      {/* Device */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {s.is_mobile || /Mobile|Android|iPhone|iPad/i.test(s.user_agent ?? "")
                            ? <Smartphone className="h-3.5 w-3.5 shrink-0" />
                            : <Monitor className="h-3.5 w-3.5 shrink-0" />}
                          {formatDevice(s)}
                        </span>
                      </td>

                      {/* Started at */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {relativeTime(s.started_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        {s.ip_address && (
                          <button
                            onClick={() => handleBlockIP(s.ip_address!)}
                            title={`Bloquear IP ${s.ip_address}`}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <ShieldBan className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center pt-2">
          <button
            onClick={fetchMore}
            disabled={loadingMore}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}
    </div>
  );
}
