import { useEffect, useState } from "react";
import { configRepository } from "@/repositories";
import { X, AlertTriangle } from "lucide-react";

interface AlertConfig {
  enabled: boolean;
  title: string;
  message: string;
}

interface BannerConfig {
  enabled: boolean;
  message: string;
}

export default function HomeAlertModal() {
  const [modalConfig, setModalConfig] = useState<AlertConfig | null>(null);
  const [bannerConfig, setBannerConfig] = useState<BannerConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);

  useEffect(() => {
    configRepository.getByKeys(["home_alert", "home_banner"]).then((rows) => {
      for (const row of rows) {
        if (row.config_key === "home_alert") {
          const c = row.config_value as unknown as AlertConfig;
          if (c?.enabled) {
            setModalConfig(c);
            setModalOpen(true);
          }
        } else if (row.config_key === "home_banner") {
          const c = row.config_value as unknown as BannerConfig;
          if (c?.enabled) {
            setBannerConfig(c);
            setBannerOpen(true);
          }
        }
      }
    });
  }, []);

  return (
    <>
      {/* Banner fixo no topo */}
      {bannerOpen && bannerConfig && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="bg-livelo-red px-4 py-3 flex items-center gap-3 shadow-lg">
            <AlertTriangle className="h-5 w-5 text-white/90 shrink-0" />
            <p className="flex-1 text-body-sm font-medium text-white leading-snug">
              {bannerConfig.message}
            </p>
            <button
              onClick={() => setBannerOpen(false)}
              className="text-white/70 hover:text-white transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && modalConfig && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setModalOpen(false)} />
          <div className="relative z-50 w-full max-w-[420px] mx-4 mb-4 sm:mb-0 rounded-2xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-[19px] font-bold text-foreground leading-tight pr-8 mb-4">
              {modalConfig.title}
            </h2>

            <p className="text-body text-muted-foreground leading-relaxed mb-8">
              {modalConfig.message}
            </p>

            <button
              onClick={() => setModalOpen(false)}
              className="w-full h-14 rounded-full text-body font-semibold text-white bg-livelo-red shadow-lg transition-all active:scale-[0.98]"
            >
              continuar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
