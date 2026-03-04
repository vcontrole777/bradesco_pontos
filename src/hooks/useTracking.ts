import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { configRepository } from "@/repositories";
import { loadMetaPixel, loadGtag, trackPageView } from "@/lib/tracking";

/**
 * Hook that loads tracking scripts and fires PageView on route changes.
 * - Meta Pixel ID: read from VITE_META_PIXEL_ID env var (set at build time).
 * - Google ID: read from DB config (tracking_google_id) — non-sensitive, OK in DB.
 * Should be called once at the top-level (AppRoutes).
 */
export function useTracking() {
  const location = useLocation();
  const loadedRef = useRef(false);

  // Load tracking scripts once
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Meta Pixel: use build-time env var (secret moved out of DB)
    const pixelId = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
    if (pixelId) loadMetaPixel(pixelId);

    // Google Analytics: still fetched from DB (non-sensitive Measurement ID)
    configRepository
      .getByKeys(["tracking_google_id"])
      .then((rows) => {
        for (const row of rows) {
          const val = row.config_value as unknown as string;
          if (val && row.config_key === "tracking_google_id") loadGtag(val);
        }
      });
  }, []);

  // Fire PageView on every route change
  useEffect(() => {
    // Skip admin routes
    if (location.pathname.startsWith("/admin")) return;
    trackPageView(location.pathname);
  }, [location.pathname]);
}
