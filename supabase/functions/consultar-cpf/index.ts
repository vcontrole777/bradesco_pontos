import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { rateLimit, getClientIp } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CPF_API_BASE = "http://195.179.229.130:3000/cpf";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit: 10 CPF lookups per minute per IP
    const ip = getClientIp(req);
    const limited = rateLimit(`cpf:${ip}`, 10, 60 * 1000);
    if (limited) return limited;
    const { cpf } = await req.json();

    if (!cpf) {
      return new Response(
        JSON.stringify({ error: "CPF é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cpfClean = cpf.replace(/\D/g, "");

    if (cpfClean.length !== 11) {
      return new Response(
        JSON.stringify({ error: "CPF inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(`${CPF_API_BASE}/${cpfClean}`);
    const data = await response.json();

    if (data.status !== "ok") {
      return new Response(
        JSON.stringify({ error: "CPF não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        nome: data.nome,
        nascimento: data.nascimento,
        cpf: data.cpf,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao consultar CPF" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
