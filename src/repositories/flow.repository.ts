import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DatabaseError } from "@/lib/errors";

export type FlowStep = Database["public"]["Tables"]["flow_config"]["Row"];
export type FlowStepUpdate = Pick<FlowStep, "id" | "step_order" | "enabled">;

export class FlowRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getAll(): Promise<FlowStep[]> {
    const { data, error } = await this.db
      .from("flow_config")
      .select("id, step_key, step_label, step_order, enabled, updated_at")
      .order("step_order", { ascending: true });

    if (error) throw new DatabaseError("Failed to fetch flow config", error);
    return data ?? [];
  }

  // Atomic multi-row update via PostgreSQL function (batch_update_flow_steps).
  // All rows are updated inside a single transaction — if any row fails the
  // entire batch is rolled back (previously N parallel queries were not atomic).
  async batchUpdate(steps: FlowStepUpdate[]): Promise<void> {
    const payload = steps.map(({ id, step_order, enabled }) => ({ id, step_order, enabled }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.db.rpc as any)("batch_update_flow_steps", { steps: payload });

    if (error) throw new DatabaseError("Failed to update flow config", error);
  }
}
