import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DatabaseError } from "@/lib/errors";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export class LeadRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // Cursor-based pagination (data-pagination best practice).
  // Pass `cursor` (ISO timestamp of last row) to fetch the next page.
  // Avoids OFFSET which degrades as O(n) on deep pages.
  async findAll(options: {
    archived: boolean;
    limit?: number;
    cursor?: string; // created_at of the last row from the previous page
  }): Promise<{ data: Lead[]; nextCursor: string | null }> {
    let query = this.db
      .from("leads")
      .select("*")
      .eq("archived", options.archived)
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 50);

    if (options.cursor) {
      query = query.lt("created_at", options.cursor);
    }

    const { data, error } = await query;

    if (error) throw new DatabaseError("Failed to fetch leads", error);

    const rows = data ?? [];
    const nextCursor =
      rows.length === (options.limit ?? 50)
        ? (rows[rows.length - 1].created_at ?? null)
        : null;

    return { data: rows, nextCursor };
  }

  async create(input: LeadInsert): Promise<Pick<Lead, "id">> {
    const { data, error } = await this.db
      .from("leads")
      .insert(input)
      .select("id")
      .single();

    if (error) throw new DatabaseError("Failed to create lead", error);
    return data;
  }

  /** Returns the most recent in-progress lead for the given CPF, or null. */
  async findByCpf(cpf: string): Promise<Lead | null> {
    const { data, error } = await this.db
      .from("leads")
      .select("*")
      .eq("cpf", cpf)
      .eq("status", "em_andamento")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new DatabaseError("Failed to find lead by CPF", error);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from("leads")
      .delete()
      .eq("id", id);

    if (error) throw new DatabaseError("Failed to delete lead", error);
  }

  async update(id: string, input: LeadUpdate): Promise<void> {
    const { error } = await this.db
      .from("leads")
      .update(input)
      .eq("id", id);

    if (error) throw new DatabaseError("Failed to update lead", error);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const { error } = await this.db
      .from("leads")
      .delete()
      .in("id", ids);

    if (error) throw new DatabaseError("Failed to delete leads", error);
  }

  async bulkUpdate(ids: string[], input: LeadUpdate): Promise<void> {
    const { error } = await this.db
      .from("leads")
      .update(input)
      .in("id", ids);

    if (error) throw new DatabaseError("Failed to bulk update leads", error);
  }

  // Single DB call via PostgreSQL function — avoids N+1 from per-lead tag updates.
  // Requires the `append_tag_to_leads` function defined in the migration.
  async bulkAddTag(ids: string[], tag: string): Promise<void> {
    const { error } = await this.db.rpc("append_tag_to_leads", {
      lead_ids: ids,
      tag,
    });

    if (error) throw new DatabaseError("Failed to bulk add tag", error);
  }

  // Used by AdminDashboard via get_lead_step_counts() RPC (avoids full table scan).
  async getStepCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.db.rpc("get_lead_step_counts");

    if (error) throw new DatabaseError("Failed to get step counts", error);
    return (data as Record<string, number>) ?? {};
  }

  // COUNT(*) queries — HEAD requests avoid fetching row data (query-missing-indexes).
  // The idx_leads_status index makes countByStatus efficient.
  async countAll(since?: string): Promise<number> {
    let query = this.db
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("archived", false);

    if (since) query = query.gte("created_at", since);

    const { count, error } = await query;
    if (error) throw new DatabaseError("Failed to count leads", error);
    return count ?? 0;
  }

  async countByStatus(status: string, since?: string): Promise<number> {
    let query = this.db
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", status)
      .eq("archived", false);

    if (since) query = query.gte("created_at", since);

    const { count, error } = await query;
    if (error) throw new DatabaseError("Failed to count leads by status", error);
    return count ?? 0;
  }

  // Fichas = leads with cpf AND phone filled (not loose visits).
  async countFichas(since?: string): Promise<{ total: number; completed: number; incomplete: number }> {
    let baseQuery = this.db
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("archived", false)
      .not("cpf", "is", null)
      .not("phone", "is", null);

    let completedQuery = this.db
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("archived", false)
      .eq("status", "concluido")
      .not("cpf", "is", null)
      .not("phone", "is", null);

    if (since) {
      baseQuery = baseQuery.gte("created_at", since);
      completedQuery = completedQuery.gte("created_at", since);
    }

    const [{ count: total, error: e1 }, { count: completed, error: e2 }] =
      await Promise.all([baseQuery, completedQuery]);

    if (e1) throw new DatabaseError("Failed to count fichas", e1);
    if (e2) throw new DatabaseError("Failed to count completed fichas", e2);

    const t = total ?? 0;
    const c = completed ?? 0;
    return { total: t, completed: c, incomplete: t - c };
  }

  // Delete loose leads (no cpf or no phone) and return count.
  async deleteLoose(): Promise<number> {
    // Leads missing CPF
    const { count: c1, error: e1 } = await this.db
      .from("leads")
      .delete({ count: "exact" })
      .is("cpf", null);

    if (e1) throw new DatabaseError("Failed to delete leads without CPF", e1);

    // Leads missing phone (but had CPF)
    const { count: c2, error: e2 } = await this.db
      .from("leads")
      .delete({ count: "exact" })
      .is("phone", null);

    if (e2) throw new DatabaseError("Failed to delete leads without phone", e2);

    return (c1 ?? 0) + (c2 ?? 0);
  }
}
