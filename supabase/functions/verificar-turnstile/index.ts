import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rateLimit, getClientIp } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit: 10 Turnstile verifications per minute per IP
    const ip = getClientIp(req);
    const limited = rateLimit(`turnstile:${ip}`, 10, 60 * 1000);
    if (limited) return limited;
    const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");

    // Fail-closed: if no secret configured, reject (never silently pass)
    if (!TURNSTILE_SECRET) {
      console.warn("TURNSTILE_SECRET_KEY not configured — rejecting request (fail-closed)");
      return new Response(
        JSON.stringify({ success: false, error: "Verificação de segurança indisponível." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Token de verificação obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token }),
      }
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      console.warn("Turnstile verification failed:", verifyData["error-codes"]);
      return new Response(
        JSON.stringify({ success: false, error: "Verificação de segurança inválida. Tente novamente." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verificar-turnstile error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
