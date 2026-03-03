import { supabase } from "@/integrations/supabase/client";
import { LeadRepository } from "./lead.repository";
import { ConfigRepository } from "./config.repository";
import { FlowRepository } from "./flow.repository";
import { SessionRepository } from "./session.repository";

// Singletons — one instance per repository, all sharing the same Supabase client.
export const leadRepository = new LeadRepository(supabase);
export const configRepository = new ConfigRepository(supabase);
export const flowRepository = new FlowRepository(supabase);
export const sessionRepository = new SessionRepository(supabase);

export type { Lead, LeadInsert, LeadUpdate } from "./lead.repository";
export type { FlowStep, FlowStepUpdate } from "./flow.repository";
export type { SessionWithLeadCpf } from "./session.repository";
