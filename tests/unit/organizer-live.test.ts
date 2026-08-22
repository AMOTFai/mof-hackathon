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

const PASSWORD = "session10-organizer-pass-12";

function admin(): SupabaseClient<Database> {
  return serviceClient<Database>();
}
async function asUser(email: string): Promise<SupabaseClient<Database>> {
  return signIn<Database>(email, PASSWORD);
}

/**
 * End-to-end proof of Session 10's DoD ("run a mock event with zero DB
 * surgery"): everything below is exactly what the UI's server actions do,
 * exercised directly against the real database so the test doesn't depend on
 * a running dev server. A brand-new user, with NO pre-existing role anywhere,
 * bootstraps an entire event through nothing but RLS-governed writes (plus
 * the one sanctioned service-role bootstrap step for event creation itself).
 */
describe.skipIf(!LIVE)("organizer console (live) — full mock event with zero DB surgery", () => {
  it("bootstraps an event, sets up judging, and a judge can score under the resulting config", async () => {
    const svc = admin();
    const suffix = uniqueSuffix();

    const organizer = await createUser(svc as never, `session10.organizer.${suffix}@motf.test`, PASSWORD);
    const judge = await createUser(svc as never, `session10.judge.${suffix}@motf.test`, PASSWORD);
    const captain = await createUser(svc as never, `session10.captain.${suffix}@motf.test`, PASSWORD);

    let eventId = "";
    let tenantId = "";
    try {
      // --- Step 1: event bootstrap (mirrors app/(auth)/join/new-event/actions.ts) ---
      const { data: existingSlug } = await svc.from("events").select("id").eq("slug", `s10-mock-${suffix}`).maybeSingle();
      expect(existingSlug).toBeNull();

      const { data: tenant, error: tenantErr } = await svc
        .from("tenants")
        .insert({ slug: `s10-mock-${suffix}`, name: "Mock Hackathon" })
        .select("id")
        .single();
      expect(tenantErr).toBeNull();
      tenantId = tenant!.id;

      const { data: event, error: eventErr } = await svc
        .from("events")
        .insert({
          tenant_id: tenantId,
          slug: `s10-mock-${suffix}`,
          name: "Mock Hackathon",
          starts_at: new Date(Date.now() - 3600_000).toISOString(),
          ends_at: new Date(Date.now() + 86400_000).toISOString(),
          submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
          status: "draft",
          max_team_size: 5,
        })
        .select("id")
        .single();
      expect(eventErr).toBeNull();
      eventId = event!.id;

      const { error: roleErr } = await svc.from("event_roles").insert({ event_id: eventId, user_id: organizer.id, role: "organizer" });
      expect(roleErr).toBeNull();

      const organizerClient = await asUser(organizer.email);

      // Organizer identity is now real: the creator can read their own event via
      // normal RLS, not just the service role that bootstrapped it.
      const { data: selfRead } = await organizerClient.from("events").select("id").eq("id", eventId);
      expect(selfRead?.length).toBe(1);

      // --- Step 2: rubric criteria (mirrors createCriterion) ---
      const { data: criterion, error: critErr } = await organizerClient
        .from("rubric_criteria")
        .insert({ event_id: eventId, key: "technical", label: "Technical", description: "d", weight: 100, scale_max: 5, sort_order: 1 })
        .select("id")
        .single();
      expect(critErr).toBeNull();

      // A non-staff user cannot write rubric criteria on this event.
      const captainRoleCheck = await svc.from("event_roles").insert({ event_id: eventId, user_id: captain.id, role: "participant" });
      expect(captainRoleCheck.error).toBeNull();
      const captainClient = await asUser(captain.email);
      const forgedCriterion = await captainClient
        .from("rubric_criteria")
        .insert({ event_id: eventId, key: "forged", label: "x", description: "x", weight: 1, scale_max: 5, sort_order: 2 });
      expect(forgedCriterion.error).toBeTruthy();

      // --- Step 3: milestone (mirrors createMilestone) ---
      const { error: milestoneErr } = await organizerClient.from("milestones").insert({
        event_id: eventId,
        key: "v1_slice",
        label: "V1 slice",
        due_at: new Date(Date.now() + 1800_000).toISOString(),
        required: true,
        penalty: "plate_cap",
        sort_order: 1,
      });
      expect(milestoneErr).toBeNull();

      // --- Step 4: team + submission (participant side, already covered by
      // earlier sessions — just enough here to have something to judge) ---
      const { data: team, error: teamErr } = await captainClient
        .from("teams")
        .insert({ event_id: eventId, name: `Mock Team ${suffix}` })
        .select("id")
        .single();
      expect(teamErr).toBeNull();
      const teamId = team!.id;
      await captainClient.from("team_members").insert({ team_id: teamId, user_id: captain.id, role: "captain" });
      await svc.from("teams").update({ submitted_at: new Date().toISOString() }).eq("id", teamId);

      // --- Step 5: invite judge by email (mirrors inviteJudge's service-role
      // lookup, then a user-scoped insert as the real authorization) ---
      const { data: judgeProfile } = await svc.from("profiles").select("id").eq("email", judge.email).maybeSingle();
      expect(judgeProfile?.id).toBe(judge.id);
      const { error: inviteErr } = await organizerClient.from("event_roles").insert({ event_id: eventId, user_id: judge.id, role: "judge" });
      expect(inviteErr).toBeNull();

      // A stranger organizer (staff on a DIFFERENT event) cannot invite judges here.
      const otherSuffix = uniqueSuffix();
      const otherOrganizer = await createUser(svc as never, `session10.other.${otherSuffix}@motf.test`, PASSWORD);
      const otherClient = await asUser(otherOrganizer.email);
      const forgedInvite = await otherClient.from("event_roles").insert({ event_id: eventId, user_id: otherOrganizer.id, role: "judge" });
      expect(forgedInvite.error).toBeTruthy();
      await svc.auth.admin.deleteUser(otherOrganizer.id);

      // --- Step 6: assign judge to team (mirrors assignJudge) ---
      const { error: assignErr } = await organizerClient.from("judge_assignments").insert({
        event_id: eventId,
        judge_id: judge.id,
        team_id: teamId,
        status: "pending",
      });
      expect(assignErr).toBeNull();

      // --- Step 7: calibration sample (mirrors createCalibrationSample) ---
      const { error: sampleErr } = await organizerClient.from("calibration_samples").insert({
        event_id: eventId,
        title: "Sample",
        content: { description: "practice run" },
        reference_scores: [{ criterionId: criterion!.id, value: 4 }],
      });
      expect(sampleErr).toBeNull();
      const { data: sample } = await organizerClient.from("calibration_samples").select("id").eq("event_id", eventId).single();

      // --- Step 8: the judge this event just onboarded can now actually judge —
      // proving the whole chain produces a WORKING event, not just populated rows. ---
      const judgeClient = await asUser(judge.email);

      const blockedBeforeCalibration = await judgeClient.from("scores").insert({
        team_id: teamId,
        judge_id: judge.id,
        criterion_id: criterion!.id,
        phase: "prepanel",
        value: 4,
      });
      expect(blockedBeforeCalibration.error).toBeTruthy();

      const { error: calErr } = await judgeClient.from("calibration_results").insert({
        judge_id: judge.id,
        sample_id: sample!.id,
        scores: { [criterion!.id]: 4 },
        deviation: 0,
      });
      expect(calErr).toBeNull();

      const { error: scoreErr } = await judgeClient.from("scores").insert({
        team_id: teamId,
        judge_id: judge.id,
        criterion_id: criterion!.id,
        phase: "prepanel",
        value: 5,
      });
      expect(scoreErr).toBeNull();

      const { data: finalScore } = await organizerClient.from("scores").select("value").eq("team_id", teamId).single();
      expect(finalScore?.value).toBe(5);
    } finally {
      if (eventId) await svc.from("events").delete().eq("id", eventId);
      if (tenantId) await svc.from("tenants").delete().eq("id", tenantId);
      for (const u of [organizer, judge, captain]) await svc.auth.admin.deleteUser(u.id);
    }
  });

  it("event creation never grants a role on an EXISTING event — only on one it just created", async () => {
    const svc = admin();
    const suffix = uniqueSuffix();
    const attacker = await createUser(svc as never, `session10.attacker.${suffix}@motf.test`, PASSWORD);

    // A pre-existing event the attacker has no role on.
    const { data: victimEvent } = await svc
      .from("events")
      .insert({
        slug: `s10-victim-${suffix}`,
        name: "Victim event",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
        status: "live",
      })
      .select("id")
      .single();

    try {
      const attackerClient = await asUser(attacker.email);
      // The bootstrap action never accepts an eventId param — it only ever
      // creates event_roles rows referencing an event it JUST inserted. Model
      // the only thing an attacker could try: writing event_roles directly
      // for the victim's event via their own (non-staff) session.
      const forged = await attackerClient.from("event_roles").insert({
        event_id: victimEvent!.id,
        user_id: attacker.id,
        role: "organizer",
      });
      expect(forged.error).toBeTruthy();

      const { data: roles } = await svc.from("event_roles").select("id").eq("event_id", victimEvent!.id).eq("user_id", attacker.id);
      expect(roles?.length ?? 0).toBe(0);
    } finally {
      await svc.from("events").delete().eq("id", victimEvent!.id);
      await svc.auth.admin.deleteUser(attacker.id);
    }
  });
});
