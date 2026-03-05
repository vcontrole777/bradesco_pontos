import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DatabaseError } from "@/lib/errors";

type SiteSession = Database["public"]["Tables"]["site_sessions"]["Row"];
type SiteSessionInsert = Database["public"]["Tables"]["site_sessions"]["Insert"];

// Extra fields added via 20260304000000_session_ipinfo_fields migration.
// Not yet reflected in the auto-generated types — added here explicitly
// until `supabase gen types` is re-run after db push.
interface IpInfoExtra {
  country_code?: string | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  as_name?: string | null;
  as_type?: string | null;
  is_vpn?: boolean;
  is_proxy?: boolean;
  is_tor?: boolean;
  is_hosting?: boolean;
  is_mobile?: boolean;
}

// JOIN result type: site_sessions fields + flattened lead CPF (data-pagination).
export interface SessionWithLeadCpf extends Omit<SiteSession, "leads">, IpInfoExtra {
  lead_cpf: string | null;
}

// Extended insert type that includes the new ip-info columns.
type SessionCreateInput = SiteSessionInsert & IpInfoExtra;

export class SessionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(input: SessionCreateInput): Promise<Pick<SiteSession, "id">> {
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

  async countStats(since?: string): Promise<{ online: number; total: number }> {
    // Online = heartbeat recebido nos últimos 60s (consistente com fetchOnlineLeadIds)
    const onlineThreshold = new Date(Date.now() - 60_000).toISOString();

    let onlineQuery = this.db
      .from("site_sessions")
      .select("*", { count: "exact", head: true })
      .gte("last_seen_at", onlineThreshold);

    let totalQuery = this.db
      .from("site_sessions")
      .select("*", { count: "exact", head: true });

    if (since) {
      onlineQuery = onlineQuery.gte("started_at", since);
      totalQuery = totalQuery.gte("started_at", since);
    }

    const [{ count: online, error: e1 }, { count: total, error: e2 }] =
      await Promise.all([onlineQuery, totalQuery]);

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

  // Deletes sessions that display no CPF in the UI:
  //   1. lead_id IS NULL (no lead at all)
  //   2. lead_id set but lead.cpf IS NULL (lead exists without CPF)
  async deleteWithoutCpf(): Promise<{ count: number }> {
    // Case 1: no lead linked
    const { error: e1, count: c1 } = await this.db
      .from("site_sessions")
      .delete({ count: "exact" })
      .is("lead_id", null);

    if (e1) throw new DatabaseError("Failed to delete sessions without lead", e1);

    // Case 2: lead linked but CPF is null — get those lead IDs first
    const { data: leadsNoCpf, error: e2 } = await this.db
      .from("leads")
      .select("id")
      .is("cpf", null);

    if (e2) throw new DatabaseError("Failed to fetch leads without CPF", e2);

    let c2 = 0;
    if (leadsNoCpf && leadsNoCpf.length > 0) {
      const ids = leadsNoCpf.map((l) => l.id);
      const { error: e3, count } = await this.db
        .from("site_sessions")
        .delete({ count: "exact" })
        .in("lead_id", ids);

      if (e3) throw new DatabaseError("Failed to delete sessions with CPF-less lead", e3);
      c2 = count ?? 0;
    }

    return { count: (c1 ?? 0) + c2 };
  }
}
