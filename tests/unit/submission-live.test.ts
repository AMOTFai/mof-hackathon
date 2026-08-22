import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIVE, createUser, serviceClient, signIn, uniqueSuffix } from "../helpers/live";

class StubSocket {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
}
beforeAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = StubSocket;
});

const PASSWORD = "session6-submission-pass-12";

function admin(): SupabaseClient {
  return serviceClient();
}

async function asUser(email: string): Promise<SupabaseClient> {
  return signIn(email, PASSWORD);
}

// Users are shared across every case in this file and signed in once: auth
// sign-ins are rate-limited per IP across the whole live suite. Events and teams
// are still built fresh per case, so the cases stay independent.
type Fixture = { email: string; id: string };
let shared: { captain: Fixture; member: Fixture; stranger: Fixture };

beforeAll(async () => {
  if (!LIVE) return;
  const svc = admin();
  const suffix = uniqueSuffix();
  shared = {
    captain: await createUser(svc as never, `session6.captain.${suffix}@motf.test`, PASSWORD),
    member: await createUser(svc as never, `session6.member.${suffix}@motf.test`, PASSWORD),
    // Belongs to no team under test — used for the cross-team check.
    stranger: await createUser(svc as never, `session6.stranger.${suffix}@motf.test`, PASSWORD),
  };
});

afterAll(async () => {
  if (!LIVE || !shared) return;
  const svc = admin();
  for (const u of [shared.captain, shared.member, shared.stranger]) await svc.auth.admin.deleteUser(u.id);
});

/** Builds a fresh event + team, reusing the shared captain/member users. */
async function fixture(svc: SupabaseClient, opts: { deadlineOffsetMs: number; complete: boolean }) {
  const suffix = uniqueSuffix();
  const captain = shared.captain;
  const member = shared.member;

  const { data: event, error: eventErr } = await svc
    .from("events")
    .insert({
      slug: `s6-submit-${suffix}`,
      name: "Session 6 fixture",
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      ends_at: new Date(Date.now() + 86400_000).toISOString(),
      submission_deadline: new Date(Date.now() + opts.deadlineOffsetMs).toISOString(),
      status: "live",
      max_team_size: 5,
    })
    .select("id")
    .single();
  if (eventErr || !event) throw eventErr ?? new Error("event");

  await svc.from("event_roles").insert([
    { event_id: event.id, user_id: captain.id, role: "participant" },
    { event_id: event.id, user_id: member.id, role: "participant" },
    { event_id: event.id, user_id: shared.stranger.id, role: "participant" },
  ]);

  const { data: team, error: teamErr } = await svc
    .from("teams")
    .insert({
      event_id: event.id,
      name: `Session 6 ${suffix}`,
      project_name: opts.complete ? "Aurora" : null,
      repo_url: opts.complete ? "https://github.com/team/repo" : null,
      video_url: opts.complete ? "https://youtu.be/demo" : null,
    })
    .select("id")
    .single();
  if (teamErr || !team) throw teamErr ?? new Error("team");

  await svc.from("team_members").insert([
    { team_id: team.id, user_id: captain.id, role: "captain" },
    { team_id: team.id, user_id: member.id, role: "member" },
  ]);

  return {
    eventId: event.id,
    teamId: team.id,
    captain,
    member,
    // Only the event is torn down; the shared users live for the whole file.
    cleanup: async () => {
      await svc.from("events").delete().eq("id", event.id);
    },
  };
}

describe.skipIf(!LIVE)("submission (live)", () => {
  it("captain submits once, replays idempotently, and cannot edit afterwards", async () => {
    const svc = admin();
    const fx = await fixture(svc, { deadlineOffsetMs: 3600_000, complete: true });
    try {
      const captainClient = await asUser(fx.captain.email);
      const key = crypto.randomUUID();

      const first = await captainClient.rpc("submit_team", {
        p_team_id: fx.teamId,
        p_idempotency_key: key,
      });
      expect(first.error).toBeNull();
      expect((first.data as { replay: boolean }).replay).toBe(false);
      const submittedAt = (first.data as { submitted_at: string }).submitted_at;
      expect(submittedAt).toBeTruthy();

      // Same key again = idempotent replay, NOT a second submission.
      const replay = await captainClient.rpc("submit_team", {
        p_team_id: fx.teamId,
        p_idempotency_key: key,
      });
      expect(replay.error).toBeNull();
      expect((replay.data as { replay: boolean }).replay).toBe(true);
      expect((replay.data as { submitted_at: string }).submitted_at).toBe(submittedAt);

      // A different key after submission is a genuine double-submit: rejected.
      const second = await captainClient.rpc("submit_team", {
        p_team_id: fx.teamId,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(second.error?.message ?? "").toMatch(/already submitted/i);

      // RLS blocks edits once submitted (WITH CHECK submitted_at is null).
      const { data: edited } = await captainClient
        .from("teams")
        .update({ project_name: "Renamed after submit" })
        .eq("id", fx.teamId)
        .select("id");
      expect(edited?.length ?? 0).toBe(0);

      const { data: after } = await svc.from("teams").select("project_name").eq("id", fx.teamId).single();
      expect(after?.project_name).toBe("Aurora");
    } finally {
      await fx.cleanup();
    }
  });

  it("blocks a non-captain member from submitting", async () => {
    const svc = admin();
    const fx = await fixture(svc, { deadlineOffsetMs: 3600_000, complete: true });
    try {
      const memberClient = await asUser(fx.member.email);
      const result = await memberClient.rpc("submit_team", {
        p_team_id: fx.teamId,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message ?? "").toMatch(/only the captain/i);

      const { data: row } = await svc.from("teams").select("submitted_at").eq("id", fx.teamId).single();
      expect(row?.submitted_at).toBeNull();
    } finally {
      await fx.cleanup();
    }
  });

  it("blocks submission after the deadline", async () => {
    const svc = admin();
    const fx = await fixture(svc, { deadlineOffsetMs: -60_000, complete: true });
    try {
      const captainClient = await asUser(fx.captain.email);
      const result = await captainClient.rpc("submit_team", {
        p_team_id: fx.teamId,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message ?? "").toMatch(/deadline/i);

      const { data: row } = await svc.from("teams").select("submitted_at").eq("id", fx.teamId).single();
      expect(row?.submitted_at).toBeNull();
    } finally {
      await fx.cleanup();
    }
  });

  it("rejects an incomplete submission (no repo or video)", async () => {
    const svc = admin();
    const fx = await fixture(svc, { deadlineOffsetMs: 3600_000, complete: false });
    try {
      const captainClient = await asUser(fx.captain.email);
      const result = await captainClient.rpc("submit_team", {
        p_team_id: fx.teamId,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message ?? "").toMatch(/project name|repo URL|video URL/i);
    } finally {
      await fx.cleanup();
    }
  });

  it("serializes concurrent submits so only one wins", async () => {
    const svc = admin();
    const fx = await fixture(svc, { deadlineOffsetMs: 3600_000, complete: true });
    try {
      const captainClient = await asUser(fx.captain.email);
      // Distinct keys racing: exactly one should succeed, the rest see "already submitted".
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          captainClient.rpc("submit_team", {
            p_team_id: fx.teamId,
            p_idempotency_key: crypto.randomUUID(),
          }),
        ),
      );
      const ok = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);
      expect(ok.length).toBe(1);
      expect(failed.length).toBe(4);
      for (const f of failed) expect(f.error?.message ?? "").toMatch(/already submitted/i);
    } finally {
      await fx.cleanup();
    }
  });

  it("blocks a participant who is not on the team from submitting it", async () => {
    const svc = admin();
    const fx = await fixture(svc, { deadlineOffsetMs: 3600_000, complete: true });
    try {
      // A participant on the same event, but on no team — captain of nothing here.
      const strangerClient = await asUser(shared.stranger.email);
      const result = await strangerClient.rpc("submit_team", {
        p_team_id: fx.teamId,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message ?? "").toMatch(/only the captain/i);

      const { data: row } = await svc.from("teams").select("submitted_at").eq("id", fx.teamId).single();
      expect(row?.submitted_at).toBeNull();
    } finally {
      await fx.cleanup();
    }
  });
});
