import Lottie from "lottie-react";
import bgAnimation from "@/assets/bg-lottie.json";
import bgDefault from "@/assets/bg-brada.png";

const SEGMENT_FRAMES: Record<string, number> = {
  PRIME: 169,
  EXCLUSIVE: 276,
  VAREJO: 276,
  PRIVATE: 276,
  AFLUENTE: 276,
  JOVEM: 276,
  UNIVERSITARIO: 276,
};

const DEFAULT_FRAME = 276;

interface Props {
  segment?: string;
}

const LottieBackground = ({ segment }: Props) => {
  const frame = segment ? (SEGMENT_FRAMES[segment] ?? DEFAULT_FRAME) : DEFAULT_FRAME;
  const shouldRotate =
    frame === DEFAULT_FRAME ||
    frame === SEGMENT_FRAMES.PRIME ||
    frame === SEGMENT_FRAMES.EXCLUSIVE ||
    frame === SEGMENT_FRAMES.VAREJO;

  return (
    <>
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <Lottie
          animationData={bgAnimation}
          loop={false}
          autoplay={false}
          initialSegment={[frame, frame + 1]}
          key={frame}
          rendererSettings={{
            preserveAspectRatio: "xMidYMid slice",
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            ...(shouldRotate && { transform: "rotate(180deg)" }),
          }}
        />
      </div>
      <img
        src={bgDefault}
        alt=""
        className="fixed bottom-0 left-0 right-0 w-full pointer-events-none z-[2]"
        style={{ opacity: 0.45, filter: "brightness(0) invert(1)" }}
      />
    </>
  );
};

export default LottieBackground;
