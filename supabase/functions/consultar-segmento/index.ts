import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { rateLimit, getClientIp } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZENROWS_API = "https://api.zenrows.com/v1/";
const BRADESCO_URL = "https://www.ib12.bradesco.com.br/ibpfnovologin/identificacao.jsf";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Rate limit: 10 segment lookups per minute per IP
    const ip = getClientIp(req);
    const limited = rateLimit(`segmento:${ip}`, 10, 60 * 1000);
    if (limited) return limited;
    const ZENROWS_API_KEY = Deno.env.get("ZENROWS_API_KEY");
    if (!ZENROWS_API_KEY) {
      return new Response(JSON.stringify({ error: "ZENROWS_API_KEY not configured" }), { status: 500, headers: json });
    }

    const { agency, account } = await req.json();
    if (!agency || !account) {
      return new Response(JSON.stringify({ error: "Agência e conta são obrigatórios" }), { status: 400, headers: json });
    }

    const digits = account.replace(/\D/g, "");
    const accountNum = digits.slice(0, -1);
    const accountDigit = digits.slice(-1);

    const postBody = new URLSearchParams({
      AGN: agency,
      CTA: accountNum,
      DIGCTA: accountDigit,
      EXTRAPARAMS: "",
      ORIGEM: "101",
    });

    const url = new URL(ZENROWS_API);
    url.searchParams.set("apikey", ZENROWS_API_KEY);
    url.searchParams.set("url", BRADESCO_URL);
    url.searchParams.set("antibot", "true");
    url.searchParams.set("premium_proxy", "true");
    url.searchParams.set("proxy_country", "br");
    url.searchParams.set("custom_headers", "true");
    url.searchParams.set("wait", "5000");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35_000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://banco.bradesco/",
          "Origin": "https://banco.bradesco",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        body: postBody.toString(),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if ((fetchErr as Error).name === "AbortError") {
        return new Response(
          JSON.stringify({ error: "TIMEOUT" }),
          { status: 504, headers: json }
        );
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const html = await response.text();
    console.log(`[segmento] status=${response.status} html_length=${html.length} agency=${agency} account=${account}`);

    // Detect segment from actual banner elements (class attribute on real elements)
    let segment = "NAO_IDENTIFICADO";
    const banners = [
      ["banner-exclusive", "EXCLUSIVE"],
      ["banner-private", "PRIVATE"],
      ["banner-prime", "PRIME"],
      ["banner-jovem", "JOVEM"],
      ["banner-varejo", "VAREJO"],
      ["banner-afluente", "AFLUENTE"],
      ["banner-universitario", "UNIVERSITARIO"],
    ] as const;

    // Match class="...banner-xxx..." on actual HTML elements, not in CSS/JS
    for (const [css, name] of banners) {
      const regex = new RegExp(`class="[^"]*${css}[^"]*"`, "i");
      if (regex.test(html)) {
        segment = name;
        break;
      }
    }

    // Debug: log all banner class matches
    const bannerMatches = html.match(/class="[^"]*banner-[^"]*"/gi) || [];
    console.log(`[segmento] banner class matches: ${JSON.stringify(bannerMatches.slice(0, 5))}`);

    // Detect errors - only if the avisoodentificacaoValidado div has actual content
    let error = "";
    const avisoMatch = html.match(/id="avisoodentificacaoValidado"[^>]*>([\s\S]*?)<\/div>/);
    const avisoContent = avisoMatch ? avisoMatch[1].trim() : "";
    const hasCentroBox = avisoContent.length > 0;

    function decodeEntities(s: string): string {
      return s
        .replace(/&aacute;/gi, "á").replace(/&Aacute;/gi, "Á")
        .replace(/&eacute;/gi, "é").replace(/&Eacute;/gi, "É")
        .replace(/&iacute;/gi, "í").replace(/&Iacute;/gi, "Í")
        .replace(/&oacute;/gi, "ó").replace(/&Oacute;/gi, "Ó")
        .replace(/&uacute;/gi, "ú").replace(/&Uacute;/gi, "Ú")
        .replace(/&atilde;/gi, "ã").replace(/&otilde;/gi, "õ")
        .replace(/&ecirc;/gi, "ê").replace(/&ccedil;/gi, "ç")
        .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))))
        .replace(/&amp;/gi, "&");
    }

    if (hasCentroBox) {
      const decoded = decodeEntities(avisoContent);
      const plainText = decoded.replace(/<[^>]+>/g, " ");
      console.log(`[segmento] centroBox text: "${plainText.trim()}"`);

      if (/senha\s+(de\s+)?\d+\s+d[ií]gitos?\s+cancelada/i.test(plainText)) {
        error = "SENHA_CANCELADA";
      } else if (/d[ií]gito\s+(da\s+)?(conta\s+)?inv[aá]lid/i.test(plainText)) {
        error = "DIGITO_INVALIDO";
      } else if (/conta\s+inv[aá]lid/i.test(plainText)) {
        error = "CONTA_INVALIDA";
      } else if (/ag[eê]ncia\s+inv[aá]lid/i.test(plainText)) {
        error = "AGENCIA_INVALIDA";
      } else {
        error = "CONTA_RESTRITA";
      }
    } else if (html.length < 1000) {
      error = "FALHA_VALIDACAO";
    } else if (segment === "NAO_IDENTIFICADO") {
      // Large HTML but no banner found = invalid account
      error = "CONTA_INVALIDA";
    }

    console.log(`[segmento] result: segment=${segment} error="${error}" hasCentroBox=${hasCentroBox}`);

    return new Response(JSON.stringify({ segment, agency, account, error }), { headers: json });
  } catch (err) {
    console.error("[segmento] exception:", err);
    return new Response(JSON.stringify({ error: "Erro ao consultar segmento" }), { status: 500, headers: json });
  }
});
