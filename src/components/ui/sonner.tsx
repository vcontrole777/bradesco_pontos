import { Toaster as Sonner, toast } from "sonner";
import { CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast flex items-start gap-3 rounded-lg border-l-4 bg-white px-4 py-3 shadow-xl ring-1 ring-black/5",
          title: "text-sm font-semibold text-zinc-900",
          description: "text-sm text-zinc-500",
          success: "border-l-emerald-500",
          error: "border-l-red-500",
          info: "border-l-blue-500",
          warning: "border-l-amber-500",
          actionButton:
            "bg-zinc-900 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800",
          cancelButton:
            "bg-zinc-100 text-zinc-600 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-zinc-200",
          closeButton:
            "text-zinc-400 hover:text-zinc-600 transition-colors",
        },
      }}
      icons={{
        success: <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />,
        error: <XCircle className="h-5 w-5 text-red-500 shrink-0" />,
        info: <Info className="h-5 w-5 text-blue-500 shrink-0" />,
        warning: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
      }}
      duration={3500}
      gap={8}
      {...props}
    />
  );
};

export { Toaster, toast };
