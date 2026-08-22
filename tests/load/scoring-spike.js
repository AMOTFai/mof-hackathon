/**
 * Session 9's concurrent-scoring spike (BUILD-PLAN Part 13: "full k6 suite
 * passes at stated thresholds" — the judging engine is the other write-heavy
 * critical path alongside submission, and deserves the same rigor).
 *
 * Every VU is a distinct, already-calibrated judge submitting a score for
 * their own assigned team at the same moment — the panel finishing scoring
 * in the last few minutes before a deadline is the realistic worst case.
 *
 * Correctness thresholds, not just latency:
 *   - score_accepted must equal the judge count exactly (no lost writes)
 *   - cross_contamination must be 0 (every judge's score lands under THEIR
 *     own judge_id/team_id, never another judge's)
 *
 * Run:
 *   node tests/load/seed-scoring-spike.mjs 30
 *   k6 run tests/load/scoring-spike.js
 *   node tests/load/seed-scoring-spike.mjs --teardown
 */
import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

const fixture = JSON.parse(open("./.scoring-fixture.json"));
const JUDGES = fixture.judges;

const scoreAccepted = new Counter("score_accepted");
const scoreRejected = new Counter("score_rejected");
const crossContamination = new Counter("cross_contamination");
const scoreLatency = new Trend("score_latency_ms", true);

export const options = {
  scenarios: {
    deadline_scoring_rush: {
      executor: "per-vu-iterations",
      vus: JUDGES.length,
      iterations: 1,
      maxDuration: "2m",
    },
  },
  thresholds: {
    score_accepted: [`count==${JUDGES.length}`],
    cross_contamination: ["count==0"],
    score_latency_ms: ["p(95)<2500"],
    http_req_failed: ["rate<0.05"],
  },
};

function signIn(judge) {
  const res = http.post(
    `${fixture.supabaseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: judge.email, password: fixture.password }),
    { headers: { apikey: fixture.anonKey, "Content-Type": "application/json" }, tags: { op: "signin" } },
  );
  check(res, { "signin 200": (r) => r.status === 200 });
  return res.json("access_token");
}

export default function () {
  const judge = JUDGES[__VU - 1];
  const token = signIn(judge);
  if (!token) return;

  const res = http.post(
    `${fixture.supabaseUrl}/rest/v1/scores`,
    JSON.stringify({
      team_id: judge.teamId,
      judge_id: judge.userId,
      criterion_id: fixture.criterionId,
      phase: "prepanel",
      value: 5,
    }),
    {
      headers: {
        apikey: fixture.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      tags: { op: "score" },
    },
  );
  scoreLatency.add(res.timings.duration);

  if (res.status === 201) {
    scoreAccepted.add(1);
    const rows = res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row && (row.team_id !== judge.teamId || row.judge_id !== judge.userId)) {
      crossContamination.add(1);
    }
    check(res, { "score 201": () => true });
  } else {
    scoreRejected.add(1);
    console.error(`score failed for judge ${judge.userId}: ${res.status} ${res.body}`);
  }
}
