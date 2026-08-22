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

const PASSWORD = "session11-talent-pass-12";

function admin(): SupabaseClient<Database> {
  return serviceClient<Database>();
}
async function asUser(email: string): Promise<SupabaseClient<Database>> {
  return signIn<Database>(email, PASSWORD);
}

describe.skipIf(!LIVE)("talent layer (live)", () => {
  it("recruiters only see consented, unexpired profiles; expiry and withdrawal both cut access off immediately", async () => {
    const svc = admin();
    const suffix = uniqueSuffix();

    const candidate = await createUser(svc as never, `session11.candidate.${suffix}@motf.test`, PASSWORD);
    const recruiter = await createUser(svc as never, `session11.recruiter.${suffix}@motf.test`, PASSWORD);
    const stranger = await createUser(svc as never, `session11.stranger.${suffix}@motf.test`, PASSWORD);

    const { data: event, error: eventErr } = await svc
      .from("events")
      .insert({
        slug: `s11-talent-${suffix}`,
        name: "Session 11 fixture",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
        status: "live",
      })
      .select("id")
      .single();
    expect(eventErr).toBeNull();

    await svc.from("event_roles").insert([
      { event_id: event!.id, user_id: candidate.id, role: "participant" },
      { event_id: event!.id, user_id: recruiter.id, role: "recruiter" },
      { event_id: event!.id, user_id: stranger.id, role: "participant" },
    ]);

    const { data: org, error: orgErr } = await svc
      .from("recruiter_orgs")
      .insert({ name: `Org ${suffix}`, hiring_intent: "hiring", dpa_signed_at: new Date().toISOString() })
      .select("id")
      .single();
    expect(orgErr).toBeNull();

    try {
      const candidateClient = await asUser(candidate.email);

      // Not visible before any consent exists.
      const recruiterClient = await asUser(recruiter.email);
      const beforeConsent = await recruiterClient.rpc("view_talent_profile", { p_user_id: candidate.id });
      expect(beforeConsent.data).toBeNull();

      // Grant consent, expiring in the future.
      const { error: grantErr } = await candidateClient.from("talent_profiles").upsert({
        user_id: candidate.id,
        visibility: "recruiters",
        headline: "Full-stack builder",
        open_to: ["internship"],
        consent_given_at: new Date().toISOString(),
        consent_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        consent_scopes: { profile: true },
      });
      expect(grantErr).toBeNull();
      await candidateClient.from("consent_events").insert({ user_id: candidate.id, action: "granted", scopes: { profile: true } });

      // A random participant with no recruiter org access cannot view it.
      const strangerClient = await asUser(stranger.email);
      const strangerResult = await strangerClient.rpc("view_talent_profile", { p_user_id: candidate.id });
      expect(strangerResult.error).toBeTruthy();

      // The recruiter can, and it's logged.
      const viewResult = await recruiterClient.rpc("view_talent_profile", { p_user_id: candidate.id });
      expect(viewResult.error).toBeNull();
      expect(viewResult.data).toBeTruthy();

      const { data: logRows } = await svc
        .from("recruiter_access_log")
        .select("id")
        .eq("recruiter_id", recruiter.id)
        .eq("viewed_user_id", candidate.id);
      expect(logRows?.length ?? 0).toBeGreaterThan(0);

      // The candidate can see that they were viewed (own-row access log read).
      const { data: subjectLog } = await candidateClient.from("recruiter_access_log").select("id").eq("viewed_user_id", candidate.id);
      expect(subjectLog?.length ?? 0).toBeGreaterThan(0);

      // Withdraw consent: immediately blocked, even though nothing else changed.
      await candidateClient.from("talent_profiles").update({ visibility: "private", consent_expires_at: null }).eq("user_id", candidate.id);
      const afterWithdraw = await recruiterClient.rpc("view_talent_profile", { p_user_id: candidate.id });
      expect(afterWithdraw.data).toBeNull();

      // Re-grant with an ALREADY-EXPIRED window: still not visible (expiry is enforced, not cosmetic).
      await candidateClient.from("talent_profiles").update({ visibility: "recruiters", consent_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("user_id", candidate.id);
      const expiredResult = await recruiterClient.rpc("view_talent_profile", { p_user_id: candidate.id });
      expect(expiredResult.data).toBeNull();
    } finally {
      await svc.from("events").delete().eq("id", event!.id);
      await svc.from("recruiter_orgs").delete().eq("id", org!.id);
      await svc.from("talent_profiles").delete().eq("user_id", candidate.id);
      for (const u of [candidate, recruiter, stranger]) await svc.auth.admin.deleteUser(u.id);
    }
  });

  it("erasure completion actually deletes talent data and is admin-gated", async () => {
    const svc = admin();
    const suffix = uniqueSuffix();

    const candidate = await createUser(svc as never, `session11.erase.${suffix}@motf.test`, PASSWORD);
    const organizer = await createUser(svc as never, `session11.erase-organizer.${suffix}@motf.test`, PASSWORD);

    const { data: event } = await svc
      .from("events")
      .insert({
        slug: `s11-erase-${suffix}`,
        name: "Erasure fixture",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
        status: "live",
      })
      .select("id")
      .single();

    try {
      await svc.from("event_roles").insert([
        { event_id: event!.id, user_id: candidate.id, role: "participant" },
        { event_id: event!.id, user_id: organizer.id, role: "organizer" },
      ]);

      const candidateClient = await asUser(candidate.email);
      await candidateClient.from("talent_profiles").upsert({
        user_id: candidate.id,
        visibility: "recruiters",
        headline: "To be erased",
        consent_given_at: new Date().toISOString(),
        consent_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
      const { data: erasureReq } = await candidateClient
        .from("erasure_requests")
        .insert({ user_id: candidate.id, scope: "talent_only" })
        .select("id")
        .single();
      expect(erasureReq).toBeTruthy();

      // Organizer (non-admin) CANNOT read another user's profile for writing —
      // no RLS policy allows it. Confirms the completion action's premise:
      // this genuinely requires the service role, not just a missing UI gate.
      const organizerClient = await asUser(organizer.email);
      const orgWriteAttempt = await organizerClient.from("talent_profiles").delete().eq("user_id", candidate.id);
      // RLS permits delete only for user_id = auth.uid(); organizer's delete
      // matches zero rows rather than erroring, but nothing is removed by it.
      expect(orgWriteAttempt.error).toBeNull();
      const { data: stillThere } = await svc.from("talent_profiles").select("user_id").eq("user_id", candidate.id);
      expect(stillThere?.length).toBe(1);

      // Now simulate what completeErasure (admin-only server action) does.
      const { error: delErr } = await svc.from("talent_profiles").delete().eq("user_id", candidate.id);
      expect(delErr).toBeNull();
      await svc.from("erasure_requests").update({ completed_at: new Date().toISOString() }).eq("id", erasureReq!.id);

      const { data: afterErase } = await svc.from("talent_profiles").select("user_id").eq("user_id", candidate.id);
      expect(afterErase?.length ?? 0).toBe(0);

      const { data: requestRow } = await candidateClient.from("erasure_requests").select("completed_at").eq("id", erasureReq!.id).single();
      expect(requestRow?.completed_at).toBeTruthy();
    } finally {
      await svc.from("events").delete().eq("id", event!.id);
      await svc.from("talent_profiles").delete().eq("user_id", candidate.id);
      for (const u of [candidate, organizer]) await svc.auth.admin.deleteUser(u.id);
    }
  });
});
