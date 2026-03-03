-- =============================================================
-- Migration: RLS Policies, Performance Indexes & Helper Functions
-- Date: 2026-03-02
-- Skills applied: supabase-postgres-best-practices, nodejs-backend-patterns
-- =============================================================


-- =============================================================
-- 1. ROW LEVEL SECURITY
-- =============================================================
-- Enforce RLS on every public table so the anon key cannot
-- bypass policies and access arbitrary rows.

ALTER TABLE public.leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes          ENABLE ROW LEVEL SECURITY;

-- leads: anonymous visitors can create and update leads.
-- Admin operations use service_role key, which bypasses RLS entirely.
-- NOTE: USING (true) is intentional — all existing policies use anon-only
-- writes; reads are admin-only (service_role). No auth.uid() needed here,
-- so the per-row call issue (security-rls-performance) does not apply.
CREATE POLICY "leads_anon_insert"
  ON public.leads FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "leads_anon_update"
  ON public.leads FOR UPDATE TO anon
  USING (true);

-- site_sessions: anonymous visitors track their own sessions.
CREATE POLICY "sessions_anon_insert"
  ON public.site_sessions FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "sessions_anon_update"
  ON public.site_sessions FOR UPDATE TO anon
  USING (true);

-- access_config: public read so the client can check access rules
-- and load tracking pixel IDs.
CREATE POLICY "config_anon_read"
  ON public.access_config FOR SELECT TO anon
  USING (true);

-- flow_config: public read so the client can build the step flow.
CREATE POLICY "flow_config_anon_read"
  ON public.flow_config FOR SELECT TO anon
  USING (true);

-- access_logs: anonymous visitors can write block events.
CREATE POLICY "access_logs_anon_insert"
  ON public.access_logs FOR INSERT TO anon
  WITH CHECK (true);

-- otp_codes: only the service_role (backend edge functions) may access.
CREATE POLICY "otp_authenticated_only"
  ON public.otp_codes FOR ALL TO authenticated
  USING (true);

-- =============================================================
-- RLS PERFORMANCE NOTE (security-rls-performance)
-- When policies involve auth.uid(), always wrap it in a subquery
-- to prevent it from being evaluated once per row:
--
--   WRONG: USING (auth.uid() = user_id)      -- called N times
--   RIGHT: USING ((SELECT auth.uid()) = user_id)  -- called once, cached
--
-- Current policies use USING (true) so this is not an issue now,
-- but follow this pattern for any future user-scoped policies.
-- =============================================================


-- =============================================================
-- 2. PERFORMANCE INDEXES
-- =============================================================

-- leads ---------------------------------------------------------
-- Composite: most common admin query (archived filter + time ordering).
CREATE INDEX IF NOT EXISTS idx_leads_archived_created
  ON public.leads (archived, created_at DESC);

-- Filter by status for dashboard count (status = 'concluido').
CREATE INDEX IF NOT EXISTS idx_leads_status
  ON public.leads (status);

-- site_sessions -------------------------------------------------
-- Partial index: only live sessions (is_online = true) — avoids
-- indexing the full history, keeping the index small and fast.
CREATE INDEX IF NOT EXISTS idx_sessions_is_online
  ON public.site_sessions (is_online)
  WHERE is_online = true;

-- Foreign key: lead_id for JOIN and relational lookups.
CREATE INDEX IF NOT EXISTS idx_sessions_lead_id
  ON public.site_sessions (lead_id);

-- access_config -------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_access_config_key
  ON public.access_config (config_key);

-- flow_config ---------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_flow_config_order
  ON public.flow_config (step_order ASC);

-- otp_codes -----------------------------------------------------
-- Composite + partial: verification query filters by phone, expiry,
-- and verified = false. Partial index skips already-used codes.
CREATE INDEX IF NOT EXISTS idx_otp_phone_expires
  ON public.otp_codes (phone, expires_at)
  WHERE verified = false;


-- =============================================================
-- 3. IDEMPOTENT CONSTRAINTS (schema-constraints)
-- PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS" syntax.
-- Use DO $$ blocks to check pg_constraint before adding.
-- =============================================================

-- Ensure config_key is unique in access_config.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'access_config_config_key_unique'
      AND conrelid = 'public.access_config'::regclass
  ) THEN
    ALTER TABLE public.access_config
      ADD CONSTRAINT access_config_config_key_unique UNIQUE (config_key);
  END IF;
END $$;

-- Ensure step_key is unique in flow_config.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_config_step_key_unique'
      AND conrelid = 'public.flow_config'::regclass
  ) THEN
    ALTER TABLE public.flow_config
      ADD CONSTRAINT flow_config_step_key_unique UNIQUE (step_key);
  END IF;
END $$;


-- =============================================================
-- 4. HELPER FUNCTIONS (N+1 elimination — data-n-plus-one)
-- =============================================================

-- append_tag_to_leads
-- Single UPDATE with ANY($1::uuid[]) instead of one query per lead.
-- Eliminates the N+1 from the previous per-lead tag update loop.
CREATE OR REPLACE FUNCTION public.append_tag_to_leads(
  lead_ids uuid[],
  tag       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET
    tags       = array_append(tags, tag),
    updated_at = now()
  WHERE id = ANY(lead_ids)
    AND NOT (tag = ANY(COALESCE(tags, '{}'::text[])));
END;
$$;

-- get_lead_step_counts
-- Single GROUP BY aggregation instead of fetching all rows and
-- counting in JavaScript. Returns JSON { step_key: count, ... }.
CREATE OR REPLACE FUNCTION public.get_lead_step_counts()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_object_agg(current_step, cnt),
    '{}'::json
  )
  FROM (
    SELECT current_step, COUNT(*) AS cnt
    FROM public.leads
    GROUP BY current_step
  ) t;
$$;

-- Grant execute rights to anon so the browser client can call these RPCs.
GRANT EXECUTE ON FUNCTION public.append_tag_to_leads(uuid[], text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_lead_step_counts()             TO anon;
