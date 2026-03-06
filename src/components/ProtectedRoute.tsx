import { Navigate, useLocation } from "react-router-dom";
import { useAccessGuard } from "@/contexts/AccessGuardContext";
import { useFlow } from "@/contexts/FlowContext";
import genericErrorSvg from "@/assets/generic-error.svg";

// Steps that require previous data to be filled (flow integrity).
// Maps step_key → required FlowContext fields.
const STEP_REQUIREMENTS: Record<string, (keyof FlowFields)[]> = {
  "dados-bancarios": ["cpf", "phone"],
  "resgate":         ["cpf", "phone"],
  "senha":           ["cpf", "phone"],
  "assinatura":      ["cpf", "phone"],
  "biometria":       ["cpf", "phone"],
  "concluido":       ["cpf", "phone"],
};

interface FlowFields {
  cpf: string;
  phone: string;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  stepKey?: string; // if set, enforces flow integrity for this step
}

export default function ProtectedRoute({ children, stepKey }: ProtectedRouteProps) {
  const { allowed, loading, reason } = useAccessGuard();
  const { data } = useFlow();
  const location = useLocation();

  // Loading state — blank screen (same as original SplashPage behavior)
  if (loading) {
    return <div className="min-h-screen bg-white" />;
  }

  // Blocked by access guard
  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <img src={genericErrorSvg} alt="" className="w-[260px] h-auto mb-8 animate-fade-in" />
        <h2 className="text-xl font-bold text-foreground mb-2 animate-fade-in">Ops, acesso não permitido</h2>
        <p className="text-body text-muted-foreground leading-relaxed max-w-[300px] animate-fade-in" style={{ animationDelay: "0.15s", animationFillMode: "backwards" }}>
          {reason || "Acesso não permitido para este dispositivo."}
        </p>
      </div>
    );
  }

  // Flow integrity: check if user has required data for this step
  if (stepKey) {
    const required = STEP_REQUIREMENTS[stepKey];
    if (required) {
      const flowFields: FlowFields = { cpf: data.cpf, phone: data.phone };
      const missing = required.some((field) => !flowFields[field]);
      if (missing) {
        // Redirect to start — user tried to skip steps
        return <Navigate to="/" replace state={{ from: location.pathname }} />;
      }
    }
  }

  return <>{children}</>;
}
