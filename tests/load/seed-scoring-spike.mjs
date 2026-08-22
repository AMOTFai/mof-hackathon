/**
 * Seeds an ephemeral event with N pre-calibrated judges, each assigned to
 * their own team, for the k6 concurrent-scoring spike. Mirrors
 * seed-submission-spike.mjs's shape and conventions.
 *
 * Usage:  node tests/load/seed-scoring-spike.mjs [judgeCount]
 *         node tests/load/seed-scoring-spike.mjs --teardown
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const FIXTURE = resolve(HERE, ".scoring-fixture.json");

globalThis.WebSocket ??= class {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
};

for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i)] ??= t.slice(i + 1);
}

const { createClient } = await import("@supabase/supabase-js");
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = "k6-scoring-spike-pass-12";

async function teardown() {
  if (!existsSync(FIXTURE)) {
    console.log("no fixture to tear down");
    return;
  }
  const fx = JSON.parse(readFileSync(FIXTURE, "utf8"));
  await svc.from("events").delete().eq("id", fx.eventId);
  for (const j of fx.judges) await svc.auth.admin.deleteUser(j.userId);
  rmSync(FIXTURE);
  console.log(`torn down event ${fx.eventId} and ${fx.judges.length} judges`);
}

if (process.argv.includes("--teardown")) {
  await teardown();
  process.exit(0);
}

const judgeCount = Number(process.argv[2] ?? 30);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const { data: event, error: eventErr } = await svc
  .from("events")
  .insert({
    slug: `k6-scoring-${suffix}`,
    name: "k6 scoring spike",
    starts_at: new Date(Date.now() - 3600_000).toISOString(),
    ends_at: new Date(Date.now() + 86400_000).toISOString(),
    submission_deadline: new Date(Date.now() - 60_000).toISOString(),
    status: "judging",
  })
  .select("id")
  .single();
if (eventErr) throw eventErr;

const { data: criterion, error: critErr } = await svc
  .from("rubric_criteria")
  .insert({ event_id: event.id, key: "technical", label: "Technical", description: "d", weight: 100, scale_max: 5, sort_order: 1 })
  .select("id")
  .single();
if (critErr) throw critErr;

const { data: sample, error: sampleErr } = await svc
  .from("calibration_samples")
  .insert({ event_id: event.id, title: "Sample", content: { description: "d" }, reference_scores: [{ criterionId: criterion.id, value: 4 }] })
  .select("id")
  .single();
if (sampleErr) throw sampleErr;

const judges = [];
for (let i = 0; i < judgeCount; i++) {
  const email = `k6.judge.${i}.${suffix}@motf.test`;
  const created = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  await svc.from("event_roles").insert({ event_id: event.id, user_id: userId, role: "judge" });
  await svc.from("calibration_results").insert({ judge_id: userId, sample_id: sample.id, scores: { [criterion.id]: 4 }, deviation: 0 });

  const { data: team, error: teamErr } = await svc
    .from("teams")
    .insert({ event_id: event.id, name: `Scoring ${i} ${suffix}`, submitted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (teamErr) throw teamErr;

  await svc.from("judge_assignments").insert({ event_id: event.id, judge_id: userId, team_id: team.id, status: "pending" });
  judges.push({ email, userId, teamId: team.id });
  if ((i + 1) % 10 === 0) console.log(`seeded ${i + 1}/${judgeCount}`);
}

writeFileSync(
  FIXTURE,
  JSON.stringify(
    {
      eventId: event.id,
      criterionId: criterion.id,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      password: PASSWORD,
      judges,
    },
    null,
    2,
  ),
);
console.log(`seeded event ${event.id} with ${judges.length} pre-calibrated judges → ${FIXTURE}`);
