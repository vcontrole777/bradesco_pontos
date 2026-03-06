import { rateLimit, getClientIp } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Minimal country-code → name lookup (extend as needed).
// Covers countries most commonly seen in Brazil-targeted traffic.
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
  NG: "Nigéria",      AE: "Emirados Árabes", TR: "Turquia",   AR2: "Arábia Saudita",
  SG: "Singapura",    HK: "Hong Kong",    TW: "Taiwan",       TH: "Tailândia",
  MY: "Malásia",      ID: "Indonésia",    PH: "Filipinas",    PK: "Paquistão",
  RO: "Romênia",      PL: "Polônia",      UA: "Ucrânia",      SE: "Suécia",
  CH: "Suíça",        NO: "Noruega",      AT: "Áustria",      BE: "Bélgica",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit: 20 IP lookups per minute per IP
    const clientIpForLimit = getClientIp(req);
    const limited = rateLimit(`ipinfo:${clientIpForLimit}`, 20, 60 * 1000);
    if (limited) return limited;

    const token = Deno.env.get("IPINFO_TOKEN");
    if (!token) throw new Error("IPINFO_TOKEN not configured");

    // Use the real client IP from Cloudflare / proxy headers so the edge
    // function returns the VISITOR's IP, not the Supabase datacenter IP.
    const clientIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";

    const url = clientIp
      ? `https://ipinfo.io/${clientIp}/json?token=${token}`
      : `https://ipinfo.io/json?token=${token}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`ipinfo API error: ${res.status}`);

    const d = await res.json();

    // ── Parse ipinfo.io standard response ─────────────────────────────────────
    // d.org = "AS15169 Google LLC" — split into asn + name
    const orgParts = (d.org ?? "").split(" ");
    const asn  = orgParts[0] ?? "";           // "AS15169"
    const asOrgName = orgParts.slice(1).join(" "); // "Google LLC"

    // d.loc = "37.386,-122.0838"
    const [rawLat, rawLon] = (d.loc ?? ",").split(",");
    const latitude  = parseFloat(rawLat)  || null;
    const longitude = parseFloat(rawLon) || null;

    const priv = d.privacy ?? {};
    const isHosting = priv.hosting ?? false;
    const isVpn     = priv.vpn     ?? false;
    const isProxy   = priv.proxy   ?? false;
    const isTor     = priv.tor     ?? false;
    const isRelay   = priv.relay   ?? false;

    // d.mobile = { network, carrier, ... } when the IP belongs to a mobile carrier
    const isMobile  = d.mobile != null && typeof d.mobile === "object" && Object.keys(d.mobile).length > 0;

    const countryCode = (d.country ?? "").toUpperCase();
    const countryName = COUNTRY_NAMES[countryCode] ?? countryCode;

    // Derive AS type heuristic from privacy flags
    let asType = "isp";
    if (isHosting)            asType = "hosting";
    else if (d.bogon)         asType = "bogon";

    const result = {
      ip:       d.ip,
      hostname: d.hostname ?? null,
      geo: {
        city:         d.city         ?? null,
        region:       d.region       ?? null,
        country:      countryName,
        country_code: countryCode    || null,
        latitude,
        longitude,
        timezone:     d.timezone     ?? null,
        postal_code:  d.postal       ?? null,
      },
      as: {
        asn:    asn      || null,
        name:   asOrgName || null,
        type:   asType,
      },
      anonymous: {
        is_vpn:   isVpn,
        is_proxy: isProxy,
        is_tor:   isTor,
        is_relay: isRelay,
      },
      is_anonymous: isVpn || isProxy || isTor || isRelay,
      is_hosting:   isHosting,
      is_mobile:    isMobile,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ip-info error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
