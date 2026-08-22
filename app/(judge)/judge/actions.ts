"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateAfterParticipantWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import {
  aiFeedbackSchema,
  declareConflictSchema,
  discussionFlagSchema,
  judgeNoteSchema,
  pairwiseVoteSchema,
  submitCalibrationSchema,
  submitScoresSchema,
  teamIdSchema,
} from "@/lib/validation/judging";
import { calibrationDeviation } from "@/lib/judging/calibration";
import { isValueInRange } from "@/lib/judging/rubric";
import { listRubricCriteria } from "@/lib/judging/queries";
import { applyPairwiseVote, newJudgeReliability, newTeamRating } from "@/lib/judging/pairwise";
import { generateReview, type ProcessSignal } from "@/lib/ai/summarize";

function scoresRecordToEntries(record: Record<string, number>) {
  return Object.entries(record).map(([criterionId, value]) => ({ criterionId, value }));
}

export async function submitScores(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const raw = formData.get("scores");
  let scores: Record<string, number> = {};
  try {
    scores = raw ? JSON.parse(String(raw)) : {};
  } catch {
    return { ok: false, error: "Invalid scores payload." };
  }
  const parsed = submitScoresSchema.safeParse({ teamId: formData.get("teamId"), phase: formData.get("phase"), scores });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();

  // The schema has no CHECK constraint bounding scores.value to a criterion's
  // scale_max (aggregation clamps defensively, but a raw out-of-range value
  // should never be storable in the first place) — validate server-side
  // against each criterion's real scale_max rather than trusting the client's
  // slider to have stayed in range.
  const { data: team, error: teamErr } = await supabase.from("teams").select("event_id").eq("id", parsed.data.teamId).maybeSingle();
  if (teamErr) return { ok: false, error: teamErr.message };
  if (!team) return { ok: false, error: "Team not found." };
  const criteria = await listRubricCriteria(supabase, team.event_id);
  const criteriaById = new Map(criteria.map((c) => [c.id, c]));

  const rows: { team_id: string; judge_id: string; criterion_id: string; phase: string; value: number }[] = [];
  for (const [criterionId, value] of Object.entries(parsed.data.scores)) {
    const criterion = criteriaById.get(criterionId);
    if (!criterion) return { ok: false, error: "Unknown criterion for this event." };
    if (!isValueInRange(value, criterion.scaleMax)) {
      return { ok: false, error: `${criterion.label} must be between 0 and ${criterion.scaleMax}.` };
    }
    rows.push({ team_id: parsed.data.teamId, judge_id: access.user.id, criterion_id: criterionId, phase: parsed.data.phase, value });
  }
  if (rows.length === 0) return { ok: false, error: "No scores to submit." };

  const { error } = await supabase
    .from("scores")
    .upsert(rows, { onConflict: "team_id,judge_id,criterion_id,phase" });
  if (error) {
    if (/row-level security/i.test(error.message)) {
      return { ok: false, error: "Complete calibration before scoring, or you are not assigned to this team." };
    }
    return { ok: false, error: error.message };
  }
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Scores saved." };
}

export async function submitCalibration(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const raw = formData.get("scores");
  let scores: Record<string, number> = {};
  try {
    scores = raw ? JSON.parse(String(raw)) : {};
  } catch {
    return { ok: false, error: "Invalid scores payload." };
  }
  const parsed = submitCalibrationSchema.safeParse({ sampleId: formData.get("sampleId"), scores });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: sample, error: sampleErr } = await supabase
    .from("calibration_samples")
    .select("id, event_id, reference_scores")
    .eq("id", parsed.data.sampleId)
    .maybeSingle();
  if (sampleErr) return { ok: false, error: sampleErr.message };
  if (!sample) return { ok: false, error: "Calibration sample not found." };

  const criteria = await listRubricCriteria(supabase, sample.event_id);
  const submitted = scoresRecordToEntries(parsed.data.scores);
  const reference = Array.isArray(sample.reference_scores)
    ? (sample.reference_scores as unknown as { criterionId: string; value: number }[])
    : [];
  const deviation = calibrationDeviation(criteria, submitted, reference);

  const { error } = await supabase.from("calibration_results").upsert(
    {
      judge_id: access.user.id,
      sample_id: parsed.data.sampleId,
      scores: parsed.data.scores,
      deviation,
    },
    { onConflict: "judge_id,sample_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Calibration submitted — you can now score assigned teams." };
}

export async function declareConflict(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const parsed = declareConflictSchema.safeParse({ teamId: formData.get("teamId"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error: conflictErr } = await supabase
    .from("judge_conflicts")
    .upsert({ judge_id: access.user.id, team_id: parsed.data.teamId, reason: parsed.data.reason }, { onConflict: "judge_id,team_id" });
  if (conflictErr) return { ok: false, error: conflictErr.message };

  // Recusal per CLAUDE.md: scoring disabled, and existing scores for this team
  // are deleted so they stop influencing the aggregate.
  await supabase.from("scores").delete().eq("judge_id", access.user.id).eq("team_id", parsed.data.teamId);
  await supabase
    .from("judge_assignments")
    .update({ status: "recused" })
    .eq("judge_id", access.user.id)
    .eq("team_id", parsed.data.teamId);

  revalidateAfterParticipantWrite();
  return { ok: true, message: "Conflict declared. You are recused from this team and your scores were removed." };
}

export async function submitPairwiseVote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const parsed = pairwiseVoteSchema.safeParse({
    eventId: formData.get("eventId"),
    winnerId: formData.get("winnerId"),
    loserId: formData.get("loserId"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (parsed.data.winnerId === parsed.data.loserId) return { ok: false, error: "Choose two different teams." };

  const supabase = await createClient();
  // The vote itself is judge-authored and RLS-scoped: this is the authorization
  // step. Rating/reliability updates below are derived state with no user-facing
  // write policy (same class as commits/api_calls), so they go through the
  // service client — but only after this insert has proven the judge is real.
  const { error: voteErr } = await supabase.from("pairwise_votes").insert({
    event_id: parsed.data.eventId,
    judge_id: access.user.id,
    winner_id: parsed.data.winnerId,
    loser_id: parsed.data.loserId,
  });
  if (voteErr) return { ok: false, error: voteErr.message };

  const service = createServiceClient();
  const [winnerRow, loserRow, reliabilityRow] = await Promise.all([
    service.from("team_ratings").select("team_id, mu, sigma_sq, comparison_count").eq("team_id", parsed.data.winnerId).maybeSingle(),
    service.from("team_ratings").select("team_id, mu, sigma_sq, comparison_count").eq("team_id", parsed.data.loserId).maybeSingle(),
    service
      .from("judge_reliability")
      .select("judge_id, alpha, beta")
      .eq("judge_id", access.user.id)
      .eq("event_id", parsed.data.eventId)
      .maybeSingle(),
  ]);

  const winner = winnerRow.data
    ? { teamId: winnerRow.data.team_id, mu: winnerRow.data.mu, sigmaSq: winnerRow.data.sigma_sq, comparisonCount: winnerRow.data.comparison_count }
    : newTeamRating(parsed.data.winnerId);
  const loser = loserRow.data
    ? { teamId: loserRow.data.team_id, mu: loserRow.data.mu, sigmaSq: loserRow.data.sigma_sq, comparisonCount: loserRow.data.comparison_count }
    : newTeamRating(parsed.data.loserId);
  const judge = reliabilityRow.data
    ? { judgeId: reliabilityRow.data.judge_id, alpha: reliabilityRow.data.alpha, beta: reliabilityRow.data.beta }
    : newJudgeReliability(access.user.id);

  const result = applyPairwiseVote(winner, loser, judge);

  await Promise.all([
    service.from("team_ratings").upsert({
      team_id: result.winner.teamId,
      mu: result.winner.mu,
      sigma_sq: result.winner.sigmaSq,
      comparison_count: result.winner.comparisonCount,
    }),
    service.from("team_ratings").upsert({
      team_id: result.loser.teamId,
      mu: result.loser.mu,
      sigma_sq: result.loser.sigmaSq,
      comparison_count: result.loser.comparisonCount,
    }),
    service.from("judge_reliability").upsert({
      judge_id: result.judge.judgeId,
      event_id: parsed.data.eventId,
      alpha: result.judge.alpha,
      beta: result.judge.beta,
    }),
  ]);

  revalidateAfterParticipantWrite();
  return { ok: true, message: "Vote recorded." };
}

export async function flagForDiscussion(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const parsed = discussionFlagSchema.safeParse({ teamId: formData.get("teamId"), note: formData.get("note") ?? "" });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("event_id")
    .eq("id", parsed.data.teamId)
    .maybeSingle();
  if (teamErr) return { ok: false, error: teamErr.message };
  if (!team) return { ok: false, error: "Team not found." };

  const { error } = await supabase.from("discussion_flags").upsert(
    { judge_id: access.user.id, team_id: parsed.data.teamId, event_id: team.event_id, note: parsed.data.note },
    { onConflict: "team_id,judge_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Flagged for panel discussion." };
}

export async function saveJudgeNote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const parsed = judgeNoteSchema.safeParse({ teamId: formData.get("teamId"), body: formData.get("body") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("judge_notes")
    .upsert({ judge_id: access.user.id, team_id: parsed.data.teamId, body: parsed.data.body }, { onConflict: "team_id,judge_id" });
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Note saved (private to you and staff)." };
}

export async function submitAiFeedback(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const parsed = aiFeedbackSchema.safeParse({ teamId: formData.get("teamId"), helpful: formData.get("helpful") === "true" });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_review_feedback")
    .upsert({ judge_id: access.user.id, team_id: parsed.data.teamId, helpful: parsed.data.helpful }, { onConflict: "team_id,judge_id" });
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Thanks for the feedback." };
}

export async function generateAiReview(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["judge"]);
  const parsed = teamIdSchema.safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  // Authorize via the user-scoped client: must be an assigned judge on this
  // team, same as everything else this judge can see about the team. (Staff
  // can already read the cached result via RLS; they just can't trigger a
  // (re)generation from this action — a small future organizer action can
  // add that if needed.)
  const { data: assignment } = await supabase
    .from("judge_assignments")
    .select("id")
    .eq("judge_id", access.user.id)
    .eq("team_id", parsed.data.teamId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "You are not assigned to this team." };

  // Cost guard: this calls the ORGANIZATION's ANTHROPIC_API_KEY, not the
  // team's own (unlike the proxy, which is deliberately unrate-limited
  // because the cost sits on the team). A judge spam-clicking regenerate is
  // real spend, not just a UX nuisance, so skip the call if the cache is
  // still fresh — the process signal underneath it rarely changes minute to
  // minute anyway.
  const AI_REVIEW_MIN_INTERVAL_MS = 60_000;
  const { data: existingReview } = await supabase.from("ai_reviews").select("generated_at").eq("team_id", parsed.data.teamId).maybeSingle();
  if (existingReview && Date.now() - new Date(existingReview.generated_at).getTime() < AI_REVIEW_MIN_INTERVAL_MS) {
    return { ok: false, error: "Summary was just generated — wait a moment before regenerating." };
  }

  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("id, tenant_id, project_name, description, repo_url, video_url")
    .eq("id", parsed.data.teamId)
    .maybeSingle();
  if (teamErr) return { ok: false, error: teamErr.message };
  if (!team) return { ok: false, error: "Team not found." };

  const [{ listCheckIns }, { listCommits }, { milestonesWithStatus }, { listMilestones, listCheckInRecs }] = await Promise.all([
    import("@/lib/checkins/queries"),
    import("@/lib/github/queries"),
    import("@/lib/checkins/status"),
    import("@/lib/checkins/queries"),
  ]);
  const { data: eventRow } = await supabase.from("teams").select("event_id").eq("id", team.id).single();
  const eventId = eventRow?.event_id as string | undefined;

  const [checkIns, commits, defs, recs] = await Promise.all([
    listCheckIns(supabase, team.id),
    listCommits(supabase, team.id),
    eventId ? listMilestones(supabase, eventId) : Promise.resolve([]),
    listCheckInRecs(supabase, team.id),
  ]);
  const milestones = milestonesWithStatus(defs, recs);
  const activeDays = new Set(checkIns.map((c) => c.createdAt.slice(0, 10))).size;

  const signal: ProcessSignal = {
    projectName: team.project_name,
    description: team.description,
    checkInCount: checkIns.length,
    commitCount: commits.length,
    activeDays,
    hitMilestones: milestones.filter((m) => m.status === "hit").map((m) => m.label),
    lateMilestones: milestones.filter((m) => m.status === "late").map((m) => m.label),
    missedMilestones: milestones.filter((m) => m.status === "missed").map((m) => m.label),
    hasRepo: Boolean(team.repo_url),
    hasVideo: Boolean(team.video_url),
    recentCheckIns: checkIns.slice(0, 10).map((c) => ({ body: c.body, blockers: c.blockers })),
    recentCommitMessages: commits.slice(0, 10).map((c) => c.message ?? "").filter(Boolean),
  };

  const review = await generateReview(signal);

  const service = createServiceClient();
  const { error } = await service.from("ai_reviews").upsert({
    team_id: team.id,
    tenant_id: team.tenant_id,
    summary: review.summary,
    strengths: review.strengths,
    improvements: review.improvements,
    process_notes: review.processNotes,
    model: review.model,
  });
  if (error) return { ok: false, error: error.message };

  revalidateAfterParticipantWrite();
  return { ok: true, message: review.generatedByAI ? "AI summary generated." : "Summary generated (heuristic — no API key configured)." };
}
