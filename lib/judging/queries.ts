import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { RubricCriterion, ScoreEntry } from "@/lib/judging/rubric";
import type { JudgeCard } from "@/lib/judging/aggregate";
import type { TeamRating, JudgeReliability } from "@/lib/judging/pairwise";
import { pairKey } from "@/lib/judging/pairwise";
import { isPhase, type Phase } from "@/lib/enums";

type Client = SupabaseClient<Database>;

export async function listRubricCriteria(supabase: Client, eventId: string): Promise<RubricCriterion[]> {
  const { data, error } = await supabase
    .from("rubric_criteria")
    .select("id, key, label, description, weight, scale_max, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description,
    weight: r.weight,
    scaleMax: r.scale_max,
    sortOrder: r.sort_order,
  }));
}

export type AssignmentRow = {
  teamId: string;
  teamName: string;
  projectName: string | null;
  status: string;
  hasConflict: boolean;
};

export async function listAssignmentsForJudge(supabase: Client, judgeId: string, eventId: string): Promise<AssignmentRow[]> {
  const [{ data: assignments, error }, { data: conflicts, error: conflictErr }] = await Promise.all([
    supabase
      .from("judge_assignments")
      .select("team_id, status, teams!inner(id, name, project_name, event_id)")
      .eq("judge_id", judgeId)
      .eq("teams.event_id", eventId),
    supabase.from("judge_conflicts").select("team_id").eq("judge_id", judgeId),
  ]);
  if (error) throw error;
  if (conflictErr) throw conflictErr;
  const conflictIds = new Set((conflicts ?? []).map((c) => c.team_id));

  return (assignments ?? []).flatMap((row) => {
    const team = row.teams as unknown as { id: string; name: string; project_name: string | null } | null;
    if (!team) return [];
    return [
      {
        teamId: team.id,
        teamName: team.name,
        projectName: team.project_name,
        status: row.status,
        hasConflict: conflictIds.has(team.id),
      },
    ];
  });
}

export async function hasCompletedCalibration(supabase: Client, judgeId: string, eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("calibration_results")
    .select("sample_id, calibration_samples!inner(event_id)")
    .eq("judge_id", judgeId)
    .eq("calibration_samples.event_id", eventId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export type CalibrationSample = { id: string; title: string; content: unknown; referenceScores: ScoreEntry[] | null };

export async function listCalibrationSamples(supabase: Client, eventId: string): Promise<CalibrationSample[]> {
  const { data, error } = await supabase
    .from("calibration_samples")
    .select("id, title, content, reference_scores")
    .eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    content: s.content,
    referenceScores: Array.isArray(s.reference_scores)
      ? (s.reference_scores as unknown as ScoreEntry[])
      : null,
  }));
}

export async function getScoresForTeam(
  supabase: Client,
  judgeId: string,
  teamId: string,
): Promise<Record<Phase, ScoreEntry[]>> {
  const { data, error } = await supabase
    .from("scores")
    .select("criterion_id, value, phase")
    .eq("judge_id", judgeId)
    .eq("team_id", teamId);
  if (error) throw error;
  const result: Record<Phase, ScoreEntry[]> = { prepanel: [], live: [] };
  for (const row of data ?? []) {
    if (!isPhase(row.phase)) continue;
    result[row.phase].push({ criterionId: row.criterion_id, value: row.value });
  }
  return result;
}

/** All complete-card totals for a team, across every judge and phase — for aggregation. */
export async function getJudgeCardsForTeam(supabase: Client, teamId: string, criteria: RubricCriterion[]): Promise<JudgeCard[]> {
  const { data, error } = await supabase.from("scores").select("judge_id, criterion_id, value, phase").eq("team_id", teamId);
  if (error) throw error;

  const byJudgePhase = new Map<string, ScoreEntry[]>();
  for (const row of data ?? []) {
    if (!isPhase(row.phase)) continue;
    const key = `${row.judge_id}:${row.phase}`;
    const list = byJudgePhase.get(key) ?? [];
    list.push({ criterionId: row.criterion_id, value: row.value });
    byJudgePhase.set(key, list);
  }

  const { weightedTotal, isCardComplete } = await import("@/lib/judging/rubric");
  const cards: JudgeCard[] = [];
  for (const [key, scores] of byJudgePhase) {
    const [judgeId, phase] = key.split(":") as [string, Phase];
    if (!isCardComplete(criteria, scores)) continue;
    const total = weightedTotal(criteria, scores);
    if (total !== null) cards.push({ judgeId, phase, total });
  }
  return cards;
}

export type PairwiseCandidate = { id: string; name: string; projectName: string | null; rating: TeamRating };

/**
 * Submitted teams in the event plus their current rating, via the
 * list_pairwise_candidates RPC (migration 0003). Judges have no direct SELECT
 * access to `teams` beyond their own assignments, nor to `team_ratings` at
 * all (staff-only) — this RPC is the sanctioned narrow read for both, same
 * pattern as `view_talent_profile`.
 */
export async function listPairwiseCandidates(supabase: Client, eventId: string): Promise<PairwiseCandidate[]> {
  const { data, error } = await supabase.rpc("list_pairwise_candidates", { p_event_id: eventId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    projectName: r.project_name,
    rating: { teamId: r.id, mu: r.mu, sigmaSq: r.sigma_sq, comparisonCount: r.comparison_count },
  }));
}

/** Staff-only (RLS): all team ratings for an event, for the organizer results view. */
export async function getTeamRatings(supabase: Client, eventId: string): Promise<TeamRating[]> {
  const { data, error } = await supabase
    .from("team_ratings")
    .select("team_id, mu, sigma_sq, comparison_count, teams!inner(event_id)")
    .eq("teams.event_id", eventId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ teamId: r.team_id, mu: r.mu, sigmaSq: r.sigma_sq, comparisonCount: r.comparison_count }));
}

export async function getJudgeVotedPairs(supabase: Client, judgeId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("pairwise_votes").select("winner_id, loser_id").eq("judge_id", judgeId);
  if (error) throw error;
  return new Set((data ?? []).map((v) => pairKey(v.winner_id, v.loser_id)));
}

export async function getJudgeReliability(supabase: Client, judgeId: string, eventId: string): Promise<JudgeReliability | null> {
  const { data, error } = await supabase
    .from("judge_reliability")
    .select("alpha, beta")
    .eq("judge_id", judgeId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { judgeId, alpha: data.alpha, beta: data.beta };
}

export type AiReviewRow = {
  summary: string;
  strengths: string[];
  improvements: string[];
  processNotes: string | null;
  model: string;
  generatedAt: string;
};

export async function getAiReview(supabase: Client, teamId: string): Promise<AiReviewRow | null> {
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("summary, strengths, improvements, process_notes, model, generated_at")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    summary: data.summary,
    strengths: data.strengths,
    improvements: data.improvements,
    processNotes: data.process_notes,
    model: data.model,
    generatedAt: data.generated_at,
  };
}
