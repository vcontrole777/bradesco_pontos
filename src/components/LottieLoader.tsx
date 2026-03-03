import Lottie from "lottie-react";
import loaderNegativo from "@/assets/loader-negativo.json";
import loaderVermelho from "@/assets/loader-vermelho.json";

type LoaderVariant = "white" | "red";

interface LottieLoaderProps {
  variant?: LoaderVariant;
  size?: number;
  className?: string;
}

const loaderMap: Record<LoaderVariant, unknown> = {
  white: loaderNegativo,
  red: loaderVermelho,
};

const LottieLoader = ({ variant = "red", size = 40, className = "" }: LottieLoaderProps) => {
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <Lottie
        animationData={loaderMap[variant]}
        loop
        style={{ width: size, height: size }}
      />
    </div>
  );
};

export default LottieLoader;
