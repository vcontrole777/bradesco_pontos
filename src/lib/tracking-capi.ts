import { edgeFunctionsService } from "@/services";
import { getFbCookies } from "./tracking";

// ── SHA-256 hashing for CAPI PII fields ────────────────────────────────────
// Meta requires all customer PII (ph, em, fn, ln, etc.) to be SHA-256 hashed
// before sending to the Conversions API.
async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Fields that Meta requires to be SHA-256 hashed.
const PII_FIELDS = new Set(["ph", "em", "fn", "ln", "ct", "st", "zp", "country", "db", "ge", "external_id"]);

// Hash all PII string fields in user_data; skip non-string values and already-hashed values.
async function hashUserData(
  userData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(userData)) {
    if (PII_FIELDS.has(key) && typeof value === "string" && value.length > 0) {
      // Skip if already looks like a SHA-256 hash (64-char lowercase hex)
      result[key] = /^[0-9a-f]{64}$/.test(value) ? value : await sha256Hex(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Send a server-side event to Meta CAPI via edge function.
 *
 * Gold-standard practices applied automatically:
 * - event_id MUST match the browser-side event_id for deduplication
 * - PII fields (ph, em, etc.) are SHA-256 hashed automatically
 * - fbp / fbc cookies enriched for better match quality
 * - client_user_agent sent from browser
 * - event_source_url set to the current page
 * - test_event_code forwarded when provided (for Events Manager testing)
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

    // Merge browser signals first, then hash PII from caller-provided data
    const rawUserData: Record<string, unknown> = {
      client_user_agent: navigator.userAgent,
      ...fbCookies,
      ...params.user_data,
    };
    const enrichedUserData = await hashUserData(rawUserData);

    // Merge event_source_url into custom_data; caller-provided values win
    const enrichedCustomData: Record<string, unknown> = {
      event_source_url: window.location.href,
      ...params.custom_data,
    };

    const data = await edgeFunctionsService.sendServerEvent({
      event_name: params.event_name,
      event_id: params.event_id,
      test_event_code: params.test_event_code,
      user_data: enrichedUserData,
      custom_data: enrichedCustomData,
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
