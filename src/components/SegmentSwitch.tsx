import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { getSegmentButtonColor } from "@/lib/segment-colors";

interface SegmentSwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  segment?: string;
}

const SegmentSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SegmentSwitchProps
>(({ className, segment, checked, ...props }, ref) => {
  const thumbColor = getSegmentButtonColor(segment);

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      checked={checked}
      style={{
        backgroundColor: checked ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)",
      }}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className="pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        style={{
          backgroundColor: checked ? thumbColor : "#ffffff",
        }}
      />
    </SwitchPrimitives.Root>
  );
});
SegmentSwitch.displayName = "SegmentSwitch";

export { SegmentSwitch };
