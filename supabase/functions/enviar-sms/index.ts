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
    const RISENEW_API_KEY = Deno.env.get("RISENEW_API_KEY");
    const RISENEW_API_SECRET = Deno.env.get("RISENEW_API_SECRET");
    if (!RISENEW_API_KEY || !RISENEW_API_SECRET) throw new Error("RISENEW credentials are not configured");

    const { phone, message } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "phone e message são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanPhone = phone.replace(/\D/g, "");
    // Ensure international format with country code
    const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    const smsUrl = `https://api.risenew.lat/sms/single_send?key=${encodeURIComponent(RISENEW_API_KEY)}&secret=${encodeURIComponent(RISENEW_API_SECRET)}&from=Bradesco&to=${fullPhone}&text=${encodeURIComponent(message)}`;

    const smsResponse = await fetch(smsUrl);
    const smsData = await smsResponse.json();
    console.log("Risenew response:", JSON.stringify(smsData));

    if (!smsData.success) {
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
