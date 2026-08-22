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

describe.skipIf(!LIVE)("check-ins and milestones (live)", () => {
  async function admin(): Promise<SupabaseClient> {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function asUser(email: string, password: string): Promise<SupabaseClient> {
    return signIn(email, password);
  }

  it("lets a team member log a check-in, blocks a stranger, and locks after submission", async () => {
    const svc = await admin();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const password = "session5-checkins-pass-12";

    const makeUser = async (label: string) => {
      const email = `session5.${label}.${suffix}@motf.test`;
      return createUser(svc as never, email, password);
    };

    const member = await makeUser("member");
    const stranger = await makeUser("stranger");

    const { data: event, error: eventErr } = await svc
      .from("events")
      .insert({
        slug: `s5-checkins-${suffix}`,
        name: "Session 5 fixture",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400000).toISOString(),
        submission_deadline: new Date(Date.now() + 43200000).toISOString(),
        status: "open",
        max_team_size: 5,
      })
      .select("id")
      .single();
    if (eventErr || !event) throw eventErr ?? new Error("event");

    const { data: milestone, error: milestoneErr } = await svc
      .from("milestones")
      .insert({
        event_id: event.id,
        key: "v1_slice",
        label: "V1 slice",
        due_at: new Date(Date.now() + 3600_000).toISOString(),
        required: true,
        penalty: "plate_cap",
        sort_order: 1,
      })
      .select("id")
      .single();
    if (milestoneErr || !milestone) throw milestoneErr ?? new Error("milestone");

    await svc.from("event_roles").insert([
      { event_id: event.id, user_id: member.id, role: "participant" },
      { event_id: event.id, user_id: stranger.id, role: "participant" },
    ]);

    const { data: team, error: teamErr } = await svc
      .from("teams")
      .insert({ event_id: event.id, name: `Session 5 ${suffix}` })
      .select("id")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error("team");
    await svc.from("team_members").insert({ team_id: team.id, user_id: member.id, role: "captain" });

    const memberClient = await asUser(member.email, password);
    const strangerClient = await asUser(stranger.email, password);

    const { error: strangerInsertErr } = await strangerClient.from("check_ins").insert({
      team_id: team.id,
      author_id: stranger.id,
      milestone_id: milestone.id,
      body: "I am not on this team",
    });
    expect(strangerInsertErr).toBeTruthy();

    const { data: checkIn, error: memberInsertErr } = await memberClient
      .from("check_ins")
      .insert({
        team_id: team.id,
        author_id: member.id,
        milestone_id: milestone.id,
        body: "Shipped the v1 slice",
        link_url: "https://github.com/team/repo/pull/1",
      })
      .select("id, created_at")
      .single();
    expect(memberInsertErr).toBeNull();
    expect(checkIn?.id).toBeTruthy();

    const { data: strangerRead } = await strangerClient.from("check_ins").select("id").eq("team_id", team.id);
    expect(strangerRead?.length ?? 0).toBe(0);

    const { error: deleteErr } = await memberClient.from("check_ins").delete().eq("id", checkIn!.id);
    expect(deleteErr).toBeNull();

    await svc.from("teams").update({ submitted_at: new Date().toISOString() }).eq("id", team.id);
    const { error: lockedInsertErr } = await memberClient.from("check_ins").insert({
      team_id: team.id,
      author_id: member.id,
      body: "Trying to check in after submission",
    });
    expect(lockedInsertErr).toBeTruthy();

    await svc.from("events").delete().eq("id", event.id);
    for (const u of [member, stranger]) {
      await svc.auth.admin.deleteUser(u.id);
    }
  });
});
