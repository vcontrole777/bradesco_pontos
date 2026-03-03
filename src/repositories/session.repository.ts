import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DatabaseError } from "@/lib/errors";

type SiteSession = Database["public"]["Tables"]["site_sessions"]["Row"];
type SiteSessionInsert = Database["public"]["Tables"]["site_sessions"]["Insert"];

// JOIN result type: site_sessions fields + flattened lead CPF (data-pagination).
export interface SessionWithLeadCpf extends Omit<SiteSession, "leads"> {
  lead_cpf: string | null;
}

export class SessionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(input: SiteSessionInsert): Promise<Pick<SiteSession, "id">> {
    const { data, error } = await this.db
      .from("site_sessions")
      .insert(input)
      .select("id")
      .single();

    if (error) throw new DatabaseError("Failed to create session", error);
    return data;
  }

  async end(id: string): Promise<void> {
    const { error } = await this.db
      .from("site_sessions")
      .update({ is_online: false, ended_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new DatabaseError("Failed to end session", error);
  }

  async countStats(): Promise<{ online: number; total: number }> {
    const [{ count: online, error: e1 }, { count: total, error: e2 }] =
      await Promise.all([
        this.db
          .from("site_sessions")
          .select("*", { count: "exact", head: true })
          .eq("is_online", true),
        this.db
          .from("site_sessions")
          .select("*", { count: "exact", head: true }),
      ]);

    if (e1) throw new DatabaseError("Failed to count online sessions", e1);
    if (e2) throw new DatabaseError("Failed to count sessions", e2);
    return { online: online ?? 0, total: total ?? 0 };
  }

  // Cursor-based pagination with lead CPF JOIN (data-pagination + schema-foreign-key-indexes).
  // The idx_sessions_lead_id index makes the JOIN efficient.
  async findAllWithLeadCpf(options: {
    limit?: number;
    cursor?: string; // started_at of the last row from previous page
  }): Promise<{ data: SessionWithLeadCpf[]; nextCursor: string | null }> {
    let query = this.db
      .from("site_sessions")
      .select("*, leads(cpf)")
      .order("started_at", { ascending: false })
      .limit(options.limit ?? 200);

    if (options.cursor) {
      query = query.lt("started_at", options.cursor);
    }

    const { data, error } = await query;

    if (error) throw new DatabaseError("Failed to fetch sessions", error);

    // Supabase JOIN returns { ...session, leads: { cpf } | null }.
    // Assert the join shape so TypeScript can verify the property access.
    type RawRow = SiteSession & { leads: { cpf: string | null } | null };
    const rows = ((data ?? []) as unknown as RawRow[]).map((s) => ({
      ...s,
      lead_cpf: s.leads?.cpf ?? null,
      leads: undefined,
    })) as SessionWithLeadCpf[];

    const nextCursor =
      rows.length === (options.limit ?? 200)
        ? (rows[rows.length - 1].started_at ?? null)
        : null;

    return { data: rows, nextCursor };
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const { error } = await this.db
      .from("site_sessions")
      .delete()
      .in("id", ids);

    if (error) throw new DatabaseError("Failed to delete sessions", error);
  }

  // Deletes all sessions. Uses neq sentinel to match all rows while
  // remaining compatible with the anon RLS policy (service_role bypasses anyway).
  async deleteAll(): Promise<void> {
    const { error } = await this.db
      .from("site_sessions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) throw new DatabaseError("Failed to delete all sessions", error);
  }
}
