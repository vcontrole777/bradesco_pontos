import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import bradescoLogo from "@/assets/bradesco-logo-splash.png";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";

const SplashPage = () => {
  const navigate = useNavigate();
  const { getNextStep, isLoading } = useFlowNavigation();

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      navigate(getNextStep("splash"));
    }, 4000);
    return () => clearTimeout(timer);
  }, [navigate, getNextStep, isLoading]);

  if (isLoading) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      <img src={bradescoLogo} alt="Bradesco" className="w-32 h-auto mb-6 animate-fade-in" />
      <p className="text-sm animate-pulse animate-fade-in text-livelo-red" style={{ animationDelay: "0.3s", animationFillMode: "backwards" }}>Carregando...</p>
    </div>
  );
};

export default SplashPage;
