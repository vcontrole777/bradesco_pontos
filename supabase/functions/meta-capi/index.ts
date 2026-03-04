import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Keep up to date with the latest stable Graph API version.
const META_API_VERSION = "v22.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      event_name,
      event_id,
      test_event_code,
      event_source_url,   // top-level event field (required for action_source: website)
      user_data,
      custom_data,
    } = body as {
      event_name?: string;
      event_id?: string;
      test_event_code?: string;
      event_source_url?: string;
      user_data?: Record<string, unknown>;
      custom_data?: Record<string, unknown>;
    };

    if (!event_name || !event_id) {
      return new Response(
        JSON.stringify({ error: "event_name and event_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch Pixel ID and Access Token from config table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: configs } = await sb
      .from("access_config")
      .select("config_key, config_value")
      .in("config_key", ["tracking_meta_pixel", "tracking_meta_access_token"]);

    let pixelId = "";
    let accessToken = "";

    if (configs) {
      for (const row of configs) {
        const val = row.config_value as string;
        if (row.config_key === "tracking_meta_pixel") pixelId = val;
        if (row.config_key === "tracking_meta_access_token") accessToken = val;
      }
    }

    if (!pixelId || !accessToken) {
      return new Response(
        JSON.stringify({ error: "Meta Pixel ID or Access Token not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Enrich user_data with server-extracted signals ──────────────────────
    // client_ip_address: Cloudflare passes the real IP in cf-connecting-ip;
    //   fall back to x-forwarded-for first entry as set by other proxies.
    const clientIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined;

    // client_user_agent: required for action_source "website".
    // Caller already forwards the browser UA in user_data — use server header
    // only as fallback so the browser UA always wins.
    const serverUserAgent = req.headers.get("user-agent") ?? undefined;

    // Merge: server-side signals first, caller-provided values win.
    const enrichedUserData: Record<string, unknown> = {
      ...(clientIp ? { client_ip_address: clientIp } : {}),
      ...(serverUserAgent ? { client_user_agent: serverUserAgent } : {}),
      ...(user_data ?? {}),
    };

    // ── Build CAPI event ────────────────────────────────────────────────────
    // event_source_url is a top-level event field (NOT inside custom_data).
    // It is required when action_source is "website".
    const event: Record<string, unknown> = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,           // Matches browser fbq event_id → enables deduplication
      action_source: "website",
      user_data: enrichedUserData,
    };

    if (event_source_url) event.event_source_url = event_source_url;

    // Only include custom_data when non-empty (cleaner payload)
    const customDataEntries = Object.entries(custom_data ?? {});
    if (customDataEntries.length > 0) {
      event.custom_data = custom_data;
    }

    // test_event_code goes at the PAYLOAD root (not inside data[]).
    const payload: Record<string, unknown> = { data: [event] };
    if (test_event_code) payload.test_event_code = test_event_code;

    // Access token in Authorization header instead of query string to avoid
    // leaking it in server access logs.
    const apiUrl = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[meta-capi] events_received=%s fbtrace_id=%s", result?.events_received, result?.fbtrace_id);

    if (!response.ok) {
      console.error("[meta-capi] Meta API error:", JSON.stringify(result));
      return new Response(
        JSON.stringify({ error: "Meta API error", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[meta-capi] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
