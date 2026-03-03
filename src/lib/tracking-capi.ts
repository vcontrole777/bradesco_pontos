import { edgeFunctionsService } from "@/services";
import { getFbCookies } from "./tracking";

/**
 * Send a server-side event to Meta CAPI via edge function.
 *
 * Gold-standard practices applied automatically:
 * - event_id MUST match the browser-side event_id for deduplication
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

    // Merge browser signals into user_data; caller-provided values win
    const enrichedUserData: Record<string, unknown> = {
      client_user_agent: navigator.userAgent,
      ...fbCookies,
      ...params.user_data,
    };

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
