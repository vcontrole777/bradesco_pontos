/**
 * Centralized tracking module for Meta Pixel, Google Analytics/gtag, and DataLayer.
 * All events are pushed to dataLayer and forwarded to Meta/Google when available.
 */

const isDev = import.meta.env.DEV;

// ── DataLayer ──────────────────────────────────────────────
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
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

  window.gtag = function (...args: unknown[]) {
    window.dataLayer.push(Object.fromEntries(args.map((a, i) => [i, a])));
  };
  window.gtag("js", new Date());
  window.gtag("config", googleId);

  if (isDev) console.log("[Tracking] gtag loaded:", googleId);
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
