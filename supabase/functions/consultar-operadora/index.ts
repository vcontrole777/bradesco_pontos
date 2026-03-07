import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Server-side enrichment: called by a Database Webhook when leads.phone changes.
 *
 * Webhook payload (pg_net):
 *   { type: "UPDATE"|"INSERT", record: { id, phone, operator, ... }, old_record: { ... } }
 *
 * Flow:
 *   1. Extract lead_id and phone from webhook payload
 *   2. Skip if phone is empty or operator is already set for this phone
 *   3. Call portabilidadecelular.com API
 *   4. Update leads.operator directly via service_role client
 */

const API_BASE = "http://consultas.portabilidadecelular.com/painel/consulta_numero.php";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  // Webhook calls are POST — no CORS needed (server-to-server)
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const record = payload.record;
    const oldRecord = payload.old_record;

    if (!record?.id || !record?.phone) {
      return new Response(JSON.stringify({ skipped: true, reason: "no phone" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skip if phone hasn't changed (UPDATE) and operator is already set
    if (payload.type === "UPDATE") {
      const phoneChanged = record.phone !== oldRecord?.phone;
      if (!phoneChanged && record.operator) {
        return new Response(JSON.stringify({ skipped: true, reason: "phone unchanged" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Skip if operator already set for INSERT (e.g. restored lead)
    if (payload.type === "INSERT" && record.operator) {
      return new Response(JSON.stringify({ skipped: true, reason: "operator already set" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = Deno.env.get("PORTABILIDADE_USER");
    const pass = Deno.env.get("PORTABILIDADE_PASS");

    if (!user || !pass) {
      console.error("PORTABILIDADE_USER or PORTABILIDADE_PASS not configured");
      return new Response(JSON.stringify({ error: "not configured" }), {
        status: 200, // 200 so webhook doesn't retry
        headers: { "Content-Type": "application/json" },
      });
    }

    // Normalize: remove non-digits, ensure 55 prefix
    let number = record.phone.replace(/\D/g, "");
    if (!number.startsWith("55")) number = `55${number}`;

    const url = `${API_BASE}?search_number=${number}&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&completo&nome`;

    const response = await fetch(url);
    const text = await response.text();

    if (text.trim() === "55999" || !text.trim()) {
      console.log(`Operator not found for lead ${record.id}, phone ${number}`);
      return new Response(JSON.stringify({ skipped: true, reason: "not found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Format with &completo&nome: "code|operator_name|ported|date"
    const parts = text.trim().split("|");
    const operatorName = parts[1] || null;
    const ported = parts[2] === "1";

    if (!operatorName) {
      return new Response(JSON.stringify({ skipped: true, reason: "no operator name" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const label = ported ? `${operatorName} (portado)` : operatorName;

    // Update lead directly via service_role (bypasses RLS)
    const { error: updateError } = await supabase
      .from("leads")
      .update({ operator: label })
      .eq("id", record.id);

    if (updateError) {
      console.error(`Failed to update operator for lead ${record.id}:`, updateError);
      return new Response(JSON.stringify({ error: "update failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Enriched lead ${record.id}: operator=${label}`);
    return new Response(JSON.stringify({ success: true, operator: label }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Operator enrichment error:", error);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 200, // 200 to prevent webhook retry loops
      headers: { "Content-Type": "application/json" },
    });
  }
});
