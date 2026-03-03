-- Add last_seen_at column to site_sessions for heartbeat-based presence tracking.
-- "Online" is defined purely by time: last_seen_at > NOW() - INTERVAL '60 seconds'.
-- This replaces the unreliable is_online boolean as the source of truth for presence.

ALTER TABLE public.site_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Partial index: only indexes active sessions, keeping it small and fast
CREATE INDEX IF NOT EXISTS idx_site_sessions_last_seen
  ON public.site_sessions (last_seen_at DESC);
