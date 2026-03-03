import { edgeFunctionsService } from "@/services";

/**
 * Send a server-side event to Meta CAPI via edge function.
 * The event_id MUST match the browser-side event_id for deduplication.
 */
export async function sendServerEvent(params: {
  event_name: string;
  event_id: string;
  user_data?: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}) {
  try {
    const data = await edgeFunctionsService.sendServerEvent(params);

    if (import.meta.env.DEV) {
      console.log("[CAPI] Server event sent:", params.event_name, data);
    }

    return data;
  } catch (err) {
    console.error("[CAPI] Exception:", err);
    return null;
  }
}
