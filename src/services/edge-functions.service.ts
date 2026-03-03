import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface IpInfo {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string;
  privacy?: Record<string, boolean>;
}

// Service layer wrapping all Supabase Edge Function invocations.
// Centralises function names and response shapes — follows nodejs-backend-patterns
// service layer pattern (business logic separated from data access).
export class EdgeFunctionsService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // Retry helper for transient network/cold-start failures.
  // Uses linear back-off: 400 ms, 800 ms, 1200 ms, ...
  // Only retries on thrown errors, not application-level error fields.
  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
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
      if (error) throw error;
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

  async sendSms(phone: string, message: string): Promise<void> {
    const { error } = await this.db.functions.invoke("enviar-sms", {
      body: { phone, message },
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
    user_data?: Record<string, unknown>;
    custom_data?: Record<string, unknown>;
  }): Promise<unknown> {
    const { data, error } = await this.db.functions.invoke("meta-capi", {
      body: params,
    });
    if (error) throw error;
    return data;
  }
}
