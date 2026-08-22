/**
 * Session 6 submission spike (BUILD-PLAN-v3 Part 0 #4: "the deadline is the
 * failure mode"). Junction X 2023 crashed at submission and voting; this is the
 * test that says we don't.
 *
 * Every VU is a distinct team's captain hammering submit_team at the same
 * moment, plus a second call with the SAME idempotency key to prove replays
 * stay cheap and correct under load.
 *
 * Correctness thresholds (not just latency):
 *   - submit_accepted must equal the team count exactly (no lost submissions)
 *   - double_submit must be 0 (no team submitted twice)
 *   - replay_mismatch must be 0 (a replay must return the original timestamp)
 *
 * Run:
 *   node tests/load/seed-submission-spike.mjs 50
 *   k6 run tests/load/submission-spike.js
 *   node tests/load/seed-submission-spike.mjs --teardown
 */
import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

const fixture = JSON.parse(open("./.spike-fixture.json"));
const TEAMS = fixture.teams;

const submitAccepted = new Counter("submit_accepted");
const submitRejected = new Counter("submit_rejected");
const doubleSubmit = new Counter("double_submit");
const replayOk = new Counter("replay_ok");
const replayMismatch = new Counter("replay_mismatch");
const submitLatency = new Trend("submit_latency_ms", true);

export const options = {
  scenarios: {
    // All captains hit submit within the same couple of seconds.
    deadline_rush: {
      executor: "per-vu-iterations",
      vus: TEAMS.length,
      iterations: 1,
      maxDuration: "2m",
    },
  },
  thresholds: {
    // Correctness first — these are the ones that actually matter.
    submit_accepted: [`count==${TEAMS.length}`],
    double_submit: ["count==0"],
    replay_mismatch: ["count==0"],
    replay_ok: [`count==${TEAMS.length}`],
    // Then latency. p95 under 2.5s on a pooled free-tier project.
    "submit_latency_ms": ["p(95)<2500"],
    http_req_failed: ["rate<0.05"],
  },
};

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function signIn(team) {
  const res = http.post(
    `${fixture.supabaseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: team.email, password: fixture.password }),
    { headers: { apikey: fixture.anonKey, "Content-Type": "application/json" }, tags: { op: "signin" } },
  );
  check(res, { "signin 200": (r) => r.status === 200 });
  return res.json("access_token");
}

function submit(token, teamId, key) {
  const res = http.post(
    `${fixture.supabaseUrl}/rest/v1/rpc/submit_team`,
    JSON.stringify({ p_team_id: teamId, p_idempotency_key: key }),
    {
      headers: {
        apikey: fixture.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      tags: { op: "submit" },
    },
  );
  submitLatency.add(res.timings.duration);
  return res;
}

export default function () {
  const team = TEAMS[__VU - 1];
  const token = signIn(team);
  if (!token) return;

  const key = uuid();

  const first = submit(token, team.teamId, key);
  if (first.status === 200) {
    submitAccepted.add(1);
    const body = first.json();
    if (body.replay === true) {
      // A first submit reporting replay=true means someone else already
      // submitted this team — a lost/duplicated submission.
      doubleSubmit.add(1);
    }

    // Same key again: must replay, must return the SAME submitted_at.
    const again = submit(token, team.teamId, key);
    if (again.status === 200 && again.json("replay") === true && again.json("submitted_at") === body.submitted_at) {
      replayOk.add(1);
    } else {
      replayMismatch.add(1);
    }

    check(first, { "submit 200": () => true });
  } else {
    submitRejected.add(1);
    console.error(`submit failed for ${team.teamId}: ${first.status} ${first.body}`);
  }
}
