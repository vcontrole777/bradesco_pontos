/**
 * In-memory sliding-window rate limiter for Supabase Edge Functions.
 *
 * Deno isolates persist between invocations (warm starts), so a module-level
 * Map keeps counters alive for the duration of the isolate. On cold starts the
 * map is empty — this is acceptable because cold starts are infrequent and the
 * brief window without history is negligible.
 *
 * Usage:
 *   import { rateLimit } from "../_shared/rate-limiter.ts";
 *
 *   const limited = rateLimit("phone:" + phone, 3, 300_000); // 3 per 5 min
 *   if (limited) return limited; // already a 429 Response
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Entry {
  timestamps: number[];
  windowMs: number;
}

const store = new Map<string, Entry>();

// Periodic cleanup every 5 minutes to avoid memory leaks from expired keys
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    const cutoff = now - entry.windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

/**
 * Check rate limit for the given key.
 *
 * @param key     Unique identifier (e.g. "ip:1.2.3.4" or "phone:11999999999")
 * @param limit   Max requests allowed within the window
 * @param windowMs Window duration in milliseconds
 * @returns A 429 Response if rate-limited, or null if allowed
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Response | null {
  cleanup();

  const now = Date.now();
  const cutoff = now - windowMs;
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [], windowMs };
    store.set(key, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const retryAfter = Math.ceil(
      (entry.timestamps[0] + windowMs - now) / 1000,
    );
    return new Response(
      JSON.stringify({
        error: "Muitas requisições. Tente novamente em alguns minutos.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  entry.timestamps.push(now);
  return null;
}

/**
 * Extract the client IP from request headers.
 * Works with Cloudflare (cf-connecting-ip) and standard proxies (x-forwarded-for).
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
