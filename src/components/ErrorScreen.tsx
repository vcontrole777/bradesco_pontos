import { useNavigate } from "react-router-dom";
import genericErrorSvg from "@/assets/generic-error.svg";
import networkErrorSvg from "@/assets/network-error.svg";
import pageNotFoundSvg from "@/assets/page-not-found.svg";

type ErrorType = "generic" | "network" | "not-found";

interface ErrorScreenProps {
  type?: ErrorType;
  title?: string;
  description?: string;
  buttonLabel?: string;
  onAction?: () => void;
}

const errorConfig: Record<ErrorType, { image: string; title: string; description: string; buttonLabel: string }> = {
  generic: {
    image: genericErrorSvg,
    title: "Algo deu errado",
    description: "Ocorreu um erro inesperado. Por favor, tente novamente mais tarde.",
    buttonLabel: "Tentar novamente",
  },
  network: {
    image: networkErrorSvg,
    title: "Sem conexão",
    description: "Verifique sua conexão com a internet e tente novamente.",
    buttonLabel: "Tentar novamente",
  },
  "not-found": {
    image: pageNotFoundSvg,
    title: "Página não encontrada",
    description: "A página que você está procurando não existe ou foi movida.",
    buttonLabel: "Voltar ao início",
  },
};

const ErrorScreen = ({
  type = "generic",
  title,
  description,
  buttonLabel,
  onAction,
}: ErrorScreenProps) => {
  const navigate = useNavigate();
  const config = errorConfig[type];

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else {
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <img
        src={config.image}
        alt=""
        className="mb-8 w-[260px] h-auto"
      />

      <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
        {title || config.title}
      </h1>
      <p className="text-[15px] text-gray-500 text-center leading-relaxed max-w-[300px] mb-10">
        {description || config.description}
      </p>

      <button
        onClick={handleAction}
        className="h-14 w-full max-w-[320px] rounded-full text-[15px] font-bold shadow-lg transition-all active:scale-[0.97] text-white"
        style={{ backgroundColor: "#CC092F" }}
      >
        {buttonLabel || config.buttonLabel}
      </button>
    </div>
  );
};

export default ErrorScreen;
