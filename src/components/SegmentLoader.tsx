import { useFlow } from "@/contexts/FlowContext";
import { getSegmentButtonColor } from "@/lib/segment-colors";

// Dot positions and radii extracted from the original APK loader assets
const DOTS = [
  { cx: 35.847, cy: 24.003, r: 4.154 },
  { cx: 34.288, cy: 11.335, r: 3.635 },
  { cx: 4.933, cy: 12.185, r: 2.856 },
  { cx: 8.613, cy: 33.83, r: 2.285 },
  { cx: 18.634, cy: 37.923, r: 2.078 },
  { cx: 29.224, cy: 35.336, r: 1.818 },
  { cx: 2.597, cy: 23.436, r: 2.6 },
  { cx: 24.751, cy: 3.635, r: 3.635 },
  { cx: 13.933, cy: 3.976, r: 3.375 },
];

interface Props {
  segment?: string;
  size?: number;
  className?: string;
}

const SegmentLoader = ({ segment, size = 40, className = "" }: Props) => {
  const color = getSegmentButtonColor(segment);

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        xmlns="http://www.w3.org/2000/svg"
      >
        {DOTS.map((dot, i) => (
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill={color}
            opacity={0.3}
          >
            <animate
              attributeName="opacity"
              values="0.3;1;0.3"
              dur="1.4s"
              begin={`${i * 0.15}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values={`${dot.r * 0.85};${dot.r};${dot.r * 0.85}`}
              dur="1.4s"
              begin={`${i * 0.15}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
};

export default SegmentLoader;
