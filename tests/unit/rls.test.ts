import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createUser, signIn } from "../helpers/live";
import { PUBLIC_TABLES, type PublicTable } from "./tables";

class StubSocket {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
}
beforeAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = StubSocket;
});

const SQL = readFileSync(resolve(__dirname, "../../supabase/migrations/0001_init.sql"), "utf8");

const LIVE =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

type Access = {
  ownerRead: string;
  nonOwnerDenied: string;
  organizerRead: string;
  judgeAssignedOnly: string | null;
  expiredConsentDenied: string | null;
};

/**
 * Per-table access contract from Part 3. Assertions below check the migration
 * SQL encodes these rules. Live cases (same names) hit a real project when
 * .env.local is present.
 */
const ACCESS: Record<PublicTable, Access> = {
  tenants: {
    ownerRead: "authenticated read tenants",
    nonOwnerDenied: "authenticated read tenants",
    organizerRead: "authenticated read tenants",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  profiles: {
    ownerRead: "read own profile",
    nonOwnerDenied: "read own profile",
    organizerRead: "staff read event profiles",
    judgeAssignedOnly: "assigned judge read member profiles",
    expiredConsentDenied: null,
  },
  events: {
    ownerRead: "role holders read event",
    nonOwnerDenied: "role holders read event",
    organizerRead: "role holders read event",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  event_roles: {
    ownerRead: "read own roles",
    nonOwnerDenied: "read own roles",
    organizerRead: "staff read event roles",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  teams: {
    ownerRead: "members read own team",
    nonOwnerDenied: "members read own team",
    organizerRead: "organizers read all teams",
    judgeAssignedOnly: "assigned judges read team",
    expiredConsentDenied: null,
  },
  team_members: {
    ownerRead: "members read roster",
    nonOwnerDenied: "members read roster",
    organizerRead: "members read roster",
    judgeAssignedOnly: "members read roster",
    expiredConsentDenied: null,
  },
  milestones: {
    ownerRead: "event members read milestones",
    nonOwnerDenied: "event members read milestones",
    organizerRead: "event members read milestones",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  check_ins: {
    ownerRead: "team read check_ins",
    nonOwnerDenied: "team read check_ins",
    organizerRead: "team read check_ins",
    judgeAssignedOnly: "team read check_ins",
    expiredConsentDenied: null,
  },
  milestone_status: {
    ownerRead: "read milestone_status",
    nonOwnerDenied: "read milestone_status",
    organizerRead: "read milestone_status",
    judgeAssignedOnly: "read milestone_status",
    expiredConsentDenied: null,
  },
  commits: {
    ownerRead: "read commits",
    nonOwnerDenied: "read commits",
    organizerRead: "read commits",
    judgeAssignedOnly: "read commits",
    expiredConsentDenied: null,
  },
  api_calls: {
    ownerRead: "read api_calls",
    nonOwnerDenied: "read api_calls",
    organizerRead: "read api_calls",
    judgeAssignedOnly: "read api_calls",
    expiredConsentDenied: null,
  },
  rubric_criteria: {
    ownerRead: "read rubric",
    nonOwnerDenied: "read rubric",
    organizerRead: "read rubric",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  judge_assignments: {
    ownerRead: "judge read own assignments",
    nonOwnerDenied: "judge read own assignments",
    organizerRead: "judge read own assignments",
    judgeAssignedOnly: "judge read own assignments",
    expiredConsentDenied: null,
  },
  judge_conflicts: {
    ownerRead: "read conflicts",
    nonOwnerDenied: "read conflicts",
    organizerRead: "read conflicts",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  scores: {
    ownerRead: "judge read own scores",
    nonOwnerDenied: "judge read own scores",
    organizerRead: "staff read scores",
    judgeAssignedOnly: "judge read own scores",
    expiredConsentDenied: null,
  },
  calibration_samples: {
    ownerRead: "judges read samples",
    nonOwnerDenied: "judges read samples",
    organizerRead: "judges read samples",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  calibration_results: {
    ownerRead: "judge read own calibration",
    nonOwnerDenied: "judge read own calibration",
    organizerRead: "judge read own calibration",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  pairwise_votes: {
    ownerRead: "judge read own votes",
    nonOwnerDenied: "judge read own votes",
    organizerRead: "judge read own votes",
    judgeAssignedOnly: "judge read own votes",
    expiredConsentDenied: null,
  },
  team_ratings: {
    ownerRead: "staff read ratings",
    nonOwnerDenied: "staff read ratings",
    organizerRead: "staff read ratings",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  ai_reviews: {
    ownerRead: "read ai_reviews",
    nonOwnerDenied: "read ai_reviews",
    organizerRead: "read ai_reviews",
    judgeAssignedOnly: "read ai_reviews",
    expiredConsentDenied: null,
  },
  results: {
    ownerRead: "team read published results",
    nonOwnerDenied: "team read published results",
    organizerRead: "staff read results",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  judge_reliability: {
    ownerRead: "judge read own reliability",
    nonOwnerDenied: "judge read own reliability",
    organizerRead: "staff read reliability",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  discussion_flags: {
    ownerRead: "read discussion flags",
    nonOwnerDenied: "read discussion flags",
    organizerRead: "read discussion flags",
    judgeAssignedOnly: "read discussion flags",
    expiredConsentDenied: null,
  },
  judge_notes: {
    ownerRead: "read own notes",
    nonOwnerDenied: "read own notes",
    organizerRead: "read own notes",
    judgeAssignedOnly: "read own notes",
    expiredConsentDenied: null,
  },
  ai_review_feedback: {
    ownerRead: "read ai feedback",
    nonOwnerDenied: "read ai feedback",
    organizerRead: "read ai feedback",
    judgeAssignedOnly: "read ai feedback",
    expiredConsentDenied: null,
  },
  sponsors: {
    ownerRead: "read sponsors",
    nonOwnerDenied: "read sponsors",
    organizerRead: "read sponsors",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  challenge_tracks: {
    ownerRead: "read tracks",
    nonOwnerDenied: "read tracks",
    organizerRead: "read tracks",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  team_tracks: {
    ownerRead: "read team_tracks",
    nonOwnerDenied: "read team_tracks",
    organizerRead: "read team_tracks",
    judgeAssignedOnly: "read team_tracks",
    expiredConsentDenied: null,
  },
  schedule_items: {
    ownerRead: "read schedule",
    nonOwnerDenied: "read schedule",
    organizerRead: "read schedule",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  messages: {
    ownerRead: "read team messages",
    nonOwnerDenied: "read team messages",
    organizerRead: "read team messages",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  announcement_reads: {
    ownerRead: "read own announcement receipts",
    nonOwnerDenied: "read own announcement receipts",
    organizerRead: "read own announcement receipts",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  mentors: {
    ownerRead: "read mentors",
    nonOwnerDenied: "read mentors",
    organizerRead: "read mentors",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  mentor_slots: {
    ownerRead: "read mentor slots",
    nonOwnerDenied: "read mentor slots",
    organizerRead: "read mentor slots",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  talent_profiles: {
    ownerRead: "own talent profile",
    nonOwnerDenied: "own talent profile",
    organizerRead: "own talent profile",
    judgeAssignedOnly: null,
    expiredConsentDenied: "recruiters read consented",
  },
  recruiter_orgs: {
    ownerRead: "staff read recruiter orgs",
    nonOwnerDenied: "staff read recruiter orgs",
    organizerRead: "staff read recruiter orgs",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  recruiter_access_log: {
    ownerRead: "subject reads access log",
    nonOwnerDenied: "subject reads access log",
    organizerRead: "staff read access log",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  alumni_posts: {
    ownerRead: "alumni read posts",
    nonOwnerDenied: "alumni read posts",
    organizerRead: "alumni read posts",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  intro_requests: {
    ownerRead: "parties read intros",
    nonOwnerDenied: "parties read intros",
    organizerRead: "parties read intros",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  consent_events: {
    ownerRead: "own consent events",
    nonOwnerDenied: "own consent events",
    organizerRead: "staff read consent events",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
  erasure_requests: {
    ownerRead: "own erasure requests",
    nonOwnerDenied: "own erasure requests",
    organizerRead: "staff read erasure",
    judgeAssignedOnly: null,
    expiredConsentDenied: null,
  },
};

function policiesOn(table: string): string {
  const re = new RegExp(`create policy "[^"]+" on public\\.${table}\\b[\\s\\S]*?;`, "g");
  return [...SQL.matchAll(re)].map((m) => m[0]).join("\n");
}

describe("RLS policy set (every table)", () => {
  it.each(PUBLIC_TABLES)("%s — owner reads", (table) => {
    const spec = ACCESS[table];
    expect(policiesOn(table)).toContain(`create policy "${spec.ownerRead}"`);
  });

  it.each(PUBLIC_TABLES)("%s — non-owner denied (no using (true) on owner policy)", (table) => {
    const spec = ACCESS[table];
    const policies = policiesOn(table);
    expect(policies).toContain(`create policy "${spec.nonOwnerDenied}"`);
    if (table !== "tenants") {
      const owner = policies.match(new RegExp(`create policy "${spec.ownerRead}"[\\s\\S]*?;`))?.[0] ?? "";
      expect(owner).not.toMatch(/using \(true\)/);
    }
  });

  it.each(PUBLIC_TABLES)("%s — organizer reads", (table) => {
    const spec = ACCESS[table];
    expect(policiesOn(table)).toContain(`create policy "${spec.organizerRead}"`);
  });

  it.each(PUBLIC_TABLES.filter((t) => ACCESS[t].judgeAssignedOnly))(
    "%s — judge reads only assigned teams",
    (table) => {
      const spec = ACCESS[table];
      const named = policiesOn(table);
      expect(named).toContain(`create policy "${spec.judgeAssignedOnly}"`);
      expect(named).toMatch(/auth_is_assigned_judge|judge_id = auth\.uid\(\)|assigned judge/);
    },
  );

  it("talent_profiles — expired consent denied", () => {
    const policies = policiesOn("talent_profiles");
    expect(policies).toContain(`create policy "${ACCESS.talent_profiles.expiredConsentDenied}"`);
    expect(policies).toMatch(/consent_expires_at > now\(\)/);
    expect(policies).toMatch(/visibility = 'recruiters'/);
  });

  it("scores are never readable by participants before publication", () => {
    const scores = policiesOn("scores");
    expect(scores).toContain("team read scores after publish");
    expect(scores).toMatch(/results r where r\.team_id = scores\.team_id and r\.published/);
    expect(scores).not.toMatch(/auth_is_team_member\(team_id\)\s*\)\s*;/);
  });

  it("api_calls cannot be read cross-team", () => {
    const calls = policiesOn("api_calls");
    expect(calls).toMatch(/auth_is_team_member\(team_id\)/);
    expect(calls).toMatch(/auth_is_assigned_judge\(team_id\)/);
    expect(calls).not.toMatch(/using \(true\)/);
  });

  it("captain cannot update a team after submission", () => {
    expect(policiesOn("teams")).toMatch(/with check \(submitted_at is null\)/);
  });
});

describe.skipIf(!LIVE)("RLS live project", () => {
  async function admin(): Promise<SupabaseClient> {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function asUser(email: string, password: string): Promise<SupabaseClient> {
    return signIn(email, password);
  }

  it("owner reads, non-owner denied, organizer reads, judge assigned-only, expired consent denied", async () => {
    const svc = await admin();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const password = "rls-test-pass-12";

    const makeUser = async (role: string) => {
      const email = `rls.${role}.${suffix}@motf.test`;
      const user = await createUser(svc as never, email, password);
      return { ...user, role };
    };

    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const organizer = await makeUser("organizer");
    const judge = await makeUser("judge");
    const otherJudge = await makeUser("otherjudge");
    const talent = await makeUser("talent");

    const { data: event, error: eventErr } = await svc
      .from("events")
      .insert({
        slug: `rls-${suffix}`,
        name: "RLS Fixture",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400000).toISOString(),
        submission_deadline: new Date(Date.now() + 43200000).toISOString(),
        status: "live",
      })
      .select("id")
      .single();
    if (eventErr || !event) throw eventErr ?? new Error("event");

    await svc.from("event_roles").insert([
      { event_id: event.id, user_id: owner.id, role: "participant" },
      { event_id: event.id, user_id: organizer.id, role: "organizer" },
      { event_id: event.id, user_id: judge.id, role: "judge" },
      { event_id: event.id, user_id: otherJudge.id, role: "judge" },
      { event_id: event.id, user_id: talent.id, role: "participant" },
    ]);

    const { data: team, error: teamErr } = await svc
      .from("teams")
      .insert({ event_id: event.id, name: `Team ${suffix}` })
      .select("id")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error("team");

    await svc.from("team_members").insert({ team_id: team.id, user_id: owner.id, role: "captain" });
    await svc.from("judge_assignments").insert({
      event_id: event.id,
      judge_id: judge.id,
      team_id: team.id,
      status: "pending",
    });

    await svc.from("check_ins").insert({
      team_id: team.id,
      author_id: owner.id,
      body: "owner check-in",
    });

    await svc.from("talent_profiles").insert({
      user_id: talent.id,
      visibility: "recruiters",
      headline: "expired person",
      consent_given_at: new Date(Date.now() - 86400000).toISOString(),
      consent_expires_at: new Date(Date.now() - 1000).toISOString(),
      consent_scopes: { projects: true },
    });

    const ownerClient = await asUser(owner.email, password);
    const strangerClient = await asUser(stranger.email, password);
    const organizerClient = await asUser(organizer.email, password);
    const judgeClient = await asUser(judge.email, password);
    const otherJudgeClient = await asUser(otherJudge.email, password);

    const { data: ownTeam } = await ownerClient.from("teams").select("id").eq("id", team.id);
    expect(ownTeam?.length).toBe(1);

    const { data: strangerTeam } = await strangerClient.from("teams").select("id").eq("id", team.id);
    expect(strangerTeam?.length ?? 0).toBe(0);

    const { data: orgTeam } = await organizerClient.from("teams").select("id").eq("id", team.id);
    expect(orgTeam?.length).toBe(1);

    const { data: assigned } = await judgeClient.from("teams").select("id").eq("id", team.id);
    expect(assigned?.length).toBe(1);

    const { data: unassigned } = await otherJudgeClient.from("teams").select("id").eq("id", team.id);
    expect(unassigned?.length ?? 0).toBe(0);

    const { data: ownCheckins } = await ownerClient.from("check_ins").select("id").eq("team_id", team.id);
    expect((ownCheckins?.length ?? 0) > 0).toBe(true);

    const { data: strangerCheckins } = await strangerClient.from("check_ins").select("id").eq("team_id", team.id);
    expect(strangerCheckins?.length ?? 0).toBe(0);

    const { data: expired } = await strangerClient.from("talent_profiles").select("user_id").eq("user_id", talent.id);
    expect(expired?.length ?? 0).toBe(0);

    const { data: scoresAsOwner } = await ownerClient.from("scores").select("id").eq("team_id", team.id);
    expect(scoresAsOwner?.length ?? 0).toBe(0);

    // Cleanup (best-effort)
    await svc.from("events").delete().eq("id", event.id);
    for (const u of [owner, stranger, organizer, judge, otherJudge, talent]) {
      await svc.auth.admin.deleteUser(u.id);
    }
  });
});
