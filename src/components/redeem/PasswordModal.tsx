import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { ShieldCheck, X } from "lucide-react";
import LottieLoader from "@/components/LottieLoader";
import { segmentButtonStyle } from "@/lib/segment-colors";

interface PasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pin: string;
  onPinChange: (value: string) => void;
  error: string;
  onConfirm: () => void;
  segment?: string;
  title?: string;
  description?: string;
}

const PasswordModal = ({
  open,
  onOpenChange,
  pin,
  onPinChange,
  error,
  onConfirm,
  segment,
  title = "Confirme seu resgate",
  description = "Digite sua senha de 4 dígitos",
}: PasswordModalProps) => {
  const otpRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const btnStyle = segmentButtonStyle(segment);
  const accentColor = btnStyle.color === "#ffffff" ? btnStyle.backgroundColor : btnStyle.color;

  useEffect(() => {
    if (error) { setShake(true); const t = setTimeout(() => setShake(false), 500); return () => clearTimeout(t); }
  }, [error]);

  const filledCount = pin.length;
  const isComplete = filledCount === 4;

  const handleConfirm = () => {
    setLoading(true);
    setTimeout(() => {
      onConfirm();
      setLoading(false);
    }, 300);
  };

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
              {title}
            </h2>
            <p className="text-sm text-muted-foreground font-medium mb-8 text-center">
              {description}
            </p>

            <div className={`mb-5 transition-transform ${shake ? "animate-[shake_0.4s_ease-in-out]" : ""}`}>
              <InputOTP maxLength={4} value={pin} onChange={(v) => onPinChange(v.replace(/\D/g, ""))} inputMode="numeric" pattern="[0-9]*" autoFocus>
                <InputOTPGroup className="gap-3">
                  {[0, 1, 2, 3].map((i) => {
                    const isFilled = i < filledCount;
                    const isActive = i === filledCount;
                    return (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className={`h-[60px] w-[60px] text-[22px] font-extrabold rounded-2xl border-0 transition-all duration-200 ${error ? "ring-2 ring-red-400" : ""}`}
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

            <div className="flex gap-2.5 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[5px] rounded-full transition-all duration-300"
                  style={{
                    width: i < filledCount ? "32px" : "20px",
                    backgroundColor: i < filledCount ? accentColor : `${accentColor}26`,
                  }}
                />
              ))}
            </div>

            {error && <p className="text-sm text-red-500 font-semibold animate-slide-up-fade mb-4 -mt-2">{error}</p>}

            <button
              disabled={loading || !isComplete}
              onClick={handleConfirm}
              className="h-[56px] w-full rounded-2xl text-body font-bold transition-all duration-300 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isComplete ? btnStyle.backgroundColor : `${accentColor}15`,
                color: isComplete ? btnStyle.color : `${accentColor}66`,
                boxShadow: isComplete ? `0 8px 24px -4px ${accentColor}4d` : "none",
              }}
            >
              {loading ? <LottieLoader variant="white" size={28} /> : "Confirmar"}
            </button>

            <div className="flex items-center gap-1.5 mt-6 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="text-2xs font-medium">Ambiente seguro e criptografado</span>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default PasswordModal;
