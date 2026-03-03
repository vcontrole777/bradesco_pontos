/**
 * Centralized tracking module for Meta Pixel, Google Analytics/gtag, and DataLayer.
 * All events are pushed to dataLayer and forwarded to Meta/Google when available.
 */

const isDev = import.meta.env.DEV;

// ── DataLayer ──────────────────────────────────────────────
declare global {
  interface Window {
    // dataLayer accepts both plain objects (GTM events) and IArguments (gtag calls)
    dataLayer: unknown[];
    fbq: (...args: unknown[]) => void;
    gtag: (...args: unknown[]) => void;
    _fbq_loaded?: boolean;
    _gtag_loaded?: boolean;
  }
}

window.dataLayer = window.dataLayer || [];

function pushDataLayer(event: string, params?: Record<string, unknown>) {
  const payload = { event, ...params };
  window.dataLayer.push(payload);
  if (isDev) console.log("[Tracking:dataLayer]", payload);
}

// ── Script loaders ─────────────────────────────────────────
export function loadMetaPixel(pixelId: string) {
  if (!pixelId || window._fbq_loaded) return;
  window._fbq_loaded = true;

  // fbq stub
  const noop = function (...args: unknown[]) {
    (noop as any).queue.push(args);
  } as any;
  noop.queue = [] as unknown[];
  noop.loaded = true;
  noop.version = "2.0";
  window.fbq = noop;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");

  if (isDev) console.log("[Tracking] Meta Pixel loaded:", pixelId);
}

export function loadGtag(googleId: string) {
  if (!googleId || window._gtag_loaded) return;
  window._gtag_loaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${googleId}`;
  document.head.appendChild(script);

  // Must be a regular function (not arrow) so `arguments` is preserved.
  // GA4's dataLayer processor specifically expects IArguments objects from gtag calls.
  // eslint-disable-next-line prefer-arrow-callback
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", googleId);

  if (isDev) console.log("[Tracking] gtag loaded:", googleId);
}

// ── Meta cookie helpers (gold-standard CAPI enrichment) ────
function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Returns fbp / fbc cookies if present.
 * fbp  = Meta Pixel browser ID  (_fbp cookie, set by fbevents.js)
 * fbc  = Click ID               (_fbc cookie, set when fbclid is in URL)
 * Include these in user_data when sending CAPI events for better match quality.
 */
export function getFbCookies(): { fbp?: string; fbc?: string } {
  const fbp = getCookie("_fbp");
  const fbc = getCookie("_fbc") || getFbcFromUrl();
  return {
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
  };
}

function getFbcFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  if (!fbclid) return "";
  // Build fbc from fbclid: fb.1.<timestamp>.<fbclid>
  return `fb.1.${Date.now()}.${fbclid}`;
}

// ── Utility ────────────────────────────────────────────────
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Public Event API ───────────────────────────────────────

export function trackPageView(path: string) {
  pushDataLayer("PageView", { page_path: path });
  if (window.fbq) window.fbq("track", "PageView");
  if (window.gtag) window.gtag("event", "page_view", { page_path: path });
}

export function trackLead(params?: Record<string, unknown>) {
  const eventId = generateEventId();
  const payload = { ...params, event_id: eventId };
  pushDataLayer("Lead", payload);
  if (window.fbq) window.fbq("track", "Lead", payload, { eventID: eventId });
  if (window.gtag) window.gtag("event", "generate_lead", payload);
  if (isDev) console.log("[Tracking:Lead]", payload);
  return eventId;
}

export function trackCompleteRegistration(params?: Record<string, unknown>) {
  const eventId = generateEventId();
  const payload = { ...params, event_id: eventId };
  pushDataLayer("CompleteRegistration", payload);
  if (window.fbq) window.fbq("track", "CompleteRegistration", payload, { eventID: eventId });
  if (window.gtag) window.gtag("event", "sign_up", payload);
  if (isDev) console.log("[Tracking:CompleteRegistration]", payload);
  return eventId;
}

export function trackCustomEvent(eventName: string, params?: Record<string, unknown>) {
  const eventId = generateEventId();
  const payload = { ...params, event_id: eventId };
  pushDataLayer(eventName, payload);
  if (window.fbq) window.fbq("trackCustom", eventName, payload, { eventID: eventId });
  if (window.gtag) window.gtag("event", eventName, payload);
  if (isDev) console.log(`[Tracking:${eventName}]`, payload);
  return eventId;
}
