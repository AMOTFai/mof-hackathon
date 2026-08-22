import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createUser, signIn } from "../helpers/live";

class StubSocket {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
}
beforeAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = StubSocket;
});

const LIVE =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!LIVE)("team size enforcement (live)", () => {
  async function admin(): Promise<SupabaseClient> {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function asUser(email: string, password: string): Promise<SupabaseClient> {
    return signIn(email, password);
  }

  it("lets two members join a max_team_size=2 event and blocks the third", async () => {
    const svc = await admin();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const password = "session3-size-pass-12";

    const makeUser = async (label: string) => {
      const email = `session3.${label}.${suffix}@motf.test`;
      return createUser(svc as never, email, password);
    };

    const a = await makeUser("a");
    const b = await makeUser("b");
    const c = await makeUser("c");

    const { data: event, error: eventErr } = await svc
      .from("events")
      .insert({
        slug: `s3-size-${suffix}`,
        name: "Session 3 size fixture",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400000).toISOString(),
        submission_deadline: new Date(Date.now() + 43200000).toISOString(),
        status: "open",
        max_team_size: 2,
      })
      .select("id")
      .single();
    if (eventErr || !event) throw eventErr ?? new Error("event");

    await svc.from("event_roles").insert([
      { event_id: event.id, user_id: a.id, role: "participant" },
      { event_id: event.id, user_id: b.id, role: "participant" },
      { event_id: event.id, user_id: c.id, role: "participant" },
    ]);

    const clientA = await asUser(a.email, password);
    const { data: team, error: teamErr } = await clientA
      .from("teams")
      .insert({ event_id: event.id, name: `Size ${suffix}` })
      .select("id, invite_code")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error("team");

    const { error: capErr } = await clientA
      .from("team_members")
      .insert({ team_id: team.id, user_id: a.id, role: "captain" });
    expect(capErr).toBeNull();

    const clientB = await asUser(b.email, password);
    const { error: joinB } = await clientB
      .from("team_members")
      .insert({ team_id: team.id, user_id: b.id, role: "member" });
    expect(joinB).toBeNull();

    const clientC = await asUser(c.email, password);
    const { error: joinC } = await clientC
      .from("team_members")
      .insert({ team_id: team.id, user_id: c.id, role: "member" });
    expect(joinC).toBeTruthy();
    expect(joinC?.message ?? "").toMatch(/team is full/i);

    await svc.from("events").delete().eq("id", event.id);
    for (const u of [a, b, c]) {
      await svc.auth.admin.deleteUser(u.id);
    }
  });
});
