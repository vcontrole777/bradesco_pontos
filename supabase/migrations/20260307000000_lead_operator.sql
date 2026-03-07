-- =============================================================
-- 1. Add operator column to leads table
-- =============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS operator text;

-- =============================================================
-- 2. Trigger function: calls consultar-operadora edge function
--    via pg_net when phone is inserted/updated.
--    Uses supabase_functions_internal schema for webhook dispatch.
-- =============================================================

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.enrich_lead_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _url    text;
  _key    text;
  _payload jsonb;
BEGIN
  -- Skip if phone is empty
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    RETURN NEW;
  END IF;

  -- Skip if phone hasn't changed (on UPDATE) and operator is already set
  IF TG_OP = 'UPDATE' THEN
    IF NEW.phone = OLD.phone AND NEW.operator IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Build webhook payload (same shape Supabase webhooks use)
  _payload := jsonb_build_object(
    'type', TG_OP,
    'record', row_to_json(NEW)::jsonb,
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb ELSE NULL END
  );

  -- Use SUPABASE_URL env var + service_role key for internal call
  _url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/consultar-operadora';
  _key := current_setting('app.settings.service_role_key', true);

  -- Fire-and-forget HTTP POST via pg_net
  PERFORM net.http_post(
    url     := _url,
    body    := _payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key
    )
  );

  RETURN NEW;
END;
$$;

-- =============================================================
-- 3. Trigger: fires on INSERT or UPDATE of phone column
-- =============================================================
DROP TRIGGER IF EXISTS trg_enrich_lead_operator ON public.leads;

CREATE TRIGGER trg_enrich_lead_operator
  AFTER INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enrich_lead_operator();
