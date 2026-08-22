import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { LIVE, createUser, serviceClient, signIn, uniqueSuffix } from "../helpers/live";
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

const PASSWORD = "session8-proxy-pass-12";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function admin(): SupabaseClient<Database> {
  return serviceClient<Database>();
}

async function asUser(email: string): Promise<SupabaseClient<Database>> {
  return signIn<Database>(email, PASSWORD);
}

describe.skipIf(!LIVE)("api_calls metadata log (live, DB-only)", () => {
  it("scopes reads to team/staff/assigned judge, has no INSERT policy, and no body columns exist", async () => {
    const svc = admin();
    const suffix = uniqueSuffix();

    const member = await createUser(svc as never, `session8.member.${suffix}@motf.test`, PASSWORD);
    const stranger = await createUser(svc as never, `session8.stranger.${suffix}@motf.test`, PASSWORD);
    const organizer = await createUser(svc as never, `session8.organizer.${suffix}@motf.test`, PASSWORD);
    const judge = await createUser(svc as never, `session8.judge.${suffix}@motf.test`, PASSWORD);
    const otherJudge = await createUser(svc as never, `session8.otherjudge.${suffix}@motf.test`, PASSWORD);

    const { data: event, error: eventErr } = await svc
      .from("events")
      .insert({
        slug: `s8-apicalls-${suffix}`,
        name: "Session 8 fixture",
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
      .insert({ event_id: event.id, name: `Session 8 ${suffix}` })
      .select("id, tenant_id")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error("team");

    await svc.from("team_members").insert({ team_id: team.id, user_id: member.id, role: "captain" });
    await svc
      .from("judge_assignments")
      .insert({ event_id: event.id, judge_id: judge.id, team_id: team.id, status: "pending" });

    try {
      const { error: insertErr } = await svc.from("api_calls").insert([
        { team_id: team.id, tenant_id: team.tenant_id, provider: "openai", model: "gpt-4o-mini", status_code: 200, latency_ms: 400 },
        { team_id: team.id, tenant_id: team.tenant_id, provider: "anthropic", model: "claude-haiku-4-5", status_code: 401, latency_ms: 120 },
      ]);
      expect(insertErr).toBeNull();

      const memberClient = await asUser(member.email);
      const strangerClient = await asUser(stranger.email);
      const organizerClient = await asUser(organizer.email);
      const judgeClient = await asUser(judge.email);
      const otherJudgeClient = await asUser(otherJudge.email);

      const readable = async (client: SupabaseClient<Database>) => {
        const { data } = await client.from("api_calls").select("id").eq("team_id", team.id);
        return data?.length ?? 0;
      };

      expect(await readable(memberClient)).toBe(2);
      expect(await readable(organizerClient)).toBe(2);
      expect(await readable(judgeClient)).toBe(2);
      expect(await readable(otherJudgeClient)).toBe(0);
      expect(await readable(strangerClient)).toBe(0);

      // No INSERT policy on api_calls: a team member cannot forge their own
      // activity log — only the service role (this route's server-side write) can.
      const { error: forgeErr } = await memberClient.from("api_calls").insert({
        team_id: team.id,
        provider: "openai",
        model: "definitely-not-real",
        status_code: 200,
      });
      expect(forgeErr).toBeTruthy();

      // Structural guarantee, not just convention: there is no column to put a
      // prompt or response body in even if someone wanted to.
      const { error: columnErr } = await svc.from("api_calls").select("request_body" as never).limit(1);
      expect(columnErr).toBeTruthy();
      expect(columnErr?.message ?? "").toMatch(/column .*request_body.* does not exist/i);
    } finally {
      await svc.from("events").delete().eq("id", event.id);
    }
  });
});

/**
 * HTTP integration against the actual route handler. Soft-skips (not a false
 * failure) when no dev server is reachable at NEXT_PUBLIC_APP_URL/localhost:3000
 * — this is the one live suite that needs `pnpm dev` running, same as the
 * manual curl checks this codifies.
 */
describe.skipIf(!LIVE)("proxy route (live HTTP)", () => {
  async function appReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${APP_URL}/api/proxy/does-not-exist/x`, { signal: AbortSignal.timeout(2000) });
      return res.status === 404;
    } catch {
      return false;
    }
  }

  async function fixtureTeam(svc: SupabaseClient<Database>, suffix: string) {
    const { data: event, error: eventErr } = await svc
      .from("events")
      .insert({
        slug: `s8-http-${suffix}`,
        name: "Session 8 HTTP fixture",
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() + 43200_000).toISOString(),
        status: "live",
      })
      .select("id")
      .single();
    if (eventErr || !event) throw eventErr ?? new Error("event");
    const { data: team, error: teamErr } = await svc
      .from("teams")
      .insert({ event_id: event.id, name: `HTTP ${suffix}` })
      .select("id, proxy_token")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error("team");
    return { eventId: event.id, teamId: team.id, token: team.proxy_token };
  }

  it("forwards a real OpenAI error unmodified, logs metadata only, and rejects bad auth", async (ctx) => {
    if (!(await appReachable())) {
      ctx.skip();
      return;
    }
    const svc = admin();
    const suffix = uniqueSuffix();
    const fx = await fixtureTeam(svc, suffix);

    try {
      const unknownProvider = await fetch(`${APP_URL}/api/proxy/cohere/v1/x?team=${fx.token}`);
      expect(unknownProvider.status).toBe(404);

      const noToken = await fetch(`${APP_URL}/api/proxy/openai/v1/chat/completions`, { method: "POST" });
      expect(noToken.status).toBe(401);

      const badToken = await fetch(`${APP_URL}/api/proxy/openai/v1/chat/completions?team=motf_bogus`, {
        method: "POST",
      });
      expect(badToken.status).toBe(401);

      // A genuinely bad upstream key: OpenAI's own 401 body must pass through
      // byte-for-byte, proving this is a pass-through and not a wrapper.
      const res = await fetch(`${APP_URL}/api/proxy/openai/v1/chat/completions?team=${fx.token}`, {
        method: "POST",
        headers: { Authorization: "Bearer sk-invalid", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error?.code).toBe("invalid_api_key");

      // x-motf-team header works identically to ?team=.
      const viaHeader = await fetch(`${APP_URL}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          "x-motf-team": fx.token,
          Authorization: "Bearer sk-invalid",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }),
      });
      expect(viaHeader.status).toBe(401);

      // Metadata landed, with no body columns to have stored anything in.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const { data: calls } = await svc
        .from("api_calls")
        .select("provider, model, status_code")
        .eq("team_id", fx.teamId);
      expect((calls?.length ?? 0) >= 2).toBe(true);
      expect(calls?.every((c) => c.provider === "openai" && c.model === "gpt-4o-mini")).toBe(true);
    } finally {
      await svc.from("events").delete().eq("id", fx.eventId);
    }
  });

  it("forwards a real Anthropic error unmodified", async (ctx) => {
    if (!(await appReachable())) {
      ctx.skip();
      return;
    }
    const svc = admin();
    const suffix = uniqueSuffix();
    const fx = await fixtureTeam(svc, suffix);

    try {
      const res = await fetch(`${APP_URL}/api/proxy/anthropic/v1/messages?team=${fx.token}`, {
        method: "POST",
        headers: { "x-api-key": "sk-ant-invalid", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.type).toBe("error");
    } finally {
      await svc.from("events").delete().eq("id", fx.eventId);
    }
  });

  it("isolates two teams' logs from each other", async (ctx) => {
    if (!(await appReachable())) {
      ctx.skip();
      return;
    }
    const svc = admin();
    const suffix = uniqueSuffix();
    const teamA = await fixtureTeam(svc, `${suffix}-a`);
    const teamB = await fixtureTeam(svc, `${suffix}-b`);

    try {
      await fetch(`${APP_URL}/api/proxy/openai/v1/chat/completions?team=${teamA.token}`, {
        method: "POST",
        headers: { Authorization: "Bearer sk-invalid", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const { data: bCalls } = await svc.from("api_calls").select("id").eq("team_id", teamB.teamId);
      expect(bCalls?.length ?? 0).toBe(0);
    } finally {
      await svc.from("events").delete().eq("id", teamA.eventId);
      await svc.from("events").delete().eq("id", teamB.eventId);
    }
  });
});
