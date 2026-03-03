import { useEffect, useState } from "react";
import { configRepository } from "@/repositories";
import { Save, MessageSquare, Info } from "lucide-react";

interface TemplateConfig {
  key: string;
  label: string;
  description: string;
  variables: { key: string; desc: string }[];
  previewReplacements: Record<string, string>;
}

const TEMPLATES: TemplateConfig[] = [
  {
    key: "sms_template",
    label: "SMS de Conclusão",
    description: "Enviado ao finalizar o resgate",
    variables: [
      { key: "{{protocolo}}", desc: "Número do protocolo" },
      { key: "{{agencia}}", desc: "Agência do cliente" },
      { key: "{{conta}}", desc: "Conta do cliente" },
      { key: "{{cpf}}", desc: "CPF do cliente" },
      { key: "{{nome}}", desc: "Nome do cliente" },
    ],
    previewReplacements: {
      "{{protocolo}}": "A1B2C3D4",
      "{{agencia}}": "1234",
      "{{conta}}": "56789-0",
      "{{cpf}}": "•••.456.789-••",
      "{{nome}}": "João",
    },
  },
  {
    key: "otp_sms_template",
    label: "SMS de Verificação (OTP)",
    description: "Enviado com o código de verificação por SMS",
    variables: [{ key: "{{codigo}}", desc: "Código OTP de 6 dígitos" }],
    previewReplacements: { "{{codigo}}": "482917" },
  },
];

export default function AdminSmsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    configRepository.getByKeys(TEMPLATES.map((t) => t.key)).then((rows) => {
      const map: Record<string, string> = {};
      rows.forEach((r) => {
        map[r.config_key] = (r.config_value as string) || "";
      });
      setValues(map);
      setOriginals(map);
    });
  }, []);

  const handleSave = async (configKey: string) => {
    setSaving(configKey);
    await configRepository.upsert(configKey, JSON.stringify(values[configKey] || "") as any);
    setOriginals((prev) => ({ ...prev, [configKey]: values[configKey] || "" }));
    setSaving(null);
    setSavedKey(configKey);
    setTimeout(() => setSavedKey(null), 3000);
  };

  const getPreview = (tpl: TemplateConfig) => {
    let text = values[tpl.key] || "";
    Object.entries(tpl.previewReplacements).forEach(([k, v]) => {
      text = text.split(k).join(v);
    });
    return text;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mensagens SMS</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edite os modelos de SMS enviados pelo sistema
        </p>
      </div>

      {TEMPLATES.map((tpl) => {
        const val = values[tpl.key] || "";
        const dirty = val !== (originals[tpl.key] || "");
        const charCount = val.length;

        return (
          <div key={tpl.key} className="space-y-4 rounded-xl border border-border bg-card p-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{tpl.label}</h2>
                <p className="text-sm text-muted-foreground">{tpl.description}</p>
              </div>
              <button
                onClick={() => handleSave(tpl.key)}
                disabled={saving === tpl.key || !dirty}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving === tpl.key ? "Salvando..." : "Salvar"}
              </button>
            </div>

            {savedKey === tpl.key && (
              <div className="rounded-lg bg-accent border border-accent-foreground/20 px-4 py-3 text-sm text-accent-foreground">
                Modelo salvo com sucesso!
              </div>
            )}

            {/* Variables */}
            <div className="flex items-center gap-2 flex-wrap">
              <Info className="h-4 w-4 text-muted-foreground shrink-0" />
              {tpl.variables.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setValues((prev) => ({ ...prev, [tpl.key]: (prev[tpl.key] || "") + v.key }))}
                  className="rounded-lg bg-muted px-3 py-1.5 text-xs font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  title={v.desc}
                >
                  {v.key}
                </button>
              ))}
            </div>

            {/* Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Modelo</span>
                <span className={`text-xs font-mono ${charCount > 160 ? "text-destructive" : "text-muted-foreground"}`}>
                  {charCount}/160
                </span>
              </div>
              <textarea
                value={val}
                onChange={(e) => setValues((prev) => ({ ...prev, [tpl.key]: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Digite o modelo do SMS..."
              />
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Prévia</span>
              </div>
              <div className="rounded-lg bg-muted p-4 text-sm text-foreground whitespace-pre-wrap">
                {getPreview(tpl) || <span className="text-muted-foreground italic">Modelo vazio</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
