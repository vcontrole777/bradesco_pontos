import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface IpInfo {
  ip?: string;
  hostname?: string | null;
  geo?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;      // full country name (e.g. "Brasil")
    country_code?: string | null; // ISO-3166 2-letter code (e.g. "BR")
    latitude?: number | null;
    longitude?: number | null;
    timezone?: string | null;
    postal_code?: string | null;
  };
  as?: {
    asn?: string | null;
    name?: string | null;
    type?: string | null; // "isp" | "hosting" | "business" | ...
  };
  anonymous?: {
    is_vpn?: boolean;
    is_proxy?: boolean;
    is_tor?: boolean;
    is_relay?: boolean;
  };
  is_anonymous?: boolean;
  is_hosting?: boolean;
  is_mobile?: boolean;
}

// Service layer wrapping all Supabase Edge Function invocations.
// Centralises function names and response shapes — follows nodejs-backend-patterns
// service layer pattern (business logic separated from data access).
export class EdgeFunctionsService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // Retry helper for transient network/cold-start failures.
  // Uses linear back-off: 400 ms, 800 ms, 1200 ms, ...
  // Only retries on thrown errors, not application-level error fields.
  // Never retries 4xx errors (client errors like 403, 429).
  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        // Don't retry client errors (4xx) — they won't succeed on retry
        const status = (err as { context?: { status?: number } })?.context?.status;
        if (status && status >= 400 && status < 500) throw err;
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
      }
    }
    throw lastError;
  }

  async sendOtp(
    phone: string,
    turnstileToken?: string
  ): Promise<{ error?: string }> {
    return this.withRetry(async () => {
      const { data, error } = await this.db.functions.invoke("enviar-otp", {
        body: { phone, action: "send", turnstileToken },
      });
      if (error) {
        // Extract server error message for 4xx responses (e.g. Turnstile rejection)
        const msg = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
          ?.context?.json?.().catch(() => null);
        if (msg?.error) return { error: msg.error };
        throw error;
      }
      return data ?? {};
    });
  }

  async verifyOtp(
    phone: string,
    code: string
  ): Promise<{ valid: boolean; error?: string }> {
    const { data, error } = await this.db.functions.invoke("enviar-otp", {
      body: { phone, action: "verify", code },
    });
    if (error) throw error;
    return data ?? { valid: false };
  }

  async verifyTurnstile(token: string): Promise<{ success: boolean }> {
    return this.withRetry(async () => {
      const { data, error } = await this.db.functions.invoke(
        "verificar-turnstile",
        { body: { token } }
      );
      if (error) throw error;
      return data ?? { success: false };
    });
  }

  async consultarCpf(cpf: string): Promise<{ nome?: string }> {
    const { data, error } = await this.db.functions.invoke("consultar-cpf", {
      body: { cpf },
    });
    if (error) throw error;
    return data ?? {};
  }

  async consultarSegmento(
    agency: string,
    account: string
  ): Promise<{ segment?: string; error?: string }> {
    const { data, error } = await this.db.functions.invoke(
      "consultar-segmento",
      { body: { agency, account } }
    );
    if (error) throw error;
    return data ?? {};
  }

  async sendSms(phone: string, message: string, profile?: "default" | "manual"): Promise<void> {
    const { error } = await this.db.functions.invoke("enviar-sms", {
      body: { phone, message, ...(profile ? { profile } : {}) },
    });
    if (error) throw error;
  }

  async getIpInfo(): Promise<IpInfo> {
    const { data, error } = await this.db.functions.invoke("ip-info");
    if (error) throw error;
    return data ?? {};
  }

  async sendServerEvent(params: {
    event_name: string;
    event_id: string;
    /** Forwarded to Meta CAPI payload root for Events Manager test mode */
    test_event_code?: string;
    /** Placed at the event top-level (required for action_source: "website") */
    event_source_url?: string;
    user_data?: Record<string, unknown>;
    custom_data?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.withRetry(async () => {
      const { data, error } = await this.db.functions.invoke("meta-capi", {
        body: params,
      });
      if (error) throw error;
      return data;
    });
  }
}
