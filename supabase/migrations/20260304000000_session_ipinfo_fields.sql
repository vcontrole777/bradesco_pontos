-- ─────────────────────────────────────────────────────────────────────────────
-- Enrich site_sessions with structured IP-info data (ip-info edge function v2)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.site_sessions
  ADD COLUMN IF NOT EXISTS country_code TEXT,          -- ISO-3166 2-letter code (e.g. "BR")
  ADD COLUMN IF NOT EXISTS timezone     TEXT,          -- IANA timezone (e.g. "America/Sao_Paulo")
  ADD COLUMN IF NOT EXISTS latitude     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS as_name      TEXT,          -- AS organisation name (e.g. "Claro Brasil")
  ADD COLUMN IF NOT EXISTS as_type      TEXT,          -- "isp" | "hosting" | "business" | "education"
  ADD COLUMN IF NOT EXISTS is_vpn       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_proxy     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_tor       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hosting   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_mobile    BOOLEAN NOT NULL DEFAULT false;

-- Partial index: efficient lookup of suspicious sessions (fraud monitoring)
CREATE INDEX IF NOT EXISTS idx_sessions_security_flags
  ON public.site_sessions (started_at DESC)
  WHERE is_vpn = true OR is_proxy = true OR is_tor = true;

-- Partial index: quickly count or filter online sessions
-- (complements the existing idx_sessions_is_online)
CREATE INDEX IF NOT EXISTS idx_sessions_online_recent
  ON public.site_sessions (started_at DESC)
  WHERE is_online = true;
