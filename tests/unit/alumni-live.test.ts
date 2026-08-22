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

const PASSWORD = "session12-alumni-pass-12";

function admin(): SupabaseClient<Database> {
  return serviceClient<Database>();
}
async function asUser(email: string): Promise<SupabaseClient<Database>> {
  return signIn<Database>(email, PASSWORD);
}

describe.skipIf(!LIVE)("alumni network (live)", () => {
  it("directory is gated on submission, RPC respects alumni-only + consent, posts are author-scoped", async () => {
    const svc = admin();
    const suffix = uniqueSuffix();

    const alum = await createUser(svc as never, `session12.alum.${suffix}@motf.test`, PASSWORD);
    const nonAlum = await createUser(svc as never, `session12.nonalum.${suffix}@motf.test`, PASSWORD);
    const otherAlum = await createUser(svc as never, `session12.other.${suffix}@motf.test`, PASSWORD);

    const { data: event } = await svc
      .from("events")
      .insert({
        slug: `s12-alumni-${suffix}`,
        name: "Session 12 fixture",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
        status: "live",
      })
      .select("id")
      .single();

    try {
      await svc.from("event_roles").insert([
        { event_id: event!.id, user_id: alum.id, role: "participant" },
        { event_id: event!.id, user_id: nonAlum.id, role: "participant" },
        { event_id: event!.id, user_id: otherAlum.id, role: "participant" },
      ]);

      // alum + otherAlum submitted; nonAlum did not.
      const { data: teamA } = await svc.from("teams").insert({ event_id: event!.id, name: `Alum team A ${suffix}`, submitted_at: new Date().toISOString() }).select("id").single();
      await svc.from("team_members").insert({ team_id: teamA!.id, user_id: alum.id, role: "captain" });

      const { data: teamB } = await svc.from("teams").insert({ event_id: event!.id, name: `Alum team B ${suffix}`, submitted_at: new Date().toISOString() }).select("id").single();
      await svc.from("team_members").insert({ team_id: teamB!.id, user_id: otherAlum.id, role: "captain" });

      const { data: teamC } = await svc.from("teams").insert({ event_id: event!.id, name: `Non-alum team ${suffix}` }).select("id").single();
      await svc.from("team_members").insert({ team_id: teamC!.id, user_id: nonAlum.id, role: "captain" });

      const alumClient = await asUser(alum.email);
      const otherAlumClient = await asUser(otherAlum.email);
      const nonAlumClient = await asUser(nonAlum.email);

      // is_alumnus check, both directions.
      const alumStatus = await alumClient.rpc("auth_is_alumnus");
      expect(alumStatus.data).toBe(true);
      const nonAlumStatus = await nonAlumClient.rpc("auth_is_alumnus");
      expect(nonAlumStatus.data).toBe(false);

      // otherAlum grants consent, visibility=alumni.
      await otherAlumClient.from("talent_profiles").upsert({
        user_id: otherAlum.id,
        visibility: "alumni",
        headline: "Backend person",
        consent_given_at: new Date().toISOString(),
        consent_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });

      // A non-alumnus cannot call view_alumni_profile even with a valid target.
      const nonAlumView = await nonAlumClient.rpc("view_alumni_profile", { p_user_id: otherAlum.id });
      expect(nonAlumView.error).toBeTruthy();

      // A real alumnus can, and gets the joined profile.
      const alumView = await alumClient.rpc("view_alumni_profile", { p_user_id: otherAlum.id });
      expect(alumView.error).toBeNull();
      expect((alumView.data as { headline: string } | null)?.headline).toBe("Backend person");

      // Directory list itself: nonAlum's talent_profiles row (none created) — irrelevant;
      // the key check is otherAlum's row shows up in a plain RLS-scoped select for alum.
      const { data: directoryRows } = await alumClient.from("talent_profiles").select("user_id").eq("visibility", "alumni");
      expect(directoryRows?.some((r) => r.user_id === otherAlum.id)).toBe(true);

      // Posts: alum creates, otherAlum cannot delete it; alum can.
      const { data: post, error: postErr } = await alumClient
        .from("alumni_posts")
        .insert({ author_id: alum.id, kind: "update", title: "Shipped something", body: "body" })
        .select("id")
        .single();
      expect(postErr).toBeNull();

      const foreignDelete = await otherAlumClient.from("alumni_posts").delete().eq("id", post!.id);
      const { data: stillThere } = await svc.from("alumni_posts").select("id").eq("id", post!.id);
      expect(stillThere?.length).toBe(1);
      void foreignDelete;

      const ownDelete = await alumClient.from("alumni_posts").delete().eq("id", post!.id);
      expect(ownDelete.error).toBeNull();

      // Intro requests: only an alumnus can be requester (RLS), and nonAlum is blocked.
      const nonAlumIntro = await nonAlumClient.from("intro_requests").insert({
        requester_id: nonAlum.id,
        target_id: otherAlum.id,
        context: "hi",
      });
      expect(nonAlumIntro.error).toBeTruthy();

      const { data: intro, error: introErr } = await alumClient
        .from("intro_requests")
        .insert({ requester_id: alum.id, target_id: otherAlum.id, context: "let's connect" })
        .select("id")
        .single();
      expect(introErr).toBeNull();

      // Target can respond; a stranger cannot.
      const strangerRespond = await nonAlumClient.from("intro_requests").update({ status: "accepted" }).eq("id", intro!.id);
      const { data: stillPending } = await svc.from("intro_requests").select("status").eq("id", intro!.id).single();
      expect(stillPending?.status).toBe("pending");
      void strangerRespond;

      const targetRespond = await otherAlumClient.from("intro_requests").update({ status: "accepted" }).eq("id", intro!.id);
      expect(targetRespond.error).toBeNull();
      const { data: nowAccepted } = await svc.from("intro_requests").select("status").eq("id", intro!.id).single();
      expect(nowAccepted?.status).toBe("accepted");
    } finally {
      await svc.from("events").delete().eq("id", event!.id);
      await svc.from("talent_profiles").delete().eq("user_id", otherAlum.id);
      for (const u of [alum, nonAlum, otherAlum]) await svc.auth.admin.deleteUser(u.id);
    }
  });
});
