import { useState } from "react";
import Lottie from "lottie-react";
import bgAnimation from "@/assets/bg-lottie.json";

const LottiePreview = () => {
  const [frame, setFrame] = useState(0);

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-black">
      {/* Lottie background */}
      <div className="fixed inset-0 overflow-hidden">
        <Lottie
          animationData={bgAnimation}
          loop={false}
          autoplay={false}
          initialSegment={[frame, frame + 1]}
          key={frame}
          rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        />
      </div>

      {/* Controls */}
      <div className="relative z-10 mt-auto w-full bg-black/70 px-6 py-6 backdrop-blur-sm">
        <p className="mb-2 text-center text-2xl font-bold text-white">
          Frame: {frame}
        </p>
        <input
          type="range"
          min={0}
          max={360}
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {[0, 40, 83, 100, 132, 155, 169, 190, 204, 250, 283, 310, 340, 360].map((f) => (
            <button
              key={f}
              onClick={() => setFrame(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                frame === f ? "bg-white text-black" : "bg-white/20 text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LottiePreview;
