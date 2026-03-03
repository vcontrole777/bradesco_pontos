import registerErrorSvg from "@/assets/register-error.svg";

interface AccountErrorScreenProps {
  title: string;
  description: string;
  onDismiss: () => void;
  segment?: string;
}

const AccountErrorScreen = ({
  title,
  description,
  onDismiss,
}: AccountErrorScreenProps) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-fade-in">
      {/* Header */}
      <div className="flex items-center h-14 px-4" style={{ backgroundColor: "#f31d5d" }}>
        <button
          onClick={onDismiss}
          className="text-white/80 hover:text-white transition-colors"
          aria-label="Voltar"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="flex-1 text-center text-body font-bold text-white pr-6">
          Acesso à conta
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <img src={registerErrorSvg} alt="" className="w-[260px] h-auto mb-8" />

        <h2 className="text-xl font-bold text-foreground text-center mb-2">
          {title}
        </h2>
        <p className="text-body text-muted-foreground text-center leading-relaxed max-w-[300px]">
          {description}
        </p>
      </div>

      {/* Bottom button */}
      <div className="px-6 pb-8 pt-4">
        <button
          onClick={onDismiss}
          className="h-14 w-full rounded-full text-body font-bold shadow-lg transition-all active:scale-[0.97] text-white"
          style={{ backgroundColor: "#f31d5d" }}
        >
          Ok, entendi
        </button>
      </div>
    </div>
  );
};

export default AccountErrorScreen;
