/**
 * Unified Meta tracking module — Browser Pixel + Conversions API (CAPI).
 *
 * Design principles (analytics-tracking + nodejs-backend-patterns skills):
 *  1. Single source of truth — one file owns all tracking logic.
 *  2. Deduplication — every event carries a shared event_id used by both
 *     the browser pixel (fbq) and CAPI so Meta counts it only once.
 *  3. Fire-and-forget CAPI — server events never block the UI flow.
 *     Errors are logged but do not propagate to the caller.
 *  4. Privacy-first — all PII is SHA-256 hashed after normalization
 *     (E.164 for phone, lowercase+trim for text) before leaving the browser.
 *  5. Resilience — pixel events are queued internally if fbevents.js has not
 *     loaded yet; the queue is flushed once the pixel initialises.
 *  6. No unnecessary abstractions — env vars are explicit, no DI container.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Standard Meta Pixel / CAPI event names used in this flow. */
export type MetaEventName =
  | "PageView"
  | "Lead"
  | "CompleteRegistration"
  | "ViewContent"
  | "InitiateCheckout";

/**
 * PII fields that callers can pass.
 * All values are normalized and SHA-256 hashed automatically before sending.
 */
export interface UserData {
  /** Phone in any format — normalized to E.164 (BR) + hashed. */
  ph?: string;
  /** Email — lowercased, trimmed, then hashed. */
  em?: string;
  /** First name — lowercased, trimmed, then hashed. */
  fn?: string;
  /** Last name — lowercased, trimmed, then hashed. */
  ln?: string;
  /** Stable user identifier (e.g. hashed CPF). Hashed if not already. */
  external_id?: string;
  /** City (lowercase). */
  ct?: string;
  /** State / region (lowercase 2-char code). */
  st?: string;
  /** Zip/postal code (digits only). */
  zp?: string;
  /** Country (ISO 3166-1 alpha-2 lowercase, e.g. "br"). */
  country?: string;
}

export interface TrackEventOptions {
  /** Passed to custom_data — e.g. { content_name: "inicio_form" }. */
  customData?: Record<string, unknown>;
  /** PII to include in CAPI user_data (will be hashed automatically). */
  userData?: UserData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: SHA-256 hashing with in-memory cache
// ─────────────────────────────────────────────────────────────────────────────

const _hashCache = new Map<string, string>();

async function sha256(raw: string): Promise<string> {
  if (_hashCache.has(raw)) return _hashCache.get(raw)!;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  _hashCache.set(raw, hex);
  return hex;
}

const ALREADY_HASHED = /^[0-9a-f]{64}$/;

/** Normalize a Brazilian phone to E.164 digits before hashing. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Already has country code: 55 + 10–11 digit number = 12–13 digits
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

/**
 * Hash a single PII value.
 * Applies field-specific normalization before SHA-256.
 * Returns the value unchanged if it is already a 64-char hex hash.
 */
async function hashField(key: keyof UserData, value: string): Promise<string> {
  if (!value || ALREADY_HASHED.test(value)) return value;
  const normalized =
    key === "ph"
      ? normalizePhone(value)
      : value.toLowerCase().trim();
  return sha256(normalized);
}

/** Hash all PII fields in a UserData object. */
async function hashUserData(
  raw: UserData,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    (Object.entries(raw) as [keyof UserData, string][])
      .filter(([, v]) => typeof v === "string" && v.length > 0)
      .map(async ([k, v]) => [k, await hashField(k, v)] as const),
  );
  return Object.fromEntries(entries);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Event ID generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a unique event ID shared by the browser pixel and CAPI call.
 * Format: <unix-ms>-<7-char random> — collision-resistant for this use case.
 */
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: DataLayer (GTM)
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    dataLayer: unknown[];
    fbq: (...args: unknown[]) => void;
    _fbq: (...args: unknown[]) => void;
    gtag: (...args: unknown[]) => void;
    _fbq_loaded?: boolean;
    _gtag_loaded?: boolean;
  }
}

// Initialize dataLayer at module load (safe — no localStorage access).
window.dataLayer = window.dataLayer || [];

function pushDataLayer(event: string, params?: Record<string, unknown>): void {
  const payload = { event, ...params };
  window.dataLayer.push(payload);
  if (import.meta.env.DEV) {
    console.log("[Tracking:GTM]", payload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Browser pixel (fbq) with pre-init queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queue for fbq calls made before loadMetaPixel() runs.
 * Flushed in order after fbq("init") so the sequence is always:
 *   init → queued events → future events.
 */
const _pendingFbq: Array<unknown[]> = [];

function fbq(...args: unknown[]): void {
  if (window.fbq) {
    window.fbq(...args);
  } else {
    _pendingFbq.push(args);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Meta cookie helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1]) : "";
}

function getFbcFromUrl(): string {
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : "";
}

/** Returns _fbp and _fbc browser cookies for CAPI enrichment. */
function getFbCookies(): { fbp?: string; fbc?: string } {
  const fbp = getCookie("_fbp");
  const fbc = getCookie("_fbc") || getFbcFromUrl();
  return {
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: CAPI — fire-and-forget server event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a server-side event to Meta CAPI via the Supabase edge function.
 *
 * nodejs-backend-patterns: this is intentionally fire-and-forget.
 * The caller does NOT await this function. Errors are logged but never
 * propagate — a CAPI failure must never break the user flow.
 *
 * The edge function is responsible for:
 *  - Fetching Pixel ID + Access Token from the DB
 *  - Enriching user_data with client_ip_address from request headers
 *  - Placing event_source_url at the event top-level (not inside custom_data)
 */
async function dispatchCapi(
  eventName: MetaEventName,
  eventId: string,
  hashedUserData: Record<string, string>,
  customData?: Record<string, unknown>,
): Promise<void> {
  try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    if (!SUPABASE_URL || !ANON_KEY) return;

    const body = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: window.location.href,
      user_data: {
        client_user_agent: navigator.userAgent,
        ...getFbCookies(),
        ...hashedUserData,
      },
      ...(customData && Object.keys(customData).length > 0
        ? { custom_data: customData }
        : {}),
    };

    // Use fetch directly — no retry, no blocking, no extra abstraction.
    // If Meta CAPI is down, we log and move on. The browser pixel already
    // recorded the event on the client side.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-capi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok && import.meta.env.DEV) {
      const err = await res.json().catch(() => ({}));
      console.warn("[CAPI] Non-OK response:", res.status, err);
    }
  } catch (err) {
    // Never throw — CAPI is non-critical. Log in dev, silent in prod.
    if (import.meta.env.DEV) {
      console.warn("[CAPI] Failed to send event:", eventName, err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Script loaders (called once by useTracking hook)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialises the Meta Pixel (fbevents.js) and flushes any queued events.
 * Safe to call multiple times — no-ops after first successful load.
 */
export function loadMetaPixel(pixelId: string): void {
  if (!pixelId || window._fbq_loaded) return;
  window._fbq_loaded = true;

  // Standard Meta fbq stub — window.fbq and window._fbq must point to the
  // same object so fbevents.js recognises it and upgrades in-place.
  const stub = function (...args: unknown[]) {
    (stub as any).queue.push(args);
  } as any;
  stub.push    = stub;
  stub.loaded  = true;
  stub.version = "2.0";
  stub.queue   = [] as unknown[];
  window.fbq   = stub;
  if (!window._fbq) window._fbq = stub;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");

  // Flush events that fired before the pixel was ready.
  _pendingFbq.forEach((args) => window.fbq(...args));
  _pendingFbq.length = 0;

  if (import.meta.env.DEV) {
    console.log("[Tracking] Meta Pixel loaded:", pixelId);
  }
}

/**
 * Initialises Google Analytics 4 (gtag.js).
 * Safe to call multiple times — no-ops after first successful load.
 */
export function loadGtag(googleId: string): void {
  if (!googleId || window._gtag_loaded) return;
  window._gtag_loaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${googleId}`;
  document.head.appendChild(script);

  // Regular function (not arrow) — GA4 requires IArguments objects.
  // eslint-disable-next-line prefer-arrow-callback
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", googleId);

  if (import.meta.env.DEV) {
    console.log("[Tracking] gtag loaded:", googleId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Event API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks a PageView.
 * Browser-only — no CAPI call (Meta deduplicates PageViews automatically).
 */
export function trackPageView(path: string): void {
  pushDataLayer("PageView", { page_path: path });
  fbq("track", "PageView");
  if (window.gtag) window.gtag("event", "page_view", { page_path: path });
}

/**
 * Tracks a Lead event on both the browser pixel and CAPI simultaneously.
 *
 * The same event_id is sent to both channels so Meta deduplicates correctly.
 * CAPI dispatch is fire-and-forget — it never blocks the caller.
 *
 * @returns The event_id shared between browser and server events.
 */
export function trackLead(
  opts: TrackEventOptions = {},
): string {
  const eventId = generateEventId();
  const payload = { event_id: eventId, ...opts.customData };

  // 1. DataLayer (GTM)
  pushDataLayer("Lead", payload);

  // 2. Browser Pixel — deduplication key is eventID
  fbq("track", "Lead", opts.customData ?? {}, { eventID: eventId });
  if (window.gtag) window.gtag("event", "generate_lead", payload);

  // 3. CAPI — fire-and-forget, runs in background
  if (opts.userData) {
    hashUserData(opts.userData).then((hashed) =>
      dispatchCapi("Lead", eventId, hashed, opts.customData),
    );
  } else {
    dispatchCapi("Lead", eventId, {}, opts.customData);
  }

  if (import.meta.env.DEV) console.log("[Tracking] Lead", { eventId, ...opts });
  return eventId;
}

/**
 * Tracks a CompleteRegistration event on both browser pixel and CAPI.
 * CAPI dispatch is fire-and-forget — it never blocks the caller.
 *
 * @returns The event_id shared between browser and server events.
 */
export function trackCompleteRegistration(
  opts: TrackEventOptions = {},
): string {
  const eventId = generateEventId();
  const payload = { event_id: eventId, ...opts.customData };

  // 1. DataLayer (GTM)
  pushDataLayer("CompleteRegistration", payload);

  // 2. Browser Pixel
  fbq("track", "CompleteRegistration", opts.customData ?? {}, { eventID: eventId });
  if (window.gtag) window.gtag("event", "sign_up", payload);

  // 3. CAPI — fire-and-forget
  if (opts.userData) {
    hashUserData(opts.userData).then((hashed) =>
      dispatchCapi("CompleteRegistration", eventId, hashed, opts.customData),
    );
  } else {
    dispatchCapi("CompleteRegistration", eventId, {}, opts.customData);
  }

  if (import.meta.env.DEV) console.log("[Tracking] CompleteRegistration", { eventId, ...opts });
  return eventId;
}

/**
 * Tracks a custom event on both browser pixel and CAPI.
 * CAPI dispatch is fire-and-forget — it never blocks the caller.
 *
 * @returns The event_id shared between browser and server events.
 */
export function trackCustomEvent(
  eventName: string,
  opts: TrackEventOptions = {},
): string {
  const eventId = generateEventId();
  const payload = { event_id: eventId, ...opts.customData };

  pushDataLayer(eventName, payload);
  fbq("trackCustom", eventName, opts.customData ?? {}, { eventID: eventId });
  if (window.gtag) window.gtag("event", eventName, payload);

  if (opts.userData) {
    hashUserData(opts.userData).then((hashed) =>
      dispatchCapi(eventName as MetaEventName, eventId, hashed, opts.customData),
    );
  } else {
    dispatchCapi(eventName as MetaEventName, eventId, {}, opts.customData);
  }

  if (import.meta.env.DEV) console.log(`[Tracking] ${eventName}`, { eventId, ...opts });
  return eventId;
}
