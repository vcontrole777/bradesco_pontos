import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { configRepository } from "@/repositories";
import { loadMetaPixel, loadGtag, trackPageView } from "@/lib/tracking";

/**
 * Hook that loads tracking scripts from DB config and fires PageView on route changes.
 * Should be called once at the top-level (AppRoutes).
 */
export function useTracking() {
  const location = useLocation();
  const loadedRef = useRef(false);

  // Load tracking scripts once from config
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    configRepository
      .getByKeys(["tracking_meta_pixel", "tracking_google_id"])
      .then((rows) => {
        for (const row of rows) {
          const val = row.config_value as unknown as string;
          if (!val) continue;
          if (row.config_key === "tracking_meta_pixel") loadMetaPixel(val);
          if (row.config_key === "tracking_google_id") loadGtag(val);
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
