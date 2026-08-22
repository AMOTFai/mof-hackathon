/**
 * Seeds the "Minds of the Future — KCL AI Hackathon" demo event (slug
 * `kcl-demo`, status `draft` so it never collides with the real event once
 * dates are locked). Persistent — unlike tests/dry-run/run.ts, this is not
 * torn down after running. Reruns are NOT idempotent (the slug is unique,
 * so a second run will fail on the event insert) — use --teardown to remove
 * it first if you need to reseed.
 *
 * Usage:
 *   npx tsx scripts/seed-kcl-demo.ts
 *   npx tsx scripts/seed-kcl-demo.ts --teardown <eventId>
 *   npx tsx scripts/seed-kcl-demo.ts --grant-organizer <email> <eventId>
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

for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i)] ??= t.slice(i + 1);
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const svc = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SLUG = "kcl-demo";
const PASSWORD = "kcl-demo-pass-12";

async function teardown(eventId: string) {
  const { data: teams } = await svc.from("teams").select("id").eq("event_id", eventId);
  const { data: memberRows } = teams?.length
    ? await svc.from("team_members").select("user_id").in("team_id", teams.map((t) => t.id))
    : { data: [] as { user_id: string }[] };
  const { data: roleRows } = await svc.from("event_roles").select("user_id").eq("event_id", eventId);
  const userIds = new Set([...(memberRows ?? []).map((r) => r.user_id), ...(roleRows ?? []).map((r) => r.user_id)]);
  await svc.from("events").delete().eq("id", eventId);
  await svc.from("tenants").delete().eq("slug", SLUG);
  for (const id of userIds) await svc.auth.admin.deleteUser(id);
  console.log(`Torn down event ${eventId}, the ${SLUG} tenant, and ${userIds.size} user(s).`);
}

async function grantOrganizer(email: string, eventId: string) {
  const { data: profile, error } = await svc.from("profiles").select("id").eq("email", email).maybeSingle();
  if (error || !profile) throw error ?? new Error(`no profile for ${email} — they need to sign in at least once first`);
  const { error: insErr } = await svc
    .from("event_roles")
    .upsert({ event_id: eventId, user_id: profile.id, role: "organizer" }, { onConflict: "event_id,user_id,role" });
  if (insErr) throw insErr;
  console.log(`Granted organizer on ${eventId} to ${email}.`);
}

// Day 1 = next Monday (the week AFTER the one this script is run in),
// matching the seed doc's "Monday Day 1 ... Sunday Day 7" structure. Swap
// for real dates once they're locked — this event is `status: 'draft'`
// specifically so it's invisible to anyone without an explicit role until
// then.
function nextMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToThisMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToThisMonday + 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function at(dayOffset: number, hh: number, mm: number): string {
  const d = new Date(nextMonday());
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const TEAMS = [
  {
    name: "Lumen",
    project: "Lumen — AI revision planner",
    description: "Personalised revision planning for KCL students, built on past exam patterns and each student's own notes.",
  },
  {
    name: "Nomad Health",
    project: "Nomad Health — AI symptom triage",
    description: "Symptom triage and NHS-navigation guidance for international students without a registered GP.",
  },
  {
    name: "GreenGrid",
    project: "GreenGrid — hall energy optimiser",
    description: "AI-driven energy usage optimisation for student halls, surfacing real-time savings nudges to residents.",
  },
  {
    name: "PocketMentor",
    project: "PocketMentor — AI career coach",
    description: "A career-coaching chatbot trained on real alumni interview transcripts, tailored to a student's course and goals.",
  },
  {
    name: "Sightline",
    project: "Sightline — lecture accessibility",
    description: "Live lecture transcription and note structuring for students with hearing or attention accessibility needs.",
  },
] as const;

// Placeholder judges — real ones get invited later via the invite-link
// system built this session. Punny AI/CS names since these never appear
// anywhere a real person sees them.
const JUDGES = ["Percy Ceptron", "Sig Moid", "Reggie Ularization", "Ada Gradient", "Bea Yesian"] as const;

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--teardown") {
    const eventId = args[1];
    if (!eventId) throw new Error("usage: --teardown <eventId>");
    await teardown(eventId);
    return;
  }
  if (args[0] === "--grant-organizer") {
    const [, email, eventId] = args;
    if (!email || !eventId) throw new Error("usage: --grant-organizer <email> <eventId>");
    await grantOrganizer(email, eventId);
    return;
  }

  console.log(`\n=== Seeding kcl-demo ===\n`);

  const { data: tenant, error: tenantErr } = await svc
    .from("tenants")
    .insert({ slug: SLUG, name: "Minds of the Future" })
    .select("id")
    .single();
  if (tenantErr || !tenant) throw tenantErr ?? new Error("tenant");

  const { data: event, error: eventErr } = await svc
    .from("events")
    .insert({
      tenant_id: tenant.id,
      slug: SLUG,
      name: "Minds of the Future — KCL AI Hackathon",
      tagline: "A week-long AI build sprint, judged live at King's College London.",
      venue: "Bush House, King's College London",
      starts_at: at(0, 9, 0),
      ends_at: at(6, 20, 0),
      submission_deadline: at(5, 18, 0),
      status: "draft",
      max_team_size: 5,
      pairwise_threshold: 60,
      working_demo_required: true,
    })
    .select("id")
    .single();
  if (eventErr || !event) throw eventErr ?? new Error("event");
  const eventId = event.id;
  console.log(`Event: ${eventId} (slug: ${SLUG}, status: draft)`);

  // --- Schedule ---------------------------------------------------------
  const schedule: { title: string; kind: string; location: string | null; day: number; hh: number; mm: number }[] = [
    { title: "Doors open + registration", kind: "session", location: "Bush House Auditorium", day: 0, hh: 9, mm: 0 },
    { title: "Opening address & rules briefing", kind: "ceremony", location: "Bush House Auditorium (395 cap)", day: 0, hh: 10, mm: 0 },
    { title: "Team formation deadline", kind: "deadline", location: null, day: 0, hh: 11, mm: 30 },
    { title: "Build begins", kind: "session", location: "Bush House Arcade", day: 0, hh: 12, mm: 0 },
    { title: "Speaker slot 1 (TBC)", kind: "speaker", location: "Lecture Theatre 1", day: 1, hh: 14, mm: 0 },
    { title: "Cross-university networking evening", kind: "social", location: "Venue TBC", day: 2, hh: 18, mm: 0 },
    { title: "Speaker slot 2 (TBC)", kind: "speaker", location: "Lecture Theatre 1", day: 3, hh: 14, mm: 0 },
    { title: "Flagship speaker — Paul Manduca", kind: "speaker", location: "Bush House Auditorium", day: 4, hh: 17, mm: 0 },
    { title: "Evening social", kind: "social", location: "Venue TBC", day: 4, hh: 19, mm: 0 },
    { title: "Submissions close", kind: "deadline", location: "Platform", day: 5, hh: 18, mm: 0 },
    { title: "Pre-panel judging window opens", kind: "judging", location: "Platform", day: 6, hh: 10, mm: 0 },
    { title: "Cup bracket live pitches", kind: "judging", location: "Great Hall", day: 6, hh: 14, mm: 0 },
    { title: "Plate bracket live pitches", kind: "judging", location: "Great Hall (parallel room)", day: 6, hh: 15, mm: 30 },
    { title: "Joint winner announcement", kind: "ceremony", location: "Great Hall", day: 6, hh: 19, mm: 0 },
  ];
  const { error: schedErr } = await svc.from("schedule_items").insert(
    schedule.map((s) => ({
      event_id: eventId,
      title: s.title,
      kind: s.kind,
      location: s.location,
      starts_at: at(s.day, s.hh, s.mm),
    })),
  );
  if (schedErr) throw schedErr;
  console.log(`Schedule: ${schedule.length} items`);

  // --- Milestones ---------------------------------------------------------
  const milestoneSpecs = [
    { key: "problem_statement", label: "Problem statement", day: 0, hh: 18, mm: 0, penalty: "flag" },
    { key: "plan", label: "Architecture / plan check-in", day: 1, hh: 18, mm: 0, penalty: "flag" },
    { key: "v1_slice", label: "V1 functional slice", day: 2, hh: 18, mm: 0, penalty: "plate_cap" },
    { key: "feature_complete", label: "Feature-complete checkpoint", day: 3, hh: 18, mm: 0, penalty: "flag" },
    { key: "freeze", label: "Feature freeze", day: 4, hh: 18, mm: 0, penalty: "flag" },
  ] as const;
  const { error: milestoneErr } = await svc.from("milestones").insert(
    milestoneSpecs.map((m, i) => ({
      event_id: eventId,
      key: m.key,
      label: m.label,
      due_at: at(m.day, m.hh, m.mm),
      required: true,
      penalty: m.penalty,
      sort_order: i + 1,
    })),
  );
  if (milestoneErr) throw milestoneErr;
  console.log(`Milestones: ${milestoneSpecs.length}`);

  // --- Rubric ---------------------------------------------------------
  const criteriaSpecs = [
    { key: "technical", label: "Technical execution", weight: 30, description: "Works end to end; AI is load-bearing, not decorative." },
    { key: "originality", label: "Originality & problem selection", weight: 20, description: "A real problem, sharply framed, non-obvious approach." },
    { key: "viability", label: "Business viability / GTM", weight: 25, description: "Credible customer, wedge, and path to first revenue." },
    { key: "pitch", label: "Pitch & demo quality", weight: 15, description: "Clear, honest, well-paced; demo does the talking." },
    { key: "execution", label: "Execution under constraint", weight: 10, description: "Steady iteration, milestones hit, sensible pivots." },
  ] as const;
  const { data: criteriaRows, error: critErr } = await svc
    .from("rubric_criteria")
    .insert(
      criteriaSpecs.map((c, i) => ({
        event_id: eventId,
        key: c.key,
        label: c.label,
        description: c.description,
        weight: c.weight,
        scale_max: 5,
        sort_order: i + 1,
      })),
    )
    .select("id, key");
  if (critErr || !criteriaRows) throw critErr ?? new Error("criteria");
  console.log(`Rubric: ${criteriaSpecs.length} criteria (weights sum to ${criteriaSpecs.reduce((a, c) => a + c.weight, 0)})`);

  // --- Calibration samples ---------------------------------------------------------
  const { data: sampleRows, error: sampleErr } = await svc
    .from("calibration_samples")
    .insert([
      {
        event_id: eventId,
        title: "Reference: mid-pack submission",
        content: { description: "A solid, well-scoped project — working demo, clear pitch, no standout differentiator." },
        reference_scores: criteriaRows.map((c) => ({ criterionId: c.id, value: 3 })),
      },
      {
        event_id: eventId,
        title: "Reference: strong submission",
        content: { description: "A sharp, non-obvious problem with a working end-to-end demo and a credible go-to-market wedge." },
        reference_scores: criteriaRows.map((c) => ({ criterionId: c.id, value: 5 })),
      },
    ])
    .select("id");
  if (sampleErr || !sampleRows) throw sampleErr ?? new Error("samples");
  console.log(`Calibration samples: 2`);

  // --- Judges (placeholder — real ones get invited via /invite links) ---
  const judgeSuffix = `${Date.now()}`;
  for (const name of JUDGES) {
    const email = `judge.${name.toLowerCase().replace(/\s+/g, "")}.${judgeSuffix}@motf.test`;
    const created = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("judge user");
    const id = created.data.user.id;
    await svc.from("profiles").update({ full_name: name }).eq("id", id);
    await svc.from("event_roles").insert({ event_id: eventId, user_id: id, role: "judge" });
    // Pre-calibrated so they can score immediately in preview, same pattern
    // as tests/dry-run/run.ts.
    await svc.from("calibration_results").insert({
      judge_id: id,
      sample_id: sampleRows[0]!.id,
      scores: Object.fromEntries(criteriaRows.map((c) => [c.id, 3])),
      deviation: 0,
    });
  }
  console.log(`Judges: ${JUDGES.length} (pre-calibrated)`);

  // --- Sponsors + a challenge track ---------------------------------------------------------
  const { data: sponsors, error: sponsorErr } = await svc
    .from("sponsors")
    .insert([
      { event_id: eventId, name: "King's College London", tier: "headline", website_url: "https://www.kcl.ac.uk" },
      { event_id: eventId, name: "Minds of the Future", tier: "partner", website_url: null },
    ])
    .select("id, name");
  if (sponsorErr || !sponsors) throw sponsorErr ?? new Error("sponsors");
  const headline = sponsors.find((s) => s.name === "King's College London")!;
  const { error: trackErr } = await svc.from("challenge_tracks").insert({
    event_id: eventId,
    sponsor_id: headline.id,
    name: "Best use of AI for student life",
    brief: "Build something that measurably improves day-to-day student life at KCL — judged on real usefulness, not novelty alone.",
    prize_description: "Featured slot in the KCL Enterprise showcase.",
    judged_by_sponsor: true,
  });
  if (trackErr) throw trackErr;
  console.log(`Sponsors: 2, 1 challenge track`);

  // --- Demo teams + members + check-ins ---------------------------------------------------------
  const suffix = `${Date.now()}`;
  const teamIds: { id: string; name: string }[] = [];
  for (const [ti, spec] of TEAMS.entries()) {
    const memberIds: string[] = [];
    for (let m = 0; m < 2; m++) {
      const email = `demo.${spec.name.toLowerCase().replace(/\s+/g, "")}.${m}.${suffix}@motf.test`;
      const created = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (created.error || !created.data.user) throw created.error ?? new Error("user");
      const id = created.data.user.id;
      await svc.from("profiles").update({ full_name: `Demo Member ${ti}-${m}` }).eq("id", id);
      await svc.from("event_roles").insert({ event_id: eventId, user_id: id, role: "participant" });
      memberIds.push(id);
    }
    const firstMemberId = memberIds[0]!;
    const { data: team, error: teamErr } = await svc
      .from("teams")
      .insert({
        event_id: eventId,
        name: spec.name,
        project_name: spec.project,
        description: spec.description,
      })
      .select("id")
      .single();
    if (teamErr || !team) throw teamErr ?? new Error("team");
    teamIds.push({ id: team.id, name: spec.name });

    await svc.from("team_members").insert([
      { team_id: team.id, user_id: firstMemberId, role: "captain" },
      { team_id: team.id, user_id: memberIds[1]!, role: "member" },
    ]);

    const checkinDays = [1, 2, 3, 4]; // Tue-Fri build days
    for (const day of checkinDays) {
      await svc.from("check_ins").insert({
        team_id: team.id,
        author_id: firstMemberId,
        body: `Day ${day + 1}: progress on ${spec.project}.`,
        created_at: at(day, 17, 30),
      });
    }
  }
  console.log(`Teams: ${TEAMS.length}, each with 2 members and ${4} check-ins`);

  console.log(`\nDone. Event id: ${eventId}`);
  console.log(`Grant yourself organizer with:`);
  console.log(`  npx tsx scripts/seed-kcl-demo.ts --grant-organizer <your-email> ${eventId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
