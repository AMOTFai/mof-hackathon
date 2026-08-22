import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { syncTeamCommits } from "@/lib/github/sync";
import { createUser, signIn } from "../helpers/live";
import type { Database } from "@/lib/database.types";

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

const PASSWORD = "session7-github-pass-12";

function admin(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function asUser(email: string): Promise<SupabaseClient<Database>> {
  return signIn<Database>(email, PASSWORD);
}

describe.skipIf(!LIVE)("commits + process signal (live)", () => {
  it("upserts commits idempotently and scopes reads to team, staff and assigned judge", async () => {
    const svc = admin();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const makeUser = async (label: string) => {
      const email = `session7.${label}.${suffix}@motf.test`;
      return createUser(svc as never, email, PASSWORD);
    };

    const member = await makeUser("member");
    const stranger = await makeUser("stranger");
    const organizer = await makeUser("organizer");
    const judge = await makeUser("judge");
    const otherJudge = await makeUser("otherjudge");

    const { data: event, error: eventErr } = await svc
      .from("events")
      .insert({
        slug: `s7-github-${suffix}`,
        name: "Session 7 fixture",
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() + 43200_000).toISOString(),
        status: "live",
      })
      .select("id, tenant_id")
      .single();
    if (eventErr || !event) throw eventErr ?? new Error("event");

    await svc.from("event_roles").insert([
      { event_id: event.id, user_id: member.id, role: "participant" },
      { event_id: event.id, user_id: stranger.id, role: "participant" },
      { event_id: event.id, user_id: organizer.id, role: "organizer" },
      { event_id: event.id, user_id: judge.id, role: "judge" },
      { event_id: event.id, user_id: otherJudge.id, role: "judge" },
    ]);

    const { data: team, error: teamErr } = await svc
      .from("teams")
      .insert({ event_id: event.id, name: `Session 7 ${suffix}`, repo_url: "https://github.com/motf/aurora" })
      .select("id, tenant_id")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error("team");

    await svc.from("team_members").insert({ team_id: team.id, user_id: member.id, role: "captain" });
    await svc
      .from("judge_assignments")
      .insert({ event_id: event.id, judge_id: judge.id, team_id: team.id, status: "pending" });

    try {
      // Insert a fixed set twice; (team_id, sha) is unique, so the second pass
      // must update rather than duplicate.
      const rows = [
        { sha: `aaa${suffix}`, authored_at: "2026-08-20T10:00:00Z", message: "first" },
        { sha: `bbb${suffix}`, authored_at: "2026-08-20T11:00:00Z", message: "second" },
      ];
      const insertRows = rows.map((r) => ({
        team_id: team.id,
        tenant_id: team.tenant_id,
        sha: r.sha,
        message: r.message,
        author_login: "ada",
        authored_at: r.authored_at,
      }));

      const first = await svc.from("commits").upsert(insertRows, { onConflict: "team_id,sha" }).select("id");
      expect(first.error).toBeNull();
      expect(first.data?.length).toBe(2);

      const second = await svc
        .from("commits")
        .upsert(
          insertRows.map((r) => ({ ...r, message: `${r.message} (amended)` })),
          { onConflict: "team_id,sha" },
        )
        .select("id");
      expect(second.error).toBeNull();

      const { count } = await svc
        .from("commits")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id);
      expect(count).toBe(2);

      const { data: amended } = await svc
        .from("commits")
        .select("message")
        .eq("team_id", team.id)
        .eq("sha", `aaa${suffix}`)
        .single();
      expect(amended?.message).toBe("first (amended)");

      // RLS read scoping.
      const memberClient = await asUser(member.email);
      const strangerClient = await asUser(stranger.email);
      const organizerClient = await asUser(organizer.email);
      const judgeClient = await asUser(judge.email);
      const otherJudgeClient = await asUser(otherJudge.email);

      const readable = async (client: SupabaseClient<Database>) => {
        const { data } = await client.from("commits").select("id").eq("team_id", team.id);
        return data?.length ?? 0;
      };

      expect(await readable(memberClient)).toBe(2);
      expect(await readable(organizerClient)).toBe(2);
      expect(await readable(judgeClient)).toBe(2);
      expect(await readable(strangerClient)).toBe(0);
      expect(await readable(otherJudgeClient)).toBe(0);

      // commits has no INSERT policy: a team member cannot forge commit history.
      const { error: forgeErr } = await memberClient.from("commits").insert({
        team_id: team.id,
        sha: `forged${suffix}`,
        authored_at: new Date().toISOString(),
        message: "I definitely wrote this",
      });
      expect(forgeErr).toBeTruthy();
    } finally {
      await svc.from("events").delete().eq("id", event.id);
      for (const u of [member, stranger, organizer, judge, otherJudge]) {
        await svc.auth.admin.deleteUser(u.id);
      }
    }
  });

  it("syncTeamCommits reports a clean error for an unusable repo instead of throwing", async () => {
    const svc = admin();
    const result = await syncTeamCommits(svc, {
      teamId: "00000000-0000-4000-8000-0000000000ff",
      tenantId: null,
      repoUrl: "https://evil.example.com/github.com/motf/aurora",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/GitHub repository URL/i);
  });
});
