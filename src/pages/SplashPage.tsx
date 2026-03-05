import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import bradescoLogo from "@/assets/bradesco-logo-splash.png";
import genericErrorSvg from "@/assets/generic-error.svg";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";
import { useAccessGuard } from "@/hooks/useAccessGuard";

const SplashPage = () => {
  const navigate = useNavigate();
  const { getNextStep, isLoading: stepsLoading } = useFlowNavigation();
  const { allowed, loading: guardLoading, reason } = useAccessGuard();

  const ready = !guardLoading && !stepsLoading && allowed;

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      navigate(getNextStep("splash"));
    }, 4000);
    return () => clearTimeout(timer);
  }, [navigate, getNextStep, ready]);

  // Enquanto verifica acesso, tela neutra — bloqueados nunca veem o splash
  if (guardLoading) {
    return <div className="min-h-screen bg-white" />;
  }

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      <img src={bradescoLogo} alt="Bradesco" className="w-32 h-auto mb-6 animate-fade-in" />
      <p className="text-sm animate-pulse animate-fade-in text-livelo-red" style={{ animationDelay: "0.3s", animationFillMode: "backwards" }}>Carregando...</p>
    </div>
  );
};

export default SplashPage;
