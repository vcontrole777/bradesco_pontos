import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { configRepository } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import { supabase } from "@/integrations/supabase/client";

interface AccessGuardState {
  allowed: boolean;
  loading: boolean;
  reason: string | null;
}

const AccessGuardContext = createContext<AccessGuardState>({
  allowed: true,
  loading: true,
  reason: null,
});

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

async function logBlock(reason: string): Promise<void> {
  try {
    await configRepository.logAccess({
      reason,
      ip_address: null,
      city: null,
      region: null,
      country: null,
      user_agent: navigator.userAgent,
    });
  } catch {
    // silent
  }
}

export function AccessGuardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessGuardState>({
    allowed: true,
    loading: true,
    reason: null,
  });
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    try {
      const configs = await configRepository.getAll();
      const get = <T,>(key: string): T | undefined =>
        configs.find((c) => c.config_key === key)?.config_value as T | undefined;

      // Site offline check (instant, no server call needed)
      const siteOffline = get<boolean>("site_offline");
      if (siteOffline === true) {
        if (mountedRef.current) setState({ allowed: false, loading: false, reason: "Site em manutenção. Tente novamente mais tarde." });
        return;
      }

      // Basic device check (UA only, no IP needed)
      const devices = get<{ mobile: boolean; desktop: boolean }>("allowed_devices");
      const uaMobile = isMobile();
      if (devices) {
        if (uaMobile && !devices.mobile) {
          const reason = "Acesso via dispositivo móvel não permitido.";
          await logBlock(reason);
          if (mountedRef.current) setState({ allowed: false, loading: false, reason });
          return;
        }
        if (!uaMobile && !devices.desktop) {
          const reason = "Acesso via desktop não permitido.";
          await logBlock(reason);
          if (mountedRef.current) setState({ allowed: false, loading: false, reason });
          return;
        }
      }

      // Check if any IP-dependent rules are configured
      const blockedIps = get<string[]>("blocked_ips") ?? [];
      const blockedRegions = get<string[]>("blocked_regions") ?? [];
      const blockedConnTypes = get<Record<string, boolean>>("blocked_connection_types") ?? {};
      const allowedCountries = get<string[]>("allowed_countries") ?? [];
      const blockedCountries = get<string[]>("blocked_countries") ?? [];
      const mobileOnlyMode = devices && devices.mobile && !devices.desktop;

      const needsServerCheck =
        blockedIps.length > 0 ||
        blockedRegions.length > 0 ||
        Object.values(blockedConnTypes).some(Boolean) ||
        allowedCountries.length > 0 ||
        blockedCountries.length > 0 ||
        mobileOnlyMode; // anti-spoofing needs IP

      if (needsServerCheck) {
        try {
          const result = await edgeFunctionsService.checkAccess({
            screen_width: window.screen.width,
          });
          if (!result.allowed) {
            if (mountedRef.current) setState({ allowed: false, loading: false, reason: result.reason ?? "Acesso não permitido." });
            return;
          }
        } catch {
          // Fail-closed if country allowlist is configured
          if (allowedCountries.length > 0) {
            const reason = "Verificação de acesso indisponível.";
            await logBlock(reason);
            if (mountedRef.current) setState({ allowed: false, loading: false, reason });
            return;
          }
        }
      }

      if (mountedRef.current) setState({ allowed: true, loading: false, reason: null });
    } catch {
      if (mountedRef.current) setState({ allowed: true, loading: false, reason: null });
    }
  }, []);

  // Initial check
  useEffect(() => {
    mountedRef.current = true;
    check();
    return () => { mountedRef.current = false; };
  }, [check]);

  // Re-check when access_config changes in real-time
  useEffect(() => {
    const channel = supabase
      .channel("access-guard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "access_config" },
        () => { check(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [check]);

  return (
    <AccessGuardContext.Provider value={state}>
      {children}
    </AccessGuardContext.Provider>
  );
}

export function useAccessGuard(): AccessGuardState {
  return useContext(AccessGuardContext);
}
