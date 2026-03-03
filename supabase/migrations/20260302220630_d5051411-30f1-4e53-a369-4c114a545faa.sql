-- Add archived flag and tags array to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_leads_archived ON public.leads (archived);
CREATE INDEX IF NOT EXISTS idx_leads_tags ON public.leads USING GIN (tags);