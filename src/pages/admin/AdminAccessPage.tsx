import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionRepository, configRepository } from "@/repositories";
import type { SessionWithLeadCpf } from "@/repositories";
import { RefreshCw, Search, Trash2, ShieldBan, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

export default function AdminAccessPage() {
  const [sessions, setSessions] = useState<SessionWithLeadCpf[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);

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

    const channel = supabase
      .channel("admin-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, fetchSessions)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.ip_address?.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q) ||
      s.page?.toLowerCase().includes(q) ||
      s.lead_cpf?.toLowerCase().includes(q) ||
      s.org?.toLowerCase().includes(q)
    );
  });

  const onlineCount = sessions.filter((s) => s.is_online).length;

  const formatUA = (ua: string | null) => {
    if (!ua) return "—";
    if (ua.includes("Mobile")) return "Mobile";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "Mac";
    if (ua.includes("Linux")) return "Linux";
    return "Outro";
  };

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
    } catch (err) {
      console.error("Block IP error:", err);
      toast.error("Erro ao bloquear IP");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Acessos</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-mono font-medium text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            {onlineCount} online
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Apagar ({selected.size})
            </button>
          )}
          <button onClick={handleClearAll} className="flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-4 w-4" /> Limpar tudo
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
          placeholder="Buscar por IP, cidade, página, CPF..."
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
                    {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">IP</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Localização</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Provedor</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Página</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">CPF Vinculado</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Dispositivo</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Início</th>
                <th className="px-4 py-3 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Nenhum acesso encontrado</td></tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${selected.has(s.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => toggleSelect(s.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {selected.has(s.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {s.is_online ? (
                        <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                          </span>
                          Online
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground">Offline</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{s.ip_address || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {[s.city, s.region, s.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.org || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                        {s.page}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.lead_cpf || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatUA(s.user_agent)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {new Date(s.started_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.ip_address && (
                        <button
                          onClick={() => handleBlockIP(s.ip_address!)}
                          title="Bloquear IP"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <ShieldBan className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
