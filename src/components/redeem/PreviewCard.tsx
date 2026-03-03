import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { RedeemOption } from "./RedemptionOptions";

interface PreviewCardProps {
  option: "fatura" | "conta";
  points: number;
  segColor: string;
}

const CONVERSION_RATE = 0.01;

const LABELS: Record<"fatura" | "conta", string> = {
  fatura: "Abater na fatura",
  conta: "Crédito em conta",
};

const PreviewCard = ({ option, points, segColor }: PreviewCardProps) => {
  const value = points * CONVERSION_RATE;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [option]);

  return (
    <div ref={ref} className="relative z-10 mb-4 animate-slide-up-fade">
      <Card className="overflow-hidden border-0 rounded-2xl shadow-lg bg-white">
        <CardContent className="p-4">
          <p className="text-2xs font-medium tracking-wide text-muted-foreground mb-3 uppercase">
            Resumo do resgate
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pontos</span>
              <span className="text-sm font-bold" style={{ color: segColor }}>
                {points.toLocaleString("pt-BR")} pts
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor equivalente</span>
              <span className="text-sm font-bold text-foreground">
                R${" "}
                {value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="border-t border-border pt-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Forma de resgate</span>
              <span className="text-sm font-semibold text-foreground/80">
                {LABELS[option]}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PreviewCard;
