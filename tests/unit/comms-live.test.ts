import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createUser, signIn } from "../helpers/live";
import WS from "ws";

beforeAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = WS;
});

const LIVE =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!LIVE)("schedule and comms (live)", () => {
  async function admin(): Promise<SupabaseClient> {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function asUser(email: string, password: string): Promise<SupabaseClient> {
    return signIn(email, password);
  }

  it("staff CRUD schedule, chat broadcasts under 2s, and announcement receipts match", async () => {
    const svc = await admin();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const password = "session4-comms-pass-12";
    const users: { id: string }[] = [];
    let eventId: string | null = null;
    let channel: RealtimeChannel | null = null;
    let partB: SupabaseClient | null = null;

    try {
      const makeUser = async (label: string) => {
        const email = `session4.${label}.${suffix}@motf.test`;
        const row = await createUser(svc as never, email, password);
        users.push(row);
        return row;
      };

      const organizer = await makeUser("org");
      const a = await makeUser("a");
      const b = await makeUser("b");

      const { data: event, error: eventErr } = await svc
        .from("events")
        .insert({
          slug: `s4-${suffix}`,
          name: "Session 4 comms fixture",
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 86400000).toISOString(),
          submission_deadline: new Date(Date.now() + 43200000).toISOString(),
          status: "open",
          max_team_size: 5,
        })
        .select("id")
        .single();
      if (eventErr || !event) throw eventErr ?? new Error("event");
      eventId = event.id;

      await svc.from("event_roles").insert([
        { event_id: event.id, user_id: organizer.id, role: "organizer" },
        { event_id: event.id, user_id: a.id, role: "participant" },
        { event_id: event.id, user_id: b.id, role: "participant" },
      ]);

      const { data: team, error: teamErr } = await svc
        .from("teams")
        .insert({ event_id: event.id, name: `Comms ${suffix}` })
        .select("id")
        .single();
      if (teamErr || !team) throw teamErr ?? new Error("team");
      await svc.from("team_members").insert([
        { team_id: team.id, user_id: a.id, role: "captain" },
        { team_id: team.id, user_id: b.id, role: "member" },
      ]);

      const orgClient = await asUser(organizer.email, password);
      const starts = new Date(Date.now() + 3600000).toISOString();
      const { data: item, error: schedErr } = await orgClient
        .from("schedule_items")
        .insert({ event_id: event.id, title: "Kickoff", kind: "session", starts_at: starts, location: "Hall" })
        .select("id, title")
        .single();
      expect(schedErr).toBeNull();
      expect(item?.title).toBe("Kickoff");

      const partA = await asUser(a.email, password);
      const { data: seen } = await partA.from("schedule_items").select("title").eq("id", item!.id);
      expect(seen?.[0]?.title).toBe("Kickoff");

      partB = await asUser(b.email, password);
      const ping = `ping-${suffix}`;
      const statuses: string[] = [];
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      // Held in an object so the subscribe callback's writes are visible to the
      // polling loops below without tripping TS control-flow narrowing.
      const state: { sentAt: number; delivery: { ms: number; body: string } | null } = {
        sentAt: 0,
        delivery: null,
      };

      channel = partB
        .channel(`s4-${suffix}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          const row = payload.new as { body?: string; team_id?: string };
          if (row.team_id !== team.id || state.delivery) return;
          state.delivery = { ms: state.sentAt ? Date.now() - state.sentAt : 0, body: row.body ?? "" };
        })
        .subscribe((status) => {
          statuses.push(status);
        });

      for (let i = 0; i < 150 && !statuses.includes("SUBSCRIBED"); i += 1) {
        await sleep(100);
      }
      expect(statuses, `subscribe never completed: ${statuses.join(",")}`).toContain("SUBSCRIBED");

      // SUBSCRIBED means the channel is joined, NOT that Postgres replication is
      // already streaming to it, so an INSERT fired immediately after can be
      // missed — that race is what made this test flaky under a loaded suite.
      // Settle, then retry the insert a few times. Latency is measured from each
      // individual insert, so the "<2s delivery" assertion stays honest.
      await sleep(750);
      for (let attempt = 0; attempt < 4 && !state.delivery; attempt += 1) {
        state.sentAt = Date.now();
        const { error: chatErr } = await partA.from("messages").insert({
          event_id: event.id,
          channel_type: "team",
          team_id: team.id,
          sender_id: a.id,
          body: ping,
        });
        expect(chatErr).toBeNull();
        for (let i = 0; i < 30 && !state.delivery; i += 1) {
          await sleep(100);
        }
      }

      const chat = state.delivery;
      expect(chat, `chat INSERT never reached the teammate (statuses: ${statuses.join(",")})`).not.toBeNull();
      expect(chat!.body).toBe(ping);
      expect(chat!.ms).toBeLessThan(2000);

      const { data: announcement, error: annErr } = await orgClient
        .from("messages")
        .insert({
          event_id: event.id,
          channel_type: "announcement",
          sender_id: organizer.id,
          body: `Heads up ${suffix}`,
          urgent: true,
        })
        .select("id")
        .single();
      expect(annErr).toBeNull();

      const { error: readA } = await partA.from("announcement_reads").insert({
        message_id: announcement!.id,
        user_id: a.id,
      });
      expect(readA).toBeNull();

      const { data: receipts } = await orgClient
        .from("announcement_reads")
        .select("user_id")
        .eq("message_id", announcement!.id);
      expect(receipts?.map((row) => row.user_id).sort()).toEqual([a.id]);

      const { data: unreadForB } = await partB
        .from("announcement_reads")
        .select("user_id")
        .eq("message_id", announcement!.id);
      expect(unreadForB?.length ?? 0).toBe(0);
    } finally {
      if (channel && partB) await partB.removeChannel(channel);
      if (eventId) await svc.from("events").delete().eq("id", eventId);
      for (const user of users) {
        await svc.auth.admin.deleteUser(user.id);
      }
    }
  }, 40_000);
});
