import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const NOTIFICATION_SOUND_URL = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdW2Jm5yCZ1lqfX6Xq6N6U0pjgIKbsqyJZVFdfH6VraqMa1Zjfn+VrKmKbVtof4GRpqKIcWNsfIGQo5+GdGhyf4OPn5uBdmx0gIWNm5Z9d3F5g4iOmJJ5d3R9hIuQlI14eHh+hYyRkYt3eXuAhoyQj4l3fH6Bg4mNi4Z4fn+BgoaJiIR6f4GBgYSGhoN8gIGBgYKEhIF+gYGAgIGCgoB/gYGAgICBgYF/gIGAgICAgYB/gICAgICAgIB/gICAgICAgICAgICAgIA=";

export function useLeadNotification() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isFirstLoad = useRef(true);

  const playSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
        audioRef.current.volume = 0.7;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {}
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      isFirstLoad.current = false;
    }, 3000);

    const channel = supabase
      .channel("admin-lead-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          if (isFirstLoad.current) return;
          playSound();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          if (isFirstLoad.current) return;
          const lead = payload.new as { password?: string | null; current_step?: string };
          const old = payload.old as { password?: string | null; current_step?: string };
          if ((lead.password && !old.password) || (lead.current_step === "concluido" && old.current_step !== "concluido")) {
            playSound();
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [playSound]);
}
