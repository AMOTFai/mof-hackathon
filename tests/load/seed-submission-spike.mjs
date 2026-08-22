/**
 * Seeds an ephemeral event with N complete teams (one captain each) for the k6
 * submission spike, and writes tests/load/.spike-fixture.json for k6 to read.
 *
 * Usage:  node tests/load/seed-submission-spike.mjs [teamCount]
 *         node tests/load/seed-submission-spike.mjs --teardown
 *
 * Reads .env.local. Uses the service role (bootstrap only, per the RLS rules).
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const FIXTURE = resolve(HERE, ".spike-fixture.json");

// realtime-js needs a WebSocket ctor on Node 20; never used here.
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

const PASSWORD = "k6-spike-pass-12";

async function teardown() {
  if (!existsSync(FIXTURE)) {
    console.log("no fixture to tear down");
    return;
  }
  const fx = JSON.parse(readFileSync(FIXTURE, "utf8"));
  await svc.from("events").delete().eq("id", fx.eventId);
  for (const team of fx.teams) await svc.auth.admin.deleteUser(team.userId);
  rmSync(FIXTURE);
  console.log(`torn down event ${fx.eventId} and ${fx.teams.length} users`);
}

if (process.argv.includes("--teardown")) {
  await teardown();
  process.exit(0);
}

const teamCount = Number(process.argv[2] ?? 50);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const { data: event, error: eventErr } = await svc
  .from("events")
  .insert({
    slug: `k6-spike-${suffix}`,
    name: "k6 submission spike",
    starts_at: new Date(Date.now() - 3600_000).toISOString(),
    ends_at: new Date(Date.now() + 86400_000).toISOString(),
    // Long enough that the spike itself never trips the deadline guard.
    submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
    status: "live",
    max_team_size: 5,
  })
  .select("id")
  .single();
if (eventErr) throw eventErr;

const teams = [];
for (let i = 0; i < teamCount; i++) {
  const email = `k6.spike.${i}.${suffix}@motf.test`;
  const created = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  await svc.from("event_roles").insert({ event_id: event.id, user_id: userId, role: "participant" });

  const { data: team, error: teamErr } = await svc
    .from("teams")
    .insert({
      event_id: event.id,
      name: `Spike ${i} ${suffix}`,
      project_name: `Spike project ${i}`,
      repo_url: "https://github.com/team/repo",
      video_url: "https://youtu.be/demo",
    })
    .select("id")
    .single();
  if (teamErr) throw teamErr;

  await svc.from("team_members").insert({ team_id: team.id, user_id: userId, role: "captain" });
  teams.push({ email, userId, teamId: team.id });
  if ((i + 1) % 10 === 0) console.log(`seeded ${i + 1}/${teamCount}`);
}

writeFileSync(
  FIXTURE,
  JSON.stringify(
    {
      eventId: event.id,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      password: PASSWORD,
      teams,
    },
    null,
    2,
  ),
);
console.log(`seeded event ${event.id} with ${teams.length} teams → ${FIXTURE}`);
