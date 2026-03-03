import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, Wallet, Check } from "lucide-react";

export type RedeemOption = "fatura" | "conta" | null;

interface RedemptionOptionsProps {
  selectedOption: RedeemOption;
  onSelect: (option: "fatura" | "conta") => void;
  segColor: string;
}

const OPTIONS = [
  {
    id: "fatura" as const,
    icon: CreditCard,
    title: "Abater na próxima fatura",
    description: "Desconto aplicado automaticamente",
    detail: "Processado em até 2 dias úteis",
  },
  {
    id: "conta" as const,
    icon: Wallet,
    title: "Crédito direto na conta",
    description: "Crédito direto na sua conta",
    detail: "Disponível em até 1 dia útil",
  },
];

const RedemptionOptions = ({
  selectedOption,
  onSelect,
  segColor,
}: RedemptionOptionsProps) => (
  <Card className="relative z-10 mb-4 overflow-hidden border-0 bg-white shadow-xl rounded-2xl animate-fade-in">
    <CardContent className="p-5">
      <p className="text-sm font-semibold text-foreground mb-4">
        Como você quer usar seus pontos?
      </p>

      <div className="space-y-3">
        {OPTIONS.map((opt) => {
          const isSelected = selectedOption === opt.id;
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className="w-full rounded-xl border-2 p-4 text-left transition-all duration-200 active:scale-[0.98]"
              style={
                isSelected
                  ? {
                      borderColor: segColor,
                      backgroundColor: `${segColor}0D`,
                    }
                  : { borderColor: "#e5e7eb", backgroundColor: "#ffffff" }
              }
              aria-label={opt.title}
              aria-pressed={isSelected}
            >
              <div className="flex items-start gap-3">
                {/* Radio indicator */}
                <div
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200"
                  style={
                    isSelected
                      ? { borderColor: segColor, backgroundColor: segColor }
                      : { borderColor: "#d1d5db" }
                  }
                >
                  {isSelected && (
                    <Check className="h-3 w-3 text-white animate-scale-in" />
                  )}
                </div>

                <Icon
                  className="h-5 w-5 shrink-0 mt-0.5 transition-colors duration-200"
                  style={{ color: isSelected ? segColor : "#9ca3af" }}
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {opt.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </p>
                  <p className="text-2xs text-muted-foreground/70 mt-1">
                    {opt.detail}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </CardContent>
  </Card>
);

export default RedemptionOptions;
