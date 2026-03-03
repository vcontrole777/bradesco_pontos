import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import LottieLoader from "@/components/LottieLoader";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";

const PasswordPage = () => {
  const navigate = useNavigate();
  const { data, updateData } = useFlow();
  const { getNextStep, getPrevStep } = useFlowNavigation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!data.cpf) navigate("/");
  }, [data.cpf, navigate]);

  useEffect(() => {
    if (error) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const filledCount = pin.length;
  const isComplete = filledCount === 4;

  const handleSubmit = () => {
    if (pin.length !== 4) {
      setError("Informe os 4 dígitos da senha");
      return;
    }
    updateData({ password: pin });
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate(getNextStep("senha"));
    }, 400);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8">
      {/* Back button */}
      <div className="absolute top-6 left-6">
        <button
          onClick={() => navigate(getPrevStep("senha"))}
          className="flex min-h-[44px] items-center gap-1 px-1 text-body-sm font-medium text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>

      {/* Content card */}
      <div className="flex w-full max-w-[380px] flex-col items-center">
        {/* Title */}
        <h1 className="text-[22px] font-extrabold tracking-tight text-foreground mb-1.5">
          Senha de Acesso
        </h1>
        <p className="text-sm text-muted-foreground font-medium mb-10">
          Digite sua senha numérica de 4 dígitos
        </p>

        {/* OTP Field */}
        <div
          className={`mb-5 transition-transform ${shake ? "animate-[shake_0.4s_ease-in-out]" : ""}`}
        >
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={(value) => {
              setPin(value.replace(/\D/g, ""));
              setError("");
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
          >
            <InputOTPGroup className="gap-3">
              {[0, 1, 2, 3].map((i) => {
                const isFilled = i < filledCount;
                const isActive = i === filledCount;
                return (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className={`
                      h-[60px] w-[60px] text-[22px] font-extrabold rounded-2xl border-0 transition-all duration-200
                      ${error ? "ring-2 ring-red-400" : ""}
                    `}
                    style={{
                      ...(isFilled && !error
                        ? { backgroundColor: "#ffffff", color: "hsl(348 91% 42%)", boxShadow: "0 1px 3px 0 rgba(0,0,0,0.06)" }
                        : {}),
                      ...(isActive && !error
                        ? { backgroundColor: "#ffffff", color: "hsl(348 91% 42%)", boxShadow: "inset 0 0 0 2px hsl(348 91% 42% / 0.35)" }
                        : {}),
                      ...(!isFilled && !isActive && !error
                        ? { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--border))" }
                        : {}),
                    }}
                  />
                );
              })}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {/* Progress dots */}
        <div className="flex gap-2.5 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[5px] rounded-full transition-all duration-300"
              style={{
                width: i < filledCount ? "32px" : "20px",
                backgroundColor: i < filledCount ? "hsl(348 91% 42%)" : "hsl(348 91% 42% / 0.15)",
              }}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-500 font-semibold animate-slide-up-fade mb-5 -mt-3">
            {error}
          </p>
        )}

        {/* CTA */}
        <button
          disabled={loading || !isComplete}
          onClick={handleSubmit}
          className="h-[56px] w-full rounded-2xl text-body font-bold transition-all duration-300 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: isComplete ? "hsl(348 91% 42%)" : "hsl(348 91% 42% / 0.1)",
            color: isComplete ? "#ffffff" : "hsl(348 91% 42% / 0.4)",
            boxShadow: isComplete ? "0 8px 24px -4px hsl(348 91% 42% / 0.3)" : "none",
          }}
        >
          {loading ? (
            <LottieLoader variant="white" size={28} />
          ) : (
            "Validar"
          )}
        </button>

        {/* Security badge */}
        <div className="flex items-center gap-1.5 mt-6 text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="text-2xs font-medium">Ambiente seguro e criptografado</span>
        </div>
      </div>
    </div>
  );
};

export default PasswordPage;
