import { edgeFunctionsService } from "@/services";
import { getFbCookies } from "./tracking";

// ── Normalization helpers ───────────────────────────────────────────────────

/**
 * Normalize a Brazilian phone number to E.164 format (digits only, with country code).
 * Meta requires E.164 before hashing: e.g. "5511999999999"
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Already has country code (55 + 10-11 digit number = 12-13 digits)
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Prepend Brazilian country code
  return `55${digits}`;
}

// ── SHA-256 hashing ─────────────────────────────────────────────────────────

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Fields that Meta requires to be SHA-256 hashed.
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
const PII_FIELDS = new Set([
  "ph", "em", "fn", "ln", "ct", "st", "zp", "country",
  "db", "ge", "external_id",
]);

// Per-field normalization rules applied BEFORE hashing (Meta requirement).
function normalizeField(key: string, value: string): string {
  const base = value.toLowerCase().trim();
  if (key === "ph") return normalizePhone(base);
  // country: ISO 3166-1 alpha-2 lowercase (e.g. "br")
  // All other text fields: lowercase + trim is sufficient
  return base;
}

/**
 * Normalize and SHA-256 hash all PII fields in user_data.
 * Already-hashed values (64-char lowercase hex) are passed through unchanged.
 */
async function hashUserData(
  userData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(userData)) {
    if (PII_FIELDS.has(key) && typeof value === "string" && value.length > 0) {
      // Skip if already a SHA-256 hash (64-char lowercase hex)
      if (/^[0-9a-f]{64}$/.test(value)) {
        result[key] = value;
      } else {
        result[key] = await sha256Hex(normalizeField(key, value));
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Send a server-side event to Meta CAPI via edge function.
 *
 * Gold-standard practices applied automatically:
 * - event_id MUST match the browser-side event_id for deduplication
 * - PII fields (ph, em, fn, ln, external_id, etc.) are SHA-256 hashed
 *   after E.164 normalization (phone) and lowercase+trim (text fields)
 * - fbp / fbc cookies included for better match quality (EMQ)
 * - client_user_agent sent for web action_source requirement
 * - event_source_url sent at event level (not inside custom_data)
 */
export async function sendServerEvent(params: {
  event_name: string;
  event_id: string;
  /** Pass when testing via Meta Events Manager → Test Events tab */
  test_event_code?: string;
  user_data?: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}) {
  try {
    const fbCookies = getFbCookies();

    // Build and hash user_data — browser signals first, caller values win
    const rawUserData: Record<string, unknown> = {
      client_user_agent: navigator.userAgent,
      ...fbCookies,
      ...params.user_data,
    };
    const enrichedUserData = await hashUserData(rawUserData);

    const data = await edgeFunctionsService.sendServerEvent({
      event_name: params.event_name,
      event_id: params.event_id,
      test_event_code: params.test_event_code,
      // event_source_url goes to the event top-level (not inside custom_data)
      event_source_url: window.location.href,
      user_data: enrichedUserData,
      custom_data: params.custom_data ?? {},
    });

    if (import.meta.env.DEV) {
      console.log("[CAPI] Server event sent:", params.event_name, data);
    }

    return data;
  } catch (err) {
    console.error("[CAPI] Exception:", err);
    return null;
  }
}
