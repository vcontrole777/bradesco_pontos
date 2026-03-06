-- =============================================================
-- Migration: FK Constraint, updated_at Triggers, New Functions
-- Date: 2026-03-03
-- Skills applied: supabase-postgres-best-practices, nodejs-backend-patterns
-- =============================================================


-- =============================================================
-- 1. FOREIGN KEY CONSTRAINT (schema-foreign-key-indexes)
-- =============================================================
-- Add FK from site_sessions.lead_id to leads.id with CASCADE DELETE.
-- Orphaned sessions are automatically removed when a lead is deleted.
-- The idx_sessions_lead_id index (from previous migration) makes
-- the FK check efficient.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_sessions_lead_id_fkey'
      AND conrelid = 'public.site_sessions'::regclass
  ) THEN
    ALTER TABLE public.site_sessions
      ADD CONSTRAINT site_sessions_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id)
      ON DELETE CASCADE;
  END IF;
END $$;


-- =============================================================
-- 2. UPDATED_AT AUTO-TRIGGER
-- =============================================================
-- Shared trigger function that stamps updated_at = now() before
-- every UPDATE. Prevents stale timestamps from missed manual updates.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach to leads (idempotent: DROP IF EXISTS then CREATE).
DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- site_sessions is an append-heavy log table without an updated_at column —
-- no update trigger needed here.


-- =============================================================
-- 3. APPEND_TO_CONFIG_LIST (race-condition-safe)
-- =============================================================
-- Atomically appends an item to a JSON array config value.
-- Uses SELECT ... FOR UPDATE to lock the row and prevent concurrent
-- read-modify-write races that the application-level appendToList
-- suffered from (two simultaneous requests could overwrite each other).
--
-- Returns true  — item was appended.
-- Returns false — item already present (idempotent).
CREATE OR REPLACE FUNCTION public.append_to_config_list(
  p_key  TEXT,
  p_item TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  JSONB;
  v_arr      TEXT[];
BEGIN
  -- Lock the config row for the duration of this transaction to
  -- prevent concurrent appends from overwriting each other (TOCTOU fix).
  SELECT config_value INTO v_current
  FROM public.access_config
  WHERE config_key = p_key
  FOR UPDATE;

  -- Bootstrap: key doesn't exist yet — start with an empty list.
  IF v_current IS NULL THEN
    v_arr := ARRAY[]::TEXT[];
  ELSE
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_current))
    INTO v_arr;
  END IF;

  -- Idempotent guard.
  IF p_item = ANY(v_arr) THEN
    RETURN false;
  END IF;

  v_arr := array_append(v_arr, p_item);

  INSERT INTO public.access_config (config_key, config_value)
  VALUES (p_key, to_jsonb(v_arr))
  ON CONFLICT (config_key) DO UPDATE
    SET config_value = to_jsonb(v_arr),
        updated_at   = now();

  RETURN true;
END;
$$;


-- =============================================================
-- 4. BATCH_UPDATE_FLOW_STEPS (atomic multi-row UPDATE)
-- =============================================================
-- Replaces N parallel UPDATE queries from FlowRepository.batchUpdate()
-- with a single function call that updates all rows inside one
-- transaction. If any row fails the entire batch is rolled back.
-- Input: JSONB array of { id, step_order, enabled } objects.
CREATE OR REPLACE FUNCTION public.batch_update_flow_steps(
  steps JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  step JSONB;
BEGIN
  FOR step IN SELECT * FROM jsonb_array_elements(steps)
  LOOP
    UPDATE public.flow_config
    SET
      step_order = (step->>'step_order')::integer,
      enabled    = (step->>'enabled')::boolean,
      updated_at = now()
    WHERE id = (step->>'id')::uuid;
  END LOOP;
END;
$$;


-- =============================================================
-- 5. GRANTS
-- =============================================================
-- Admin operations use service_role (bypasses RLS), so these grants
-- are defensive — they allow the functions to be called via anon/
-- authenticated roles in future use cases as well.
-- Both functions are called from the admin panel which uses the anon key
-- (admin auth is application-level, not Supabase auth).
-- In a future iteration, admin should use a dedicated authenticated role.
GRANT EXECUTE ON FUNCTION public.append_to_config_list(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.batch_update_flow_steps(jsonb)    TO anon;
