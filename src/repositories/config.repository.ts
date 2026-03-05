import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { DatabaseError } from "@/lib/errors";

type AccessConfig = Database["public"]["Tables"]["access_config"]["Row"];

export class ConfigRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getAll(): Promise<AccessConfig[]> {
    const { data, error } = await this.db
      .from("access_config")
      .select("id, config_key, config_value, updated_at");

    if (error) throw new DatabaseError("Failed to fetch config", error);
    return data ?? [];
  }

  async getByKeys(keys: string[]): Promise<AccessConfig[]> {
    const { data, error } = await this.db
      .from("access_config")
      .select("id, config_key, config_value, updated_at")
      .in("config_key", keys);

    if (error) throw new DatabaseError("Failed to fetch config keys", error);
    return data ?? [];
  }

  async upsert(key: string, value: Json): Promise<void> {
    const { error } = await this.db
      .from("access_config")
      .upsert({ config_key: key, config_value: value }, { onConflict: "config_key" });

    if (error) throw new DatabaseError("Failed to upsert config", error);
  }

  // N+1 elimination: replaces N parallel upsert calls with a single batch upsert.
  // Uses the unique config_key constraint to resolve conflicts (data-n-plus-one).
  async batchUpsert(entries: { key: string; value: Json }[]): Promise<void> {
    const rows = entries.map((e) => ({ config_key: e.key, config_value: e.value }));
    const { error } = await this.db
      .from("access_config")
      .upsert(rows, { onConflict: "config_key" });

    if (error) throw new DatabaseError("Failed to batch upsert config", error);
  }

  // Race-condition-safe append via PostgreSQL function (append_to_config_list).
  // The DB function uses SELECT ... FOR UPDATE to prevent TOCTOU races that
  // the previous read-modify-write pattern suffered from.
  // Returns false if item already exists in the list (idempotent).
  async appendToList(key: string, item: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("append_to_config_list", {
      p_key: key,
      p_item: item,
    });

    if (error) throw new DatabaseError("Failed to append to config list", error);
    return data as boolean;
  }

  async logAccess(entry: {
    reason: string;
    ip_address?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    user_agent?: string | null;
  }): Promise<void> {
    const { error } = await this.db.from("access_logs").insert(entry);
    if (error) throw new DatabaseError("Failed to log access", error);
  }

  async countAccessLogs(since?: string): Promise<number> {
    let query = this.db
      .from("access_logs")
      .select("*", { count: "exact", head: true });

    if (since) query = query.gte("created_at", since);

    const { count, error } = await query;
    if (error) throw new DatabaseError("Failed to count access logs", error);
    return count ?? 0;
  }
}
