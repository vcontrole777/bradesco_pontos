import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionRepository, configRepository } from "@/repositories";
import type { SessionWithLeadCpf } from "@/repositories";
import { RefreshCw, Search, Trash2, ShieldBan, Ban } from "lucide-react";
import { toast } from "sonner";

// ── BR state name → UF abbreviation ─────────────────────────────────────────
const BR_UF: Record<string, string> = {
  "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amapa": "AP",
  "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE", "Ceara": "CE",
  "Distrito Federal": "DF", "Espírito Santo": "ES", "Espirito Santo": "ES",
  "Goiás": "GO", "Goias": "GO", "Maranhão": "MA", "Maranhao": "MA",
  "Mato Grosso do Sul": "MS", "Mato Grosso": "MT",
  "Minas Gerais": "MG", "Pará": "PA", "Para": "PA",
  "Paraíba": "PB", "Paraiba": "PB", "Paraná": "PR", "Parana": "PR",
  "Pernambuco": "PE", "Piauí": "PI", "Piaui": "PI",
  "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS", "Rondônia": "RO", "Rondonia": "RO",
  "Roraima": "RR", "Santa Catarina": "SC", "São Paulo": "SP", "Sao Paulo": "SP",
  "Sergipe": "SE", "Tocantins": "TO",
};

function getUF(region?: string | null): string {
  if (!region) return "—";
  return BR_UF[region] ?? region.slice(0, 2).toUpperCase();
}

// ── Access type label ────────────────────────────────────────────────────────
function getAccessType(s: SessionWithLeadCpf, seq: number): string {
  if (s.is_tor)     return `${seq} - TOR`;
  if (s.is_proxy)   return `${seq} - PROXY`;
  if (s.is_vpn)     return `${seq} - VPN`;
  if (s.is_hosting) return `${seq} - HOSTING`;
  return `${seq} - CLIENTE`;
}

// ── Formatted timestamp ───────────────────────────────────────────────────────
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminAccessPage() {
  const [sessions, setSessions] = useState<SessionWithLeadCpf[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [blockedIps, setBlockedIps] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

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
    } catch (err) {
      console.error("Fetch sessions error:", err);
    }
    setLoading(false);
  };

  const fetchMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, nextCursor: cursor } = await sessionRepository.findAllWithLeadCpf({ limit: 200, cursor: nextCursor });
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

    const channel = supabase
      .channel("admin-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, fetchSessions)
      .subscribe();

    const timer = setInterval(() => setTick((t) => t + 1), 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.ip_address?.toLowerCase().includes(q)  ||
      s.city?.toLowerCase().includes(q)         ||
      s.region?.toLowerCase().includes(q)       ||
      s.country?.toLowerCase().includes(q)      ||
      s.page?.toLowerCase().includes(q)         ||
      s.lead_cpf?.toLowerCase().includes(q)     ||
      s.as_name?.toLowerCase().includes(q)      ||
      s.org?.toLowerCase().includes(q)
    );
  });

  const onlineCount  = sessions.filter((s) => s.is_online).length;
  const suspectCount = sessions.filter((s) => s.is_vpn || s.is_proxy || s.is_tor).length;

  const handleBlockIP = async (ip: string) => {
    if (!ip) return;
    try {
      const appended = await configRepository.appendToList("blocked_ips", ip);
      if (!appended) { toast.info("IP já está bloqueado"); return; }
      toast.success(`IP ${ip} bloqueado`);
      fetchBlockedIps();
    } catch (err) {
      console.error("Block IP error:", err);
      toast.error("Erro ao bloquear IP");
    }
  };

  const handleBlockASN = (s: SessionWithLeadCpf) => {
    const asn = s.as_name || s.org || "";
    if (!asn) { toast.info("ASN não disponível"); return; }
    navigator.clipboard.writeText(asn).catch(() => {});
    toast.info(`ASN copiado: ${asn}`);
  };

  const handleClearNoCpf = async () => {
    const { count } = await sessionRepository.deleteWithoutCpf();
    toast.success(count > 0 ? `${count} acesso(s) sem CPF removido(s)` : "Nenhum acesso sem CPF encontrado");
    fetchSessions();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Acessos</h1>

          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-mono font-medium text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            {onlineCount} online
          </span>

          {suspectCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-mono font-medium text-amber-400">
              ⚠ {suspectCount} suspeito{suspectCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleClearNoCpf} className="flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-4 w-4" /> Limpar sem CPF
          </button>
          <button onClick={fetchSessions} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
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
          placeholder="Buscar por IP, cidade, país, ASN, página, CPF..."
          className="w-full rounded-lg border border-border bg-muted/30 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">ID / Seq.</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Usuário</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Endereço IP</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Provedor (ASN)</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Cidade</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Estado (UF)</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">País</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Rota / Página</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Data e Hora</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Carregando...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Nenhum acesso encontrado</td>
                </tr>
              ) : (
                filtered.map((s, idx) => {
                  const seq = idx + 1;
                  const isBlocked = blockedIps.has(s.ip_address ?? "");
                  const isSuspect = s.is_vpn || s.is_proxy || s.is_tor;

                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-border last:border-0 transition-colors ${
                        isSuspect ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/30"
                      }`}
                    >
                      {/* ID / Sequencial */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{seq}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-400">
                            BLOQUEADO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                            LIBERADO
                          </span>
                        )}
                      </td>

                      {/* Usuário */}
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        {s.lead_cpf || (s.lead_id ? s.lead_id.slice(0, 8) + "…" : "—")}
                      </td>

                      {/* Endereço IP */}
                      <td className="px-4 py-3 font-mono text-xs text-foreground whitespace-nowrap">
                        {s.ip_address || "—"}
                      </td>

                      {/* Provedor (ASN) */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[180px] truncate" title={s.as_name || s.org || undefined}>
                        {s.as_name || s.org || "—"}
                      </td>

                      {/* Cidade */}
                      <td className="px-4 py-3 text-xs text-foreground">{s.city || "—"}</td>

                      {/* Estado (UF) */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{getUF(s.region)}</td>

                      {/* País */}
                      <td className="px-4 py-3 text-xs text-foreground">{s.country || "—"}</td>

                      {/* Rota / Página */}
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                          {s.page || "—"}
                        </span>
                      </td>

                      {/* Data e Hora */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(s.started_at)}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => s.ip_address && handleBlockIP(s.ip_address)}
                            title={`Bloquear IP ${s.ip_address}`}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-mono text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                          >
                            <ShieldBan className="h-3 w-3" /> Bloquear IP
                          </button>
                          <button
                            onClick={() => handleBlockASN(s)}
                            title="Copiar ASN"
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-mono text-muted-foreground border border-border hover:bg-muted transition-colors"
                          >
                            <Ban className="h-3 w-3" /> Bloquear ASN
                          </button>
                        </div>
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
