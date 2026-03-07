import { createClient } from "jsr:@supabase/supabase-js@2";
import { rateLimit, getClientIp } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const COUNTRY_NAMES: Record<string, string> = {
  BR: "Brasil",       AR: "Argentina",    BO: "Bolívia",      CL: "Chile",
  CO: "Colômbia",     EC: "Equador",      GY: "Guiana",       PY: "Paraguai",
  PE: "Peru",         SR: "Suriname",     UY: "Uruguai",      VE: "Venezuela",
  MX: "México",       CR: "Costa Rica",   CU: "Cuba",         DO: "Rep. Dominicana",
  HN: "Honduras",     PA: "Panamá",       SV: "El Salvador",  GT: "Guatemala",
  US: "Estados Unidos", CA: "Canadá",     DE: "Alemanha",     ES: "Espanha",
  FR: "França",       GB: "Reino Unido",  IT: "Itália",       NL: "Países Baixos",
  PT: "Portugal",     RU: "Rússia",       CN: "China",        JP: "Japão",
  IN: "Índia",        KR: "Coreia do Sul", AU: "Austrália",   ZA: "África do Sul",
  NG: "Nigéria",      AE: "Emirados Árabes", TR: "Turquia",
  SG: "Singapura",    HK: "Hong Kong",    TW: "Taiwan",       TH: "Tailândia",
  MY: "Malásia",      ID: "Indonésia",    PH: "Filipinas",    PK: "Paquistão",
  RO: "Romênia",      PL: "Polônia",      UA: "Ucrânia",      SE: "Suécia",
  CH: "Suíça",        NO: "Noruega",      AT: "Áustria",      BE: "Bélgica",
};

// Module-level Supabase client (reused across warm invocations)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Module-level cache: avoids repeat ipinfo.io calls within same warm isolate
const ipCache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const IP_CACHE_TTL = 120_000; // 2 min

async function fetchIpData(ip: string): Promise<Record<string, unknown>> {
  const cached = ipCache.get(ip);
  if (cached && Date.now() - cached.ts < IP_CACHE_TTL) return cached.data;

  const token = Deno.env.get("IPINFO_TOKEN");
  if (!token) throw new Error("IPINFO_TOKEN not configured");

  const url = ip
    ? `https://ipinfo.io/${ip}/json?token=${token}`
    : `https://ipinfo.io/json?token=${token}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`ipinfo API error: ${res.status}`);

  const data = await res.json();
  ipCache.set(ip, { data, ts: Date.now() });

  // Cleanup stale entries
  for (const [key, val] of ipCache) {
    if (Date.now() - val.ts > IP_CACHE_TTL) ipCache.delete(key);
  }

  return data;
}

// deno-lint-ignore no-explicit-any
function parseIpData(d: any) {
  const orgParts = (d.org ?? "").split(" ");
  const asn = orgParts[0] ?? "";
  const asOrgName = orgParts.slice(1).join(" ");

  const [rawLat, rawLon] = (d.loc ?? ",").split(",");
  const latitude = parseFloat(rawLat) || null;
  const longitude = parseFloat(rawLon) || null;

  const priv = d.privacy ?? {};
  const countryCode = (d.country ?? "").toUpperCase();

  const isMobile =
    d.mobile != null &&
    typeof d.mobile === "object" &&
    Object.keys(d.mobile).length > 0;

  const asType = priv.hosting ? "hosting" : d.bogon ? "bogon" : "isp";

  return {
    ip: d.ip as string,
    city: (d.city ?? null) as string | null,
    region: (d.region ?? null) as string | null,
    country: COUNTRY_NAMES[countryCode] ?? countryCode,
    country_code: countryCode || null,
    latitude,
    longitude,
    timezone: (d.timezone ?? null) as string | null,
    asn: asn || null,
    as_name: asOrgName || null,
    as_type: asType,
    is_vpn: (priv.vpn ?? false) as boolean,
    is_proxy: (priv.proxy ?? false) as boolean,
    is_tor: (priv.tor ?? false) as boolean,
    is_relay: (priv.relay ?? false) as boolean,
    is_hosting: (priv.hosting ?? false) as boolean,
    is_mobile: isMobile,
    // Extra details stored as JSONB (not exposed to frontend)
    details: {
      region_code: (d.region ? (d.region as string).slice(0, 2).toUpperCase() : null),
      postal_code: d.postal ?? null,
      continent: d.continent?.name ?? null,
      continent_code: d.continent?.code ?? null,
      asn: asn || null,
      as_domain: d.company?.domain ?? null,
      as_type: asType,
      mobile_carrier: d.mobile?.name ?? null,
      mobile_mcc: d.mobile?.mcc ?? null,
      mobile_mnc: d.mobile?.mnc ?? null,
      is_relay: priv.relay ?? false,
      is_satellite: d.is_satellite ?? false,
      is_anycast: d.is_anycast ?? false,
      hostname: d.hostname ?? null,
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit: 20 per minute per IP
    const clientIpForLimit = getClientIp(req);
    const limited = rateLimit(`ipinfo:${clientIpForLimit}`, 20, 60_000);
    if (limited) return limited;

    // Real client IP from proxy headers
    const clientIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";

    // Parse request body (optional — supports both GET and POST)
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        /* empty body OK */
      }
    }

    const screenWidth = body.screen_width as number | undefined;
    const leadId = body.lead_id as string | undefined;
    const userAgent =
      (body.user_agent as string | undefined) ??
      req.headers.get("user-agent") ??
      "";

    // ── 1. Fetch IP data ─────────────────────────────────────────────────
    const raw = await fetchIpData(clientIp);
    const info = parseIpData(raw);

    // ── 2. Fetch access_config ───────────────────────────────────────────
    const { data: configs } = await supabase
      .from("access_config")
      .select("config_key, config_value");

    const cfgMap = new Map<string, unknown>();
    for (const c of configs ?? []) {
      cfgMap.set(c.config_key, c.config_value);
    }

    const blockedIps = (cfgMap.get("blocked_ips") ?? []) as string[];
    const blockedRegions = (cfgMap.get("blocked_regions") ?? []) as string[];
    const blockedConnTypes = (cfgMap.get("blocked_connection_types") ??
      {}) as Record<string, boolean>;
    const allowedCountries = (cfgMap.get("allowed_countries") ?? []) as string[];
    const blockedCountries = (cfgMap.get("blocked_countries") ?? []) as string[];
    const devices = cfgMap.get("allowed_devices") as
      | { mobile: boolean; desktop: boolean }
      | undefined;

    // ── 3. Helper: block + log ───────────────────────────────────────────
    const block = async (reason: string, logReason?: string) => {
      try {
        await supabase.from("access_logs").insert({
          reason: logReason ?? reason,
          ip_address: info.ip,
          city: info.city,
          region: info.region,
          country: info.country,
          user_agent: userAgent,
        });
      } catch {
        /* non-fatal */
      }
      return json({ allowed: false, reason });
    };

    // ── 4. Evaluate access rules ─────────────────────────────────────────

    // Anti-spoofing: UA says mobile but screen is desktop-sized and IP is not cellular
    const uaMobile =
      /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent,
      );
    const mobileOnlyMode = devices && devices.mobile && !devices.desktop;

    if (mobileOnlyMode && uaMobile && screenWidth != null) {
      if (screenWidth >= 1024 && !info.is_mobile) {
        return await block(
          "Dispositivo não reconhecido como móvel.",
          `DevTools spoofing detectado (screen=${screenWidth}, ip_mobile=false)`,
        );
      }
    }

    // Blocked IPs
    if (blockedIps.includes(info.ip)) {
      return await block("Seu IP está bloqueado.");
    }

    // Allowed countries (whitelist)
    if (
      allowedCountries.length > 0 &&
      !allowedCountries.includes(info.country_code ?? "")
    ) {
      return await block(
        "Acesso não permitido para o seu país.",
        `País ${info.country_code} não está na lista de permitidos.`,
      );
    }

    // Blocked countries (blacklist)
    if (blockedCountries.includes(info.country_code ?? "")) {
      return await block(
        "Acesso bloqueado para o seu país.",
        `País ${info.country_code} está bloqueado.`,
      );
    }

    // Blocked regions
    const loc = `${info.city ?? ""} ${info.region ?? ""}`.toLowerCase();
    for (const region of blockedRegions) {
      if (region && loc.includes(region.toLowerCase())) {
        return await block("Acesso bloqueado para sua região.");
      }
    }

    // Blocked connection types (VPN, proxy, tor, relay, hosting)
    const typeLabels: Record<string, string> = {
      vpn: "VPN",
      proxy: "Proxy",
      tor: "Tor",
      relay: "Relay",
      hosting: "Hosting/Datacenter",
    };
    const privacyMap: Record<string, boolean> = {
      vpn: info.is_vpn,
      proxy: info.is_proxy,
      tor: info.is_tor,
      relay: info.is_relay,
      hosting: info.is_hosting,
    };
    for (const [key, label] of Object.entries(typeLabels)) {
      if (blockedConnTypes[key] && privacyMap[key]) {
        return await block(`Acesso via ${label} não permitido.`);
      }
    }

    // ── 5. Access allowed — create session if lead_id provided ───────────
    let session_id: string | null = null;

    if (leadId) {
      const isMobileUa = /Mobile|Android|iPhone|iPad/i.test(userAgent);

      const { data: session, error } = await supabase
        .from("site_sessions")
        .insert({
          lead_id: leadId,
          page: "splash",
          user_agent: userAgent,
          ip_address: info.ip,
          city: info.city,
          region: info.region,
          country: info.country,
          org: info.as_name,
          country_code: info.country_code,
          timezone: info.timezone,
          latitude: info.latitude,
          longitude: info.longitude,
          as_name:
            info.asn && info.as_name
              ? `${info.asn} ${info.as_name}`
              : info.as_name,
          as_type: info.as_type,
          ip_details: info.details,
          is_vpn: info.is_vpn,
          is_proxy: info.is_proxy,
          is_tor: info.is_tor,
          is_hosting: info.is_hosting,
          is_mobile: isMobileUa,
        })
        .select("id")
        .single();

      if (error) {
        console.error("Session creation error:", error);
      } else {
        session_id = session?.id ?? null;
      }

      // Save ip_details on the lead (best-effort, non-blocking)
      const leadIpDetails = {
        ip: info.ip,
        city: info.city,
        region: info.region,
        country: info.country,
        country_code: info.country_code,
        timezone: info.timezone,
        latitude: info.latitude,
        longitude: info.longitude,
        asn: info.asn,
        as_name: info.as_name,
        as_type: info.as_type,
        is_vpn: info.is_vpn,
        is_proxy: info.is_proxy,
        is_tor: info.is_tor,
        is_hosting: info.is_hosting,
        is_mobile: isMobileUa,
        ...info.details,
      };

      supabase
        .from("leads")
        .update({ ip_details: leadIpDetails })
        .eq("id", leadId)
        .then(({ error: e }) => {
          if (e) console.error("Lead ip_details update error:", e);
        });
    }

    return json({ allowed: true, session_id });
  } catch (error) {
    console.error("ip-info error:", error);
    return json({ error: "Verificação indisponível" }, 500);
  }
});
