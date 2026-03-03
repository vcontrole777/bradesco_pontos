import { supabase } from "@/integrations/supabase/client";
import { EdgeFunctionsService } from "./edge-functions.service";

// Singleton — shares the same Supabase client as the repositories.
export const edgeFunctionsService = new EdgeFunctionsService(supabase);
