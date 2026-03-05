import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { phone, message, profile } = await req.json();

    // Select credentials based on profile ("manual" uses secondary sender)
    const isManual = profile === "manual";
    const RISENEW_API_KEY    = Deno.env.get(isManual ? "RISENEW_API_KEY_2"    : "RISENEW_API_KEY");
    const RISENEW_API_SECRET = Deno.env.get(isManual ? "RISENEW_API_SECRET_2" : "RISENEW_API_SECRET");
    const RISENEW_SENDER     = Deno.env.get(isManual ? "RISENEW_SENDER_2"     : "RISENEW_SENDER") ?? "Bradesco";
    const RISENEW_API_URL    = Deno.env.get("RISENEW_API_URL");
    if (!RISENEW_API_KEY || !RISENEW_API_SECRET || !RISENEW_API_URL) {
      throw new Error(`RISENEW credentials not configured for profile "${profile ?? "default"}"`);
    }

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "phone e message são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: strip non-digits, remove 55 country code if already present
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("55") && cleanPhone.length > 11) {
      cleanPhone = cleanPhone.slice(2);
    }
    // E.164 format: +55 + DDD + number (e.g. +5511999999999)
    const fullPhone = `+55${cleanPhone}`;

    const smsUrl = `${RISENEW_API_URL}?key=${encodeURIComponent(RISENEW_API_KEY)}&secret=${encodeURIComponent(RISENEW_API_SECRET)}&from=${encodeURIComponent(RISENEW_SENDER)}&to=${encodeURIComponent(fullPhone)}&text=${encodeURIComponent(message)}`;

    const smsResponse = await fetch(smsUrl);
    const smsData = await smsResponse.json().catch(() => ({}));
    console.log("Risenew SMS response [to=%s]:", fullPhone, JSON.stringify(smsData));

    if (!smsResponse.ok || smsData.success === false) {
      return new Response(
        JSON.stringify({ success: false, error: smsData.error || "Erro ao enviar SMS", code: smsData.code }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: smsData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SMS error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
