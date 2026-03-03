
CREATE TABLE public.access_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  config_value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.access_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on access_config" ON public.access_config FOR ALL USING (true) WITH CHECK (true);

-- Seed default configs
INSERT INTO public.access_config (config_key, config_value) VALUES
  ('allowed_devices', '{"mobile": true, "desktop": true}'::jsonb),
  ('blocked_ips', '[]'::jsonb),
  ('blocked_regions', '[]'::jsonb);
