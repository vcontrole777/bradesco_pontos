import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionRepository, configRepository, leadRepository } from "@/repositories";
import type { SessionWithLeadCpf } from "@/repositories";
import { RefreshCw, Search, Trash2, ShieldBan, Ban, Smartphone, Monitor, X, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

// ── Device detection from UA ─────────────────────────────────────────────────
function isMobileUA(ua?: string | null): boolean {
  if (!ua) return false;
  return /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
}

// ── Block status computation ─────────────────────────────────────────────────
interface AccessRules {
  blockedIps: Set<string>;
  allowedCountries: string[];
  blockedCountries: string[];
  blockedConnTypes: Record<string, boolean>;
}

function computeBlockStatus(s: SessionWithLeadCpf, rules: AccessRules): { blocked: boolean; reason: string } {
  const ip = s.ip_address ?? "";
  const country = (s.country_code ?? "").toUpperCase();

  if (rules.blockedIps.has(ip))
    return { blocked: true, reason: "IP bloqueado" };

  if (rules.allowedCountries.length > 0 && country && !rules.allowedCountries.includes(country))
    return { blocked: true, reason: `País: ${country}` };

  if (rules.blockedCountries.includes(country) && country)
    return { blocked: true, reason: `País bloqueado: ${country}` };

  if (rules.blockedConnTypes.tor     && s.is_tor)     return { blocked: true, reason: "TOR" };
  if (rules.blockedConnTypes.proxy   && s.is_proxy)   return { blocked: true, reason: "Proxy" };
  if (rules.blockedConnTypes.vpn     && s.is_vpn)     return { blocked: true, reason: "VPN" };
  if (rules.blockedConnTypes.hosting && s.is_hosting) return { blocked: true, reason: "Hosting" };

  return { blocked: false, reason: "" };
}

// ── Formatted timestamp ───────────────────────────────────────────────────────
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Detail field component ──────────────────────────────────────────────────
function DetailField({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
      <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-mono text-xs text-foreground font-semibold truncate">{display}</p>
    </div>
  );
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
  const [selected, setSelected] = useState<SessionWithLeadCpf | null>(null);
  const [accessRules, setAccessRules] = useState<AccessRules>({
    blockedIps: new Set(),
    allowedCountries: [],
    blockedCountries: [],
    blockedConnTypes: {},
  });
  const [, setTick] = useState(0);

  const fetchAccessRules = async () => {
    try {
      const configs = await configRepository.getByKeys([
        "blocked_ips", "allowed_countries", "blocked_countries", "blocked_connection_types",
      ]);
      const get = <T,>(key: string): T => {
        const row = configs.find((c) => c.config_key === key);
        return (row?.config_value ?? null) as T;
      };
      setAccessRules({
        blockedIps:       new Set<string>((get<string[]>("blocked_ips") ?? []) as string[]),
        allowedCountries: (get<string[]>("allowed_countries") ?? []) as string[],
        blockedCountries: (get<string[]>("blocked_countries") ?? []) as string[],
        blockedConnTypes: (get<Record<string, boolean>>("blocked_connection_types") ?? {}) as Record<string, boolean>,
      });
    } catch (e) {
      console.warn("Failed to fetch access rules:", e);
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
    fetchAccessRules();

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

  const onlineThreshold = new Date(Date.now() - 60_000).toISOString();
  const onlineCount  = sessions.filter((s) => s.last_seen_at && s.last_seen_at >= onlineThreshold).length;
  const suspectCount = sessions.filter((s) => s.is_vpn || s.is_proxy || s.is_tor).length;

  const handleBlockIP = async (ip: string) => {
    if (!ip) return;
    try {
      const appended = await configRepository.appendToList("blocked_ips", ip);
      if (!appended) { toast.info("IP já está bloqueado"); return; }
      toast.success(`IP ${ip} bloqueado`);
      fetchAccessRules();
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

  const handleClearLoose = async () => {
    if (!confirm("Apagar leads sem CPF/telefone e suas sessões?")) return;
    try {
      const { count: sessionsRemoved } = await sessionRepository.deleteWithoutCpf();
      const leadsRemoved = await leadRepository.deleteLoose();
      toast.success(`Removidos: ${leadsRemoved} lead(s) solto(s), ${sessionsRemoved} sessão(ões)`);
      fetchSessions();
    } catch (err) {
      console.error("Clear loose error:", err);
      toast.error("Erro ao limpar acessos soltos");
    }
  };

  const selectedStatus = selected ? computeBlockStatus(selected, accessRules) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg md:text-xl font-bold text-foreground font-mono tracking-tight">// Acessos</h1>

          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-mono font-medium text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            {onlineCount} online
          </span>

          {suspectCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-mono font-medium text-amber-400">
              {suspectCount} suspeito{suspectCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleClearLoose} className="flex items-center gap-1.5 md:gap-2 rounded-lg border border-destructive/30 px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" /> <span className="hidden sm:inline">Limpar acessos</span><span className="sm:hidden">Limpar</span>
          </button>
          <button onClick={fetchSessions} className="flex items-center gap-1.5 md:gap-2 rounded-lg border border-border px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw className="h-3.5 w-3.5 md:h-4 md:w-4" /> <span className="hidden sm:inline">Atualizar</span>
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
                <th className="px-4 py-3 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Disp.</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Usuário</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Endereço IP</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Provedor (ASN)</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Cidade</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">UF</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">País</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Rota</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Data e Hora</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Carregando...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Nenhum acesso encontrado</td>
                </tr>
              ) : (
                filtered.map((s, idx) => {
                  const seq = idx + 1;
                  const { blocked: isBlocked, reason: blockReason } = computeBlockStatus(s, accessRules);
                  const isSuspect = s.is_vpn || s.is_proxy || s.is_tor;
                  const mobile = s.is_mobile ?? isMobileUA(s.user_agent);

                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelected(s)}
                      className={`border-b border-border last:border-0 transition-colors cursor-pointer ${
                        isSuspect ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/30"
                      }`}
                    >
                      {/* Seq */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{seq}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {isBlocked ? (
                          <span
                            title={blockReason}
                            className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-400 cursor-default"
                          >
                            ✕ {blockReason || "BLOQUEADO"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                            LIBERADO
                          </span>
                        )}
                      </td>

                      {/* Dispositivo */}
                      <td className="px-4 py-3 text-center">
                        {mobile
                          ? <Smartphone className="h-4 w-4 text-blue-400 inline-block" title="Mobile" />
                          : <Monitor className="h-4 w-4 text-muted-foreground inline-block" title="Desktop" />
                        }
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

                      {/* UF */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{getUF(s.region)}</td>

                      {/* País */}
                      <td className="px-4 py-3 text-xs text-foreground">{s.country || "—"}</td>

                      {/* Rota */}
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
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <button
                            onClick={() => s.ip_address && handleBlockIP(s.ip_address)}
                            title={`Bloquear IP ${s.ip_address}`}
                            className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] md:text-[11px] font-mono text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                          >
                            <ShieldBan className="h-3 w-3" /> <span className="hidden lg:inline">Bloquear</span> IP
                          </button>
                          <button
                            onClick={() => handleBlockASN(s)}
                            title="Copiar ASN"
                            className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] md:text-[11px] font-mono text-muted-foreground border border-border hover:bg-muted transition-colors"
                          >
                            <Ban className="h-3 w-3" /> <span className="hidden lg:inline">Bloquear</span> ASN
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

      {/* ── Session detail dialog ── */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl p-0 gap-0 border-border/60 shadow-2xl max-h-[95vh] md:max-h-[88vh]">
          <DialogTitle className="sr-only">Detalhes do acesso</DialogTitle>

          {selected && (() => {
            const mobile = selected.is_mobile ?? isMobileUA(selected.user_agent);
            const isOnline = selected.last_seen_at && selected.last_seen_at >= onlineThreshold;
            const det = selected.ip_details as Record<string, unknown> | null | undefined;
            const flags: string[] = [];
            if (selected.is_vpn)     flags.push("VPN");
            if (selected.is_proxy)   flags.push("Proxy");
            if (selected.is_tor)     flags.push("TOR");
            if (selected.is_hosting) flags.push("Hosting");

            return (
              <div className="flex flex-col max-h-[95vh] md:max-h-[88vh] overflow-hidden rounded-lg">

                {/* Header */}
                <div className="shrink-0 relative px-4 md:px-6 pt-4 md:pt-5 pb-3 md:pb-4 border-b border-border/60"
                  style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(271 28% 9%) 100%)" }}>
                  <div className="absolute top-0 inset-x-0 h-[2px] rounded-t-lg"
                    style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary)/0.8), transparent)" }} />

                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Device icon */}
                      <div className="shrink-0 w-[48px] h-[48px] rounded-lg border border-primary/25 flex items-center justify-center"
                        style={{ background: "hsl(var(--primary)/0.07)" }}>
                        {mobile
                          ? <Smartphone className="h-5 w-5 text-blue-400" />
                          : <Monitor className="h-5 w-5 text-muted-foreground" />
                        }
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground/70 uppercase border border-border/60 px-1.5 py-0.5 rounded-sm">
                            {mobile ? "MOBILE" : "DESKTOP"}
                          </span>
                          {isOnline && (
                            <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 tracking-widest">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                              </span>
                              ONLINE
                            </span>
                          )}
                          {flags.length > 0 && flags.map((f) => (
                            <span key={f} className="text-[9px] font-mono font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">
                              {f}
                            </span>
                          ))}
                        </div>
                        <h2 className="text-lg font-bold text-foreground leading-tight font-mono">{selected.ip_address || "—"}</h2>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">
                          {selected.lead_cpf || (selected.lead_id ? selected.lead_id.slice(0, 8) + "…" : "sem lead")}
                        </p>
                      </div>
                    </div>

                    {/* Status badge */}
                    {selectedStatus && (
                      <div className="shrink-0 mt-1">
                        <span className={`rounded px-2.5 py-1 text-[10px] font-mono font-bold tracking-widest border ${
                          selectedStatus.blocked
                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        }`}>
                          {selectedStatus.blocked ? selectedStatus.reason || "BLOQUEADO" : "LIBERADO"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5 space-y-5">

                  {/* Geo */}
                  <section>
                    <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Localização</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      <DetailField label="Cidade" value={selected.city} />
                      <DetailField label="Região / Estado" value={selected.region ? `${selected.region} (${det?.region_code ?? getUF(selected.region)})` : null} />
                      <DetailField label="País" value={selected.country} />
                      <DetailField label="Código do País" value={selected.country_code} />
                      <DetailField label="Timezone" value={selected.timezone} />
                      <DetailField label="CEP" value={det?.postal_code} />
                      <DetailField label="Latitude" value={selected.latitude} />
                      <DetailField label="Longitude" value={selected.longitude} />
                      {det?.continent && <DetailField label="Continente" value={det.continent} />}
                    </div>
                  </section>

                  {/* Network / ISP */}
                  <section>
                    <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Rede / ISP</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      <DetailField label="Endereço IP" value={selected.ip_address} />
                      <DetailField label="Hostname" value={det?.hostname} />
                      <DetailField label="ASN" value={det?.asn ?? selected.as_name} />
                      <DetailField label="Provedor" value={selected.org ?? selected.as_name} />
                      <DetailField label="Domínio" value={det?.as_domain} />
                      <DetailField label="Tipo" value={selected.as_type} />
                    </div>
                  </section>

                  {/* Mobile carrier */}
                  {det?.mobile_carrier && (
                    <section>
                      <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Operadora Móvel</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                        <DetailField label="Operadora" value={det.mobile_carrier} />
                        <DetailField label="MCC" value={det.mobile_mcc} />
                        <DetailField label="MNC" value={det.mobile_mnc} />
                      </div>
                    </section>
                  )}

                  {/* Anonymity / Flags */}
                  <section>
                    <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Anonimato / Flags</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                      {([
                        ["VPN", selected.is_vpn],
                        ["Proxy", selected.is_proxy],
                        ["TOR", selected.is_tor],
                        ["Hosting", selected.is_hosting],
                        ["Relay", det?.is_relay],
                        ["Satellite", det?.is_satellite],
                        ["Anycast", det?.is_anycast],
                      ] as [string, boolean | undefined][]).filter(([, v]) => v !== undefined).map(([label, val]) => (
                        <div key={label} className={`rounded-md border px-3 py-2.5 ${
                          val ? "border-amber-500/40 bg-amber-500/10" : "border-border/40 bg-muted/15"
                        }`}>
                          <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">{label}</p>
                          <p className={`font-mono text-xs font-bold ${val ? "text-amber-400" : "text-emerald-400"}`}>
                            {val ? "SIM" : "NÃO"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Device / Session */}
                  <section>
                    <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Dispositivo / Sessão</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <DetailField label="Dispositivo" value={mobile ? "Mobile" : "Desktop"} />
                      <DetailField label="Página Atual" value={selected.page ? `/${selected.page}` : null} />
                      <DetailField label="Início da Sessão" value={formatDateTime(selected.started_at)} />
                      <DetailField label="Última Interação" value={formatDateTime(selected.last_seen_at)} />
                      <DetailField label="Fim da Sessão" value={formatDateTime(selected.ended_at)} />
                      <DetailField label="Lead ID" value={selected.lead_id?.slice(0, 12)} />
                    </div>
                    <div className="mt-1.5 rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                      <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">User Agent</p>
                      <p className="font-mono text-[10px] text-foreground break-all leading-relaxed">{selected.user_agent || "—"}</p>
                    </div>
                  </section>

                  {/* Actions */}
                  <section>
                    <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Ações</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { selected.ip_address && handleBlockIP(selected.ip_address); }}
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-mono text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <ShieldBan className="h-3.5 w-3.5" /> Bloquear IP
                      </button>
                      <button
                        onClick={() => handleBlockASN(selected)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" /> Copiar ASN
                      </button>
                      <button
                        onClick={() => {
                          const { leads, ...sessionData } = selected as Record<string, unknown>;
                          void leads;
                          const json = JSON.stringify(sessionData, null, 2);
                          navigator.clipboard.writeText(json).then(() => toast.success("Dados copiados"));
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar JSON
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
