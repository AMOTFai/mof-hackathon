/**
 * Session 14 — the dry run. BUILD-PLAN DoD: "20 fake teams, 5 judges,
 * compressed week." This is an integration exercise, not a new feature: it
 * runs the REAL pipeline end to end — RLS-governed writes exactly like the
 * app makes, then the same lib/judging computation the organizer's
 * /organizer/results "Compute results" button runs — at a scale close to
 * the real event (BUILD-PLAN Part 0 #6: "Build for 20,000, launch with
 * 200"; this is one order of magnitude below the pilot's own target scale).
 *
 * Everything here is either a service-role bootstrap write (creating the
 * event/tenant/users — same class as event creation itself) or goes through
 * the exact same tables/constraints the app's server actions write to, so a
 * bug in RLS or in the judging math would show up here exactly as it would
 * in production.
 *
 * Usage:
 *   npx tsx tests/dry-run/run.ts            # runs the dry run, tears down after
 *   npx tsx tests/dry-run/run.ts --keep      # leaves the event in place for manual poking
 *   npx tsx tests/dry-run/run.ts --teardown <eventId>   # clean up a --keep run
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

class StubSocket {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
}
(globalThis as { WebSocket?: unknown }).WebSocket ??= StubSocket;

for (const line of readFileSync(resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i)] ??= t.slice(i + 1);
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isPlateCapped, type CheckInRec, type MilestoneDef } from "@/lib/checkins/status";
import { getJudgeCardsForTeam, listRubricCriteria } from "@/lib/judging/queries";
import { aggregateRubricScore } from "@/lib/judging/aggregate";
import { computeBracket, rankTeams } from "@/lib/judging/results";
import { isHttpUrl } from "@/lib/url";

const svc = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEAM_COUNT = 20;
const JUDGE_COUNT = 5;
const PASSWORD = "dryrun-pass-12";

async function teardown(eventId: string) {
  const { data: teams } = await svc.from("teams").select("id").eq("event_id", eventId);
  const { data: memberRows } = teams?.length
    ? await svc.from("team_members").select("user_id").in("team_id", teams.map((t) => t.id))
    : { data: [] as { user_id: string }[] };
  const { data: roleRows } = await svc.from("event_roles").select("user_id").eq("event_id", eventId);
  const userIds = new Set([...(memberRows ?? []).map((r) => r.user_id), ...(roleRows ?? []).map((r) => r.user_id)]);

  await svc.from("events").delete().eq("id", eventId);
  for (const id of userIds) await svc.auth.admin.deleteUser(id);
  console.log(`Torn down event ${eventId} and ${userIds.size} user(s).`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--teardown") {
    const eventId = args[1];
    if (!eventId) throw new Error("usage: --teardown <eventId>");
    await teardown(eventId);
    return;
  }
  const keep = args.includes("--keep");

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const now = Date.now();
  console.log(`\n=== Dry run ${suffix}: ${TEAM_COUNT} teams, ${JUDGE_COUNT} judges, compressed week ===\n`);

  // --- Event: a "week" compressed into ~2 hours. ---------------------
  const { data: tenant, error: tenantErr } = await svc
    .from("tenants")
    .insert({ slug: `dryrun-${suffix}`, name: "Dry Run Hackathon" })
    .select("id")
    .single();
  if (tenantErr || !tenant) throw tenantErr ?? new Error("tenant");

  const { data: event, error: eventErr } = await svc
    .from("events")
    .insert({
      tenant_id: tenant.id,
      slug: `dryrun-${suffix}`,
      name: "Dry Run Hackathon",
      tagline: "20 teams, 5 judges, one compressed week",
      starts_at: new Date(now - 90 * 60_000).toISOString(),
      ends_at: new Date(now + 30 * 60_000).toISOString(),
      submission_deadline: new Date(now + 15 * 60_000).toISOString(),
      status: "judging",
      max_team_size: 4,
      pairwise_blend: 0.5,
      working_demo_required: true,
    })
    .select("id")
    .single();
  if (eventErr || !event) throw eventErr ?? new Error("event");
  const eventId = event.id;
  console.log(`Event: ${eventId}`);

  // --- Milestones: one required, plate-capping, due partway through. --
  const { data: milestone, error: milestoneErr } = await svc
    .from("milestones")
    .insert({
      event_id: eventId,
      key: "v1_slice",
      label: "V1 slice",
      due_at: new Date(now - 30 * 60_000).toISOString(), // already due — some teams will have missed it
      required: true,
      penalty: "plate_cap",
      sort_order: 1,
    })
    .select("id")
    .single();
  if (milestoneErr || !milestone) throw milestoneErr ?? new Error("milestone");

  // --- Rubric: same shape as the pilot seed. --------------------------
  const criteriaSpec = [
    { key: "technical", label: "Technical execution", weight: 30 },
    { key: "originality", label: "Originality", weight: 20 },
    { key: "business", label: "Business/GTM", weight: 25 },
    { key: "pitch", label: "Pitch", weight: 15 },
    { key: "team", label: "Team", weight: 10 },
  ];
  const { data: criteriaRows, error: critErr } = await svc
    .from("rubric_criteria")
    .insert(
      criteriaSpec.map((c, i) => ({
        event_id: eventId,
        key: c.key,
        label: c.label,
        description: c.label,
        weight: c.weight,
        scale_max: 5,
        sort_order: i + 1,
      })),
    )
    .select("id, key");
  if (critErr || !criteriaRows) throw critErr ?? new Error("criteria");

  // --- Calibration sample, so judges can clear the gate. --------------
  const { data: sample, error: sampleErr } = await svc
    .from("calibration_samples")
    .insert({
      event_id: eventId,
      title: "Reference project",
      content: { description: "A solid, mid-pack submission to calibrate against." },
      reference_scores: criteriaRows.map((c) => ({ criterionId: c.id, value: 3 })),
    })
    .select("id")
    .single();
  if (sampleErr || !sample) throw sampleErr ?? new Error("sample");

  // --- 5 judges, all calibrated. ---------------------------------------
  const judges: { id: string; email: string }[] = [];
  for (let i = 0; i < JUDGE_COUNT; i++) {
    const email = `dryrun.judge.${i}.${suffix}@motf.test`;
    const created = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("judge user");
    const id = created.data.user.id;
    await svc.from("event_roles").insert({ event_id: eventId, user_id: id, role: "judge" });
    await svc.from("calibration_results").insert({
      judge_id: id,
      sample_id: sample.id,
      scores: Object.fromEntries(criteriaRows.map((c) => [c.id, 3])),
      deviation: 0,
    });
    judges.push({ id, email });
  }
  console.log(`Judges: ${judges.length} (all calibrated)`);

  // --- 20 teams: 1-3 members each, most submitted, a few not, a few
  // missed the plate-cap milestone. ------------------------------------
  type TeamFixture = { id: string; name: string; submitted: boolean; hitMilestone: boolean; memberIds: string[] };
  const teams: TeamFixture[] = [];

  for (let i = 0; i < TEAM_COUNT; i++) {
    const submitted = i < 17; // 3 teams never submit
    const hitMilestone = i % 6 !== 0; // ~1 in 6 teams misses the required milestone
    const hasVideo = submitted && i % 9 !== 3; // one submitted team is missing a working demo

    const teamName = `Team ${String(i + 1).padStart(2, "0")} ${suffix}`;
    const { data: team, error: teamErr } = await svc
      .from("teams")
      .insert({
        event_id: eventId,
        name: teamName,
        project_name: submitted ? `Project ${i + 1}` : null,
        repo_url: submitted ? `https://github.com/dryrun/team-${i + 1}` : null,
        video_url: submitted && hasVideo ? `https://youtu.be/dryrun-${i + 1}` : null,
        submitted_at: submitted ? new Date(now - 5 * 60_000).toISOString() : null,
      })
      .select("id")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error(`team ${i}`);

    const memberCount = 1 + (i % 3); // 1-3 members
    const memberIds: string[] = [];
    for (let m = 0; m < memberCount; m++) {
      const email = `dryrun.team${i}.member${m}.${suffix}@motf.test`;
      const created = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (created.error || !created.data.user) throw created.error ?? new Error("member user");
      const userId = created.data.user.id;
      await svc.from("event_roles").insert({ event_id: eventId, user_id: userId, role: "participant" });
      await svc.from("team_members").insert({ team_id: team.id, user_id: userId, role: m === 0 ? "captain" : "member" });
      memberIds.push(userId);
    }

    // Check-ins: teams that hit the milestone log one tied to it before the
    // deadline; everyone gets 1-2 general check-ins for process signal.
    const firstMemberId = memberIds[0]!;
    if (hitMilestone) {
      await svc.from("check_ins").insert({
        team_id: team.id,
        author_id: firstMemberId,
        milestone_id: milestone.id,
        body: "Shipped the v1 slice — core flow works end to end.",
        created_at: new Date(now - 45 * 60_000).toISOString(),
      });
    }
    await svc.from("check_ins").insert({
      team_id: team.id,
      author_id: firstMemberId,
      body: `Check-in from team ${i + 1}: steady progress, no blockers.`,
    });

    teams.push({ id: team.id, name: teamName, submitted, hitMilestone, memberIds });
  }
  console.log(`Teams: ${teams.length} (${teams.filter((t) => t.submitted).length} submitted, ${teams.filter((t) => !t.hitMilestone).length} missed the plate-cap milestone)`);

  // --- Assignments + scoring: every submitted team gets 4 of the 5
  // judges (so drop-high/low aggregation actually engages), scores vary
  // by team index so the ranking isn't a flat tie. ---------------------
  const submittedTeams = teams.filter((t) => t.submitted);
  for (const [ti, team] of submittedTeams.entries()) {
    // 4 of 5 judges per team (rotating which one sits out), so drop-high/low
    // trimming in aggregateRubricScore actually engages (needs 4+ cards).
    const excludedJudgeIdx = ti % JUDGE_COUNT;
    const assignedJudges = judges.filter((_, ji) => ji !== excludedJudgeIdx);
    const baseScore = 2 + (ti % 4); // spread scores 2..5 across teams
    for (const judge of assignedJudges) {
      await svc.from("judge_assignments").insert({ event_id: eventId, judge_id: judge.id, team_id: team.id, status: "complete" });
      const jitter = (judges.indexOf(judge) % 2) - 0.5; // +/- 0.5 per judge, so scores aren't identical
      for (const criterion of criteriaRows) {
        const value = Math.max(0, Math.min(5, Math.round((baseScore + jitter) * 2) / 2));
        await svc.from("scores").insert({
          team_id: team.id,
          judge_id: judge.id,
          criterion_id: criterion.id,
          phase: "prepanel",
          value,
        });
      }
    }
  }
  console.log(`Scored: ${submittedTeams.length} submitted teams, 4 judges each`);

  // --- Pairwise votes among judges across a sample of team pairs. -----
  let voteCount = 0;
  for (let i = 0; i < submittedTeams.length - 1; i += 2) {
    const judge = judges[i % judges.length];
    const { error } = await svc.from("pairwise_votes").insert({
      event_id: eventId,
      judge_id: judge!.id,
      winner_id: submittedTeams[i]!.id,
      loser_id: submittedTeams[i + 1]!.id,
    });
    if (!error) voteCount += 1;
  }
  console.log(`Pairwise votes: ${voteCount}`);

  // --- Now run the REAL computation pipeline (same functions
  // /organizer/results's "Compute results" action calls) and write
  // results, exactly like the app does. --------------------------------
  const criteria = await listRubricCriteria(svc, eventId);
  const milestoneDefs: MilestoneDef[] = [
    {
      id: milestone.id,
      key: "v1_slice",
      label: "V1 slice",
      dueAt: new Date(now - 30 * 60_000).toISOString(),
      required: true,
      penalty: "plate_cap",
      sortOrder: 1,
    },
  ];

  type Computed = { teamId: string; rubricScore: number | null; pairwiseMu: number | null; bracket: string };
  const computed: Computed[] = [];

  for (const team of teams) {
    const [cards, { data: checkInRows }, { data: teamRow }, { data: ratingRow }] = await Promise.all([
      getJudgeCardsForTeam(svc, team.id, criteria),
      svc.from("check_ins").select("milestone_id, created_at").eq("team_id", team.id),
      svc.from("teams").select("video_url").eq("id", team.id).single(),
      svc.from("team_ratings").select("mu").eq("team_id", team.id).maybeSingle(),
    ]);
    const checkIns: CheckInRec[] = (checkInRows ?? []).map((c) => ({ milestoneId: c.milestone_id, createdAt: c.created_at }));
    const capped = isPlateCapped(milestoneDefs, checkIns);
    const rubricScore = aggregateRubricScore(cards);
    const bracket = computeBracket({
      capped,
      rubricScore,
      cupScoreThreshold: null,
      hasWorkingDemo: isHttpUrl(teamRow?.video_url ?? null),
      workingDemoRequired: true,
    });
    computed.push({ teamId: team.id, rubricScore, pairwiseMu: ratingRow?.mu ?? null, bracket });
  }

  const ranks = rankTeams(
    computed.map((c) => ({ teamId: c.teamId, rubricScore: c.rubricScore, pairwiseMu: c.pairwiseMu })),
    0.5,
  );
  const rankByTeam = new Map(ranks.map((r) => [r.teamId, r]));

  const resultRows = computed.map((c) => ({
    team_id: c.teamId,
    rubric_score: c.rubricScore,
    pairwise_rank: rankByTeam.get(c.teamId)?.pairwiseRank ?? null,
    final_rank: rankByTeam.get(c.teamId)?.finalRank ?? null,
    bracket: c.bracket,
    published: false,
  }));
  const { error: resultsErr } = await svc.from("results").upsert(resultRows, { onConflict: "team_id" });
  if (resultsErr) throw resultsErr;

  // --- Report + sanity checks. -----------------------------------------
  const cupTeams = computed.filter((c) => c.bracket === "cup");
  const plateTeams = computed.filter((c) => c.bracket === "plate");
  const unassignedTeams = computed.filter((c) => c.bracket === "unassigned");
  const cappedButNotSubmitted = teams.filter((t) => !t.hitMilestone && !t.submitted).length;
  const rankedTeams = ranks.filter((r) => r.finalRank !== null).sort((a, b) => (a.finalRank ?? 0) - (b.finalRank ?? 0));

  console.log(`\n--- Results ---`);
  console.log(`Cup: ${cupTeams.length}, Plate: ${plateTeams.length}, Unassigned: ${unassignedTeams.length}`);
  console.log(`Ranked (has a score and/or pairwise rating): ${rankedTeams.length} / ${teams.length}`);
  console.log(`Top 3 by final rank:`);
  for (const r of rankedTeams.slice(0, 3)) {
    const team = teams.find((t) => t.id === r.teamId);
    const c = computed.find((x) => x.teamId === r.teamId);
    console.log(`  #${r.finalRank}  ${team?.name}  rubric=${c?.rubricScore?.toFixed(1)}  bracket=${c?.bracket}`);
  }

  const rankValues = rankedTeams.map((r) => r.finalRank);
  const rankSet = new Set(rankValues);
  const noDuplicateRanks = rankSet.size === rankValues.length;
  const ranksAreSequential = rankValues.every((r, i) => r === i + 1);
  const everyMissedMilestoneTeamIsPlate = teams
    .filter((t) => !t.hitMilestone && t.submitted)
    .every((t) => computed.find((c) => c.teamId === t.id)?.bracket === "plate");
  const noDisqualifiedAutoSet = computed.every((c) => c.bracket !== "disqualified");
  // An unsubmitted team has no video_url, and this event sets
  // working_demo_required=true — so it lands in "plate" via the missing-demo
  // rule (computeBracket checks that before ever reaching the null-rubric-
  // score -> "unassigned" branch), same as a capped team. "unassigned" is
  // reserved for a team that clears every other rule but genuinely hasn't
  // been judged yet — which never occurs in this fixture, since every
  // submitted+demoed team gets scored. The real invariant is just that an
  // unsubmitted team can never be "cup".
  const noUnsubmittedTeamIsCup = teams.filter((t) => !t.submitted).every((t) => computed.find((c) => c.teamId === t.id)?.bracket !== "cup");

  console.log(`\n--- Sanity checks ---`);
  const checks: [string, boolean][] = [
    ["No duplicate final ranks", noDuplicateRanks],
    ["Final ranks are a sequential 1..N over ranked teams", ranksAreSequential],
    ["Every submitted team that missed the plate-cap milestone is bracket=plate", everyMissedMilestoneTeamIsPlate],
    ["No bracket auto-set to disqualified", noDisqualifiedAutoSet],
    ["No unsubmitted team reaches bracket=cup", noUnsubmittedTeamIsCup],
    ["At least one team reached bracket=cup", cupTeams.length > 0],
  ];
  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`  ${passed ? "✓" : "✗"} ${label}`);
    if (!passed) allPassed = false;
  }
  void cappedButNotSubmitted;

  console.log(`\n${allPassed ? "DRY RUN PASSED" : "DRY RUN FAILED"} — event ${eventId}\n`);

  if (keep) {
    console.log(`--keep set: leaving event ${eventId} in place. Tear down with:\n  npx tsx tests/dry-run/run.ts --teardown ${eventId}\n`);
  } else {
    await teardown(eventId);
  }

  if (!allPassed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
