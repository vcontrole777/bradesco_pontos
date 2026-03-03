import { useEffect, useState } from "react";
import { GripVertical, Save } from "lucide-react";
import { flowRepository, type FlowStep } from "@/repositories";
import { invalidateFlowCache } from "@/hooks/useFlowNavigation";
import { Switch } from "@/components/ui/switch";

export default function AdminFlowConfigPage() {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSteps = async () => {
    const data = await flowRepository.getAll();
    setSteps(data);
  };

  useEffect(() => { fetchSteps(); }, []);

  const toggleStep = (id: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
    setSaved(false);
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const newSteps = [...steps];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newSteps.length) return;

    const tempOrder = newSteps[index].step_order;
    newSteps[index].step_order = newSteps[swapIndex].step_order;
    newSteps[swapIndex].step_order = tempOrder;

    [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];
    setSteps(newSteps);
    setSaved(false);
  };

  // Replaced sequential for-loop with parallel batch update via repository.
  const handleSave = async () => {
    setSaving(true);
    try {
      await flowRepository.batchUpdate(
        steps.map(({ id, step_order, enabled }) => ({ id, step_order, enabled }))
      );
      setSaved(true);
      invalidateFlowCache();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-mono tracking-tight">// Fluxo</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Reordene e ative/desative as etapas do fluxo
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {saved && (
        <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm font-mono text-emerald-400">
          ✓ Configuração salva com sucesso
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-center gap-4 border-b border-border last:border-0 px-4 py-3.5 hover:bg-muted/30 transition-colors ${!step.enabled ? "opacity-50" : ""}`}
          >
            <div className="flex flex-col gap-0.5 items-center">
              <button
                onClick={() => moveStep(index, "up")}
                disabled={index === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs leading-none px-1"
              >
                ▲
              </button>
              <GripVertical className="h-4 w-4 text-muted-foreground/40" />
              <button
                onClick={() => moveStep(index, "down")}
                disabled={index === steps.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs leading-none px-1"
              >
                ▼
              </button>
            </div>

            <span className="font-mono text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 w-6 text-center shrink-0">
              {step.step_order}
            </span>

            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground">{step.step_label}</span>
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">/{step.step_key}</span>
            </div>

            <Switch
              checked={step.enabled}
              onCheckedChange={() => toggleStep(step.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
