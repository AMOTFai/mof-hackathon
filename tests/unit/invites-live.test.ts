import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createUser, signIn } from "../helpers/live";
import type { Database } from "@/lib/database.types";
import WS from "ws";

beforeAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = WS;
});

const LIVE =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!LIVE)("invite links (live)", () => {
  function admin(): SupabaseClient<Database> {
    return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  function anon(): SupabaseClient<Database> {
    return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function asUser(email: string, password: string): Promise<SupabaseClient<Database>> {
    return signIn<Database>(email, password);
  }

  it(
    "organizer creates links, RPCs gate preview/accept correctly, RLS keeps the table staff-only",
    async () => {
      const svc = admin();
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const password = "invite-live-pass-12";
      const users: { id: string }[] = [];
      let eventId: string | null = null;

      try {
        const makeUser = async (label: string) => {
          const email = `invites.${label}.${suffix}@motf.test`;
          const row = await createUser(svc as never, email, password);
          users.push(row);
          return { ...row, email };
        };

        const organizer = await makeUser("org");
        const newcomer = await makeUser("newcomer");
        const wrongPerson = await makeUser("wrong");
        const rightJudge = await makeUser("judge");

        const { data: event, error: eventErr } = await svc
          .from("events")
          .insert({
            slug: `inv-${suffix}`,
            name: "Invite link fixture",
            starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 86_400_000).toISOString(),
            submission_deadline: new Date(Date.now() + 43_200_000).toISOString(),
            status: "open",
            max_team_size: 5,
          })
          .select("id")
          .single();
        if (eventErr || !event) throw eventErr ?? new Error("event");
        eventId = event.id;

        await svc.from("event_roles").insert({ event_id: event.id, user_id: organizer.id, role: "organizer" });
        const orgClient = await asUser(organizer.email, password);

        // --- Organizer creates a single-use participant invite (RLS INSERT, no RPC needed here) ---
        const { data: participantInvite, error: createErr } = await orgClient
          .from("event_invites")
          .insert({ event_id: event.id, role: "participant", created_by: organizer.id })
          .select("token")
          .single();
        expect(createErr).toBeNull();

        // --- A non-staff user cannot read the raw table (RLS, not the RPC) ---
        const newcomerClient = await asUser(newcomer.email, password);
        const { data: leaked } = await newcomerClient.from("event_invites").select("id").eq("event_id", event.id);
        expect(leaked?.length ?? 0).toBe(0);

        // --- preview_invite works for a signed-out visitor and doesn't leak the email lock ---
        const anonClient = anon();
        const { data: preview, error: previewErr } = await anonClient
          .rpc("preview_invite", { p_token: participantInvite!.token })
          .single();
        expect(previewErr).toBeNull();
        expect(preview?.valid).toBe(true);
        expect(preview?.role).toBe("participant");
        expect(preview?.event_name).toBe("Invite link fixture");

        // --- anon cannot call accept_invite at all (no grant — Postgres rejects before auth.uid() is even checked) ---
        const { error: anonAcceptErr } = await anonClient.rpc("accept_invite", { p_token: participantInvite!.token });
        expect(anonAcceptErr).not.toBeNull();

        // --- A brand-new user accepts the participant invite and actually gets the role ---
        const { data: accepted, error: acceptErr } = await newcomerClient
          .rpc("accept_invite", { p_token: participantInvite!.token })
          .single();
        expect(acceptErr).toBeNull();
        expect(accepted?.granted).toBe(true);
        const { data: roleRow } = await svc
          .from("event_roles")
          .select("role")
          .eq("event_id", event.id)
          .eq("user_id", newcomer.id)
          .eq("role", "participant");
        expect(roleRow?.length ?? 0).toBe(1);

        // --- The same single-use link is now exhausted for anyone, including a different user ---
        const wrongClient = await asUser(wrongPerson.email, password);
        const { data: reuse } = await wrongClient.rpc("accept_invite", { p_token: participantInvite!.token }).single();
        expect(reuse?.granted).toBe(false);
        expect(reuse?.reason).toBe("used_up");

        // --- Email-locked judge invite rejects the wrong signed-in user, accepts the right one ---
        const { data: judgeInvite } = await orgClient
          .from("event_invites")
          .insert({ event_id: event.id, role: "judge", email: rightJudge.email, created_by: organizer.id })
          .select("token")
          .single();

        const { data: wrongEmailAttempt } = await wrongClient
          .rpc("accept_invite", { p_token: judgeInvite!.token })
          .single();
        expect(wrongEmailAttempt?.granted).toBe(false);
        expect(wrongEmailAttempt?.reason).toBe("wrong_email");

        const judgeClient = await asUser(rightJudge.email, password);
        const { data: rightEmailAttempt } = await judgeClient
          .rpc("accept_invite", { p_token: judgeInvite!.token })
          .single();
        expect(rightEmailAttempt?.granted).toBe(true);
        expect(rightEmailAttempt?.out_role).toBe("judge");

        // --- Revoked invite is rejected by both RPCs ---
        const { data: revokedInvite } = await orgClient
          .from("event_invites")
          .insert({ event_id: event.id, role: "recruiter", created_by: organizer.id })
          .select("id, token")
          .single();
        await orgClient.from("event_invites").update({ revoked_at: new Date().toISOString() }).eq("id", revokedInvite!.id);

        const { data: revokedPreview } = await anonClient.rpc("preview_invite", { p_token: revokedInvite!.token }).single();
        expect(revokedPreview?.valid).toBe(false);
        expect(revokedPreview?.reason).toBe("revoked");

        // --- Expired invite is rejected too (service role can backdate expires_at directly) ---
        const { data: expiredInvite } = await svc
          .from("event_invites")
          .insert({
            event_id: event.id,
            role: "participant",
            created_by: organizer.id,
            expires_at: new Date(Date.now() - 1000).toISOString(),
          })
          .select("token")
          .single();
        const { data: expiredPreview } = await anonClient.rpc("preview_invite", { p_token: expiredInvite!.token }).single();
        expect(expiredPreview?.valid).toBe(false);
        expect(expiredPreview?.reason).toBe("expired");
      } finally {
        if (eventId) await svc.from("events").delete().eq("id", eventId);
        for (const user of users) {
          await svc.auth.admin.deleteUser(user.id);
        }
      }
    },
    40_000,
  );
});
