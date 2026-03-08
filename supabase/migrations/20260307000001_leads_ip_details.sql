-- Add ip_details JSONB column to leads table.
-- Stores geolocation + network info from ipinfo.io at session creation time.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ip_details jsonb;

-- Also add ip_details to site_sessions if not already present.
ALTER TABLE public.site_sessions ADD COLUMN IF NOT EXISTS ip_details jsonb;
