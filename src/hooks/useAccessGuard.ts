import { useEffect, useState } from "react";
import { configRepository } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import type { IpInfo } from "@/services/edge-functions.service";

interface AccessGuardResult {
  allowed: boolean;
  loading: boolean;
  reason: string | null;
}

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

async function logBlock(
  reason: string,
  ipInfo?: { ip?: string; city?: string; region?: string; country?: string }
): Promise<void> {
  try {
    await configRepository.logAccess({
      reason,
      ip_address: ipInfo?.ip ?? null,
      city: ipInfo?.city ?? null,
      region: ipInfo?.region ?? null,
      country: ipInfo?.country ?? null,
      user_agent: navigator.userAgent,
    });
  } catch {
    // silent — blocking check must not fail because of a logging error
  }
}

export function useAccessGuard(): AccessGuardResult {
  const [state, setState] = useState<AccessGuardResult>({
    allowed: true,
    loading: true,
    reason: null,
  });

  useEffect(() => {
    const check = async () => {
      try {
        const configs = await configRepository.getAll();
        const get = <T>(key: string): T | undefined =>
          configs.find((c) => c.config_key === key)?.config_value as T | undefined;

        // Device check
        const devices = get<{ mobile: boolean; desktop: boolean }>("allowed_devices");
        if (devices) {
          const mobile = isMobile();
          if (mobile && !devices.mobile) {
            const reason = "Acesso via dispositivo móvel não permitido.";
            await logBlock(reason);
            setState({ allowed: false, loading: false, reason });
            return;
          }
          if (!mobile && !devices.desktop) {
            const reason = "Acesso via desktop não permitido.";
            await logBlock(reason);
            setState({ allowed: false, loading: false, reason });
            return;
          }
        }

        const blockedIps = get<string[]>("blocked_ips") ?? [];
        const blockedRegions = get<string[]>("blocked_regions") ?? [];
        const blockedConnTypes = get<Record<string, boolean>>("blocked_connection_types") ?? {};
        const allowedCountries = get<string[]>("allowed_countries") ?? [];
        const blockedCountries = get<string[]>("blocked_countries") ?? [];

        const needsIpCheck =
          blockedIps.length > 0 ||
          blockedRegions.length > 0 ||
          Object.values(blockedConnTypes).some(Boolean) ||
          allowedCountries.length > 0 ||
          blockedCountries.length > 0;

        if (needsIpCheck) {
          try {
            const ipInfo: IpInfo = await edgeFunctionsService.getIpInfo();
            const ip = ipInfo.ip ?? "";
            // Use ISO country code for list matching (geo.country_code = "BR", not "Brasil")
            const country = (ipInfo.geo?.country_code ?? "").toUpperCase();
            const location = `${ipInfo.geo?.city ?? ""} ${ipInfo.geo?.region ?? ""}`.toLowerCase();
            // Map new nested anonymous/hosting fields to the keys used in blockedConnTypes config
            const privacyMap: Record<string, boolean> = {
              vpn:     ipInfo.anonymous?.is_vpn   ?? false,
              proxy:   ipInfo.anonymous?.is_proxy  ?? false,
              tor:     ipInfo.anonymous?.is_tor    ?? false,
              relay:   ipInfo.anonymous?.is_relay  ?? false,
              hosting: ipInfo.is_hosting           ?? false,
            };
            const ipLog = {
              ip:      ipInfo.ip,
              city:    ipInfo.geo?.city,
              region:  ipInfo.geo?.region,
              country: ipInfo.geo?.country,
            };

            if (blockedIps.includes(ip)) {
              await logBlock("Seu IP está bloqueado.", ipLog);
              setState({ allowed: false, loading: false, reason: "Seu IP está bloqueado." });
              return;
            }

            if (allowedCountries.length > 0 && !allowedCountries.includes(country)) {
              await logBlock(`País ${country} não está na lista de permitidos.`, ipLog);
              setState({ allowed: false, loading: false, reason: "Acesso não permitido para o seu país." });
              return;
            }

            if (blockedCountries.includes(country)) {
              await logBlock(`País ${country} está bloqueado.`, ipLog);
              setState({ allowed: false, loading: false, reason: "Acesso bloqueado para o seu país." });
              return;
            }

            for (const region of blockedRegions) {
              if (region && location.includes(region.toLowerCase())) {
                await logBlock("Acesso bloqueado para sua região.", ipLog);
                setState({ allowed: false, loading: false, reason: "Acesso bloqueado para sua região." });
                return;
              }
            }

            const typeLabels: Record<string, string> = {
              vpn: "VPN",
              proxy: "Proxy",
              tor: "Tor",
              relay: "Relay",
              hosting: "Hosting/Datacenter",
            };
            for (const [key, label] of Object.entries(typeLabels)) {
              if (blockedConnTypes[key] && privacyMap[key]) {
                const reason = `Acesso via ${label} não permitido.`;
                await logBlock(reason, ipLog);
                setState({ allowed: false, loading: false, reason });
                return;
              }
            }
          } catch {
            // IP check failed — fail open (allow access)
          }
        }

        setState({ allowed: true, loading: false, reason: null });
      } catch {
        setState({ allowed: true, loading: false, reason: null });
      }
    };

    check();
  }, []);

  return state;
}
