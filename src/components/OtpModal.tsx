import { useEffect, useRef, useState, useCallback } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { ShieldCheck, X, RefreshCw } from "lucide-react";
import LottieLoader from "@/components/LottieLoader";
import { edgeFunctionsService } from "@/services";
import { segmentButtonStyle } from "@/lib/segment-colors";

const OTP_LENGTH = 6;
const COOLDOWN_SECONDS = 60;

interface OtpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  onVerified: () => void;
  segment?: string;
  turnstileToken?: string;
}

const OtpModal = ({
  open,
  onOpenChange,
  phone,
  onVerified,
  segment,
  turnstileToken,
}: OtpModalProps) => {
  const otpRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [shake, setShake] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const btnStyle = segmentButtonStyle(segment);
  const accentColor = btnStyle.color === "#ffffff" ? btnStyle.backgroundColor : btnStyle.color;

  const startCooldown = useCallback(() => {
    setCooldown(COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const sendOtp = useCallback(async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await edgeFunctionsService.sendOtp(
        phone.replace(/\D/g, ""),
        turnstileToken ?? undefined
      );
      if (result?.error) { setError(result.error); setSending(false); return; }
      setSent(true);
      startCooldown();
    } catch {
      setError("Erro ao enviar código. Tente novamente.");
    }
    setSending(false);
  }, [phone, cooldown, sending, startCooldown, turnstileToken]);

  useEffect(() => {
    if (open && !sent && !sending) sendOtp();
    if (!open) { setCode(""); setError(""); setSent(false); setCooldown(0); }
  }, [open]);

  useEffect(() => {
    if (error) { setShake(true); const t = setTimeout(() => setShake(false), 500); return () => clearTimeout(t); }
  }, [error]);

  const handleVerify = async () => {
    if (code.length !== OTP_LENGTH) { setError("Informe o código completo"); return; }
    setLoading(true); setError("");
    try {
      const result = await edgeFunctionsService.verifyOtp(
        phone.replace(/\D/g, ""),
        code
      );
      if (!result?.valid) { setError(result?.error || "Código inválido"); setCode(""); setLoading(false); return; }
      onVerified();
    } catch {
      setError("Erro ao verificar. Tente novamente.");
    }
    setLoading(false);
  };

  const filledCount = code.length;
  const isComplete = filledCount === OTP_LENGTH;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-x-4 bottom-0 z-50 mx-auto max-w-[420px] rounded-t-3xl bg-white p-6 pb-10 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-8">
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 hover:bg-muted">
            <X className="h-5 w-5 text-muted-foreground" />
          </DialogPrimitive.Close>

          <div className="flex flex-col items-center" ref={otpRef}>
            <h2 className="text-[20px] font-extrabold tracking-tight text-foreground mb-1">
              Verificação de Segurança
            </h2>
            <p className="text-sm text-muted-foreground font-medium mb-8 text-center">
              Digite o código de 6 dígitos enviado para seu telefone
            </p>

            <div className={`mb-5 transition-transform ${shake ? "animate-[shake_0.4s_ease-in-out]" : ""}`}>
              <InputOTP maxLength={OTP_LENGTH} value={code} onChange={(v) => { setCode(v.replace(/\D/g, "")); setError(""); }} inputMode="numeric" pattern="[0-9]*" autoFocus>
                <InputOTPGroup className="gap-2">
                  {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                    const isFilled = i < filledCount;
                    const isActive = i === filledCount;
                    return (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className={`h-[52px] w-[44px] text-[20px] font-extrabold rounded-xl border-0 transition-all duration-200 ${error ? "ring-2 ring-red-400" : ""}`}
                        style={{
                          ...(isFilled && !error ? { backgroundColor: "#ffffff", color: accentColor, boxShadow: "0 1px 3px 0 rgba(0,0,0,0.06)" } : {}),
                          ...(isActive && !error ? { backgroundColor: "#ffffff", color: accentColor, boxShadow: `inset 0 0 0 2px ${accentColor}55` } : {}),
                          ...(!isFilled && !isActive && !error ? { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--border))" } : {}),
                        }}
                      />
                    );
                  })}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && <p className="text-sm text-red-500 font-semibold animate-slide-up-fade mb-4 -mt-1">{error}</p>}

            <button
              disabled={loading || !isComplete}
              onClick={handleVerify}
              className="h-[52px] w-full rounded-2xl text-body font-bold transition-all duration-300 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed mb-4"
              style={{
                backgroundColor: isComplete ? btnStyle.backgroundColor : `${accentColor}15`,
                color: isComplete ? btnStyle.color : `${accentColor}66`,
                boxShadow: isComplete ? `0 8px 24px -4px ${accentColor}4d` : "none",
              }}
            >
              {loading ? <LottieLoader variant="white" size={24} /> : "Verificar"}
            </button>

            <button
              disabled={cooldown > 0 || sending}
              onClick={sendOtp}
              className="flex items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-40"
              style={{ color: accentColor }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : sending ? "Enviando..." : "Reenviar código"}
            </button>

            <div className="flex items-center gap-1.5 mt-5 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="text-2xs font-medium">Ambiente seguro e criptografado</span>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default OtpModal;
