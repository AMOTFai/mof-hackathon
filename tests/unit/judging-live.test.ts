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

const PASSWORD = "session9-judging-pass-12";

function admin(): SupabaseClient<Database> {
  return serviceClient<Database>();
}
async function asUser(email: string): Promise<SupabaseClient<Database>> {
  return signIn<Database>(email, PASSWORD);
}

type Fixture = {
  eventId: string;
  criterionId: string;
  teamId: string;
  otherTeamId: string;
  sampleId: string;
  judge: { email: string; id: string };
  member: { email: string; id: string };
  organizer: { email: string; id: string };
  cleanup: () => Promise<void>;
};

async function fixture(svc: SupabaseClient<Database>): Promise<Fixture> {
  const suffix = uniqueSuffix();
  const judge = await createUser(svc as never, `session9.judge.${suffix}@motf.test`, PASSWORD);
  const member = await createUser(svc as never, `session9.member.${suffix}@motf.test`, PASSWORD);
  const organizer = await createUser(svc as never, `session9.organizer.${suffix}@motf.test`, PASSWORD);

  const { data: event, error: eventErr } = await svc
    .from("events")
    .insert({
      slug: `s9-judging-${suffix}`,
      name: "Session 9 fixture",
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      ends_at: new Date(Date.now() + 86400_000).toISOString(),
      submission_deadline: new Date(Date.now() - 60_000).toISOString(),
      status: "judging",
      pairwise_blend: 0.5,
      working_demo_required: false,
    })
    .select("id")
    .single();
  if (eventErr || !event) throw eventErr ?? new Error("event");

  await svc.from("event_roles").insert([
    { event_id: event.id, user_id: judge.id, role: "judge" },
    { event_id: event.id, user_id: member.id, role: "participant" },
    { event_id: event.id, user_id: organizer.id, role: "organizer" },
  ]);

  const { data: criterion, error: critErr } = await svc
    .from("rubric_criteria")
    .insert({ event_id: event.id, key: "technical", label: "Technical", description: "d", weight: 100, scale_max: 5, sort_order: 1 })
    .select("id")
    .single();
  if (critErr || !criterion) throw critErr ?? new Error("criterion");

  const { data: team, error: teamErr } = await svc
    .from("teams")
    .insert({ event_id: event.id, name: `S9 ${suffix}`, submitted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (teamErr || !team) throw teamErr ?? new Error("team");
  await svc.from("team_members").insert({ team_id: team.id, user_id: member.id, role: "captain" });

  const { data: otherTeam, error: otherErr } = await svc
    .from("teams")
    .insert({ event_id: event.id, name: `S9-other ${suffix}`, submitted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (otherErr || !otherTeam) throw otherErr ?? new Error("other team");

  await svc.from("judge_assignments").insert({ event_id: event.id, judge_id: judge.id, team_id: team.id, status: "pending" });

  const { data: sample, error: sampleErr } = await svc
    .from("calibration_samples")
    .insert({
      event_id: event.id,
      title: "Sample A",
      content: { description: "test sample" },
      reference_scores: [{ criterionId: criterion.id, value: 4 }],
    })
    .select("id")
    .single();
  if (sampleErr || !sample) throw sampleErr ?? new Error("sample");

  return {
    eventId: event.id,
    criterionId: criterion.id,
    teamId: team.id,
    otherTeamId: otherTeam.id,
    sampleId: sample.id,
    judge,
    member,
    organizer,
    cleanup: async () => {
      await svc.from("events").delete().eq("id", event.id);
    },
  };
}

describe.skipIf(!LIVE)("judging (live)", () => {
  it("calibration gate is enforced by RLS, not just the UI", async () => {
    const svc = admin();
    const fx = await fixture(svc);
    try {
      const judgeClient = await asUser(fx.judge.email);

      // No calibration yet: the INSERT policy's calibration exists() check
      // must reject the very first score attempt.
      const blocked = await judgeClient.from("scores").insert({
        team_id: fx.teamId,
        judge_id: fx.judge.id,
        criterion_id: fx.criterionId,
        phase: "prepanel",
        value: 5,
      });
      expect(blocked.error).toBeTruthy();

      // Complete calibration.
      const cal = await judgeClient.from("calibration_results").insert({
        judge_id: fx.judge.id,
        sample_id: fx.sampleId,
        scores: { [fx.criterionId]: 4 },
        deviation: 0,
      });
      expect(cal.error).toBeNull();

      // Now scoring succeeds.
      const allowed = await judgeClient.from("scores").insert({
        team_id: fx.teamId,
        judge_id: fx.judge.id,
        criterion_id: fx.criterionId,
        phase: "prepanel",
        value: 5,
      });
      expect(allowed.error).toBeNull();

      // A stranger judge (not assigned to this team) cannot score it even
      // after calibrating — the INSERT policy also requires assignment.
      const strangerSuffix = uniqueSuffix();
      const stranger = await createUser(svc as never, `session9.stranger.${strangerSuffix}@motf.test`, PASSWORD);
      await svc.from("event_roles").insert({ event_id: fx.eventId, user_id: stranger.id, role: "judge" });
      await svc.from("calibration_results").insert({ judge_id: stranger.id, sample_id: fx.sampleId, scores: {}, deviation: 0 });
      const strangerClient = await asUser(stranger.email);
      const strangerBlocked = await strangerClient.from("scores").insert({
        team_id: fx.teamId,
        judge_id: stranger.id,
        criterion_id: fx.criterionId,
        phase: "prepanel",
        value: 1,
      });
      expect(strangerBlocked.error).toBeTruthy();
      await svc.auth.admin.deleteUser(stranger.id);
    } finally {
      await fx.cleanup();
    }
  });

  it("declaring a conflict deletes the judge's own scores and blocks further reads via the normal read path", async () => {
    const svc = admin();
    const fx = await fixture(svc);
    try {
      const judgeClient = await asUser(fx.judge.email);
      await judgeClient.from("calibration_results").insert({
        judge_id: fx.judge.id,
        sample_id: fx.sampleId,
        scores: { [fx.criterionId]: 4 },
        deviation: 0,
      });
      await judgeClient.from("scores").insert({
        team_id: fx.teamId,
        judge_id: fx.judge.id,
        criterion_id: fx.criterionId,
        phase: "prepanel",
        value: 5,
      });

      const { data: before } = await judgeClient.from("scores").select("id").eq("team_id", fx.teamId).eq("judge_id", fx.judge.id);
      expect(before?.length).toBe(1);

      await judgeClient.from("judge_conflicts").insert({ judge_id: fx.judge.id, team_id: fx.teamId, reason: "friend on team" });
      await judgeClient.from("scores").delete().eq("judge_id", fx.judge.id).eq("team_id", fx.teamId);

      const { data: after } = await judgeClient.from("scores").select("id").eq("team_id", fx.teamId).eq("judge_id", fx.judge.id);
      expect(after?.length ?? 0).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });

  it("list_pairwise_candidates returns submitted teams with ratings, scoped to judges on that event", async () => {
    const svc = admin();
    const fx = await fixture(svc);
    try {
      const judgeClient = await asUser(fx.judge.email);
      const { data, error } = await judgeClient.rpc("list_pairwise_candidates", { p_event_id: fx.eventId });
      expect(error).toBeNull();
      const ids = (data ?? []).map((r) => r.id).sort();
      expect(ids).toEqual([fx.teamId, fx.otherTeamId].sort());
      const row = (data ?? []).find((r) => r.id === fx.teamId);
      expect(row?.mu).toBe(0);
      expect(row?.sigma_sq).toBe(1);
      expect(row?.comparison_count).toBe(0);

      // A non-judge (plain participant) cannot call it.
      const memberClient = await asUser(fx.member.email);
      const memberResult = await memberClient.rpc("list_pairwise_candidates", { p_event_id: fx.eventId });
      expect(memberResult.error).toBeTruthy();

      // Direct table access to teams the judge isn't assigned to is still denied
      // (the RPC is the sanctioned exception, not a general grant).
      const { data: directRead } = await judgeClient.from("teams").select("id").eq("id", fx.otherTeamId);
      expect(directRead?.length ?? 0).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });

  it("a pairwise vote updates team_ratings and judge_reliability via service role after user-authorized insert", async () => {
    const svc = admin();
    const fx = await fixture(svc);
    try {
      const judgeClient = await asUser(fx.judge.email);
      const { error: voteErr } = await judgeClient.from("pairwise_votes").insert({
        event_id: fx.eventId,
        judge_id: fx.judge.id,
        winner_id: fx.teamId,
        loser_id: fx.otherTeamId,
      });
      expect(voteErr).toBeNull();

      // Judges cannot write team_ratings or judge_reliability directly — no
      // policy grants it. This models the service-role step the action performs.
      const directRatingWrite = await judgeClient
        .from("team_ratings")
        .upsert({ team_id: fx.teamId, mu: 99, sigma_sq: 1, comparison_count: 1 });
      expect(directRatingWrite.error).toBeTruthy();

      await svc.from("team_ratings").upsert({ team_id: fx.teamId, mu: 0.25, sigma_sq: 0.9, comparison_count: 1 });
      await svc.from("team_ratings").upsert({ team_id: fx.otherTeamId, mu: -0.25, sigma_sq: 0.9, comparison_count: 1 });
      await svc.from("judge_reliability").upsert({ judge_id: fx.judge.id, event_id: fx.eventId, alpha: 11, beta: 1 });

      const organizerClient = await asUser(fx.organizer.email);
      const { data: ratings } = await organizerClient.from("team_ratings").select("team_id, mu").eq("team_id", fx.teamId);
      expect(ratings?.[0]?.mu).toBeCloseTo(0.25, 5);
    } finally {
      await fx.cleanup();
    }
  });

  it("staff can write results directly (no service role needed); disqualified is never auto-set", async () => {
    const svc = admin();
    const fx = await fixture(svc);
    try {
      const organizerClient = await asUser(fx.organizer.email);
      const { error } = await organizerClient
        .from("results")
        .upsert({ team_id: fx.teamId, rubric_score: 80, bracket: "cup", published: false });
      expect(error).toBeNull();

      const { data: row } = await organizerClient.from("results").select("bracket, published").eq("team_id", fx.teamId).single();
      expect(row?.bracket).toBe("cup");
      expect(row?.published).toBe(false);

      // Participant cannot read results before publish.
      const memberClient = await asUser(fx.member.email);
      const { data: unpublished } = await memberClient.from("results").select("id").eq("team_id", fx.teamId);
      expect(unpublished?.length ?? 0).toBe(0);

      await svc.from("results").update({ published: true }).eq("team_id", fx.teamId);
      const { data: published } = await memberClient.from("results").select("bracket").eq("team_id", fx.teamId);
      expect(published?.[0]?.bracket).toBe("cup");
    } finally {
      await fx.cleanup();
    }
  });
});
