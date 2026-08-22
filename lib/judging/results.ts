import type { Bracket } from "@/lib/enums";

/**
 * Bracket and rank computation for the results-publish action.
 *
 * BUILD-PLAN Part 0 #6 is explicit: only two rules are ever automatic — a
 * missed V1 slice auto-caps to Plate, and a missed final submission is a DQ
 * *risk flag* for a human to act on, never an automatic disqualification.
 * This module computes `cup | plate | unassigned` only. `disqualified` is set
 * exclusively by an explicit organizer action elsewhere — never by this code.
 */

export type BracketInput = {
  /** From lib/checkins/status.ts's isPlateCapped — the one other hard rule. */
  capped: boolean;
  rubricScore: number | null;
  cupScoreThreshold: number | null;
  hasWorkingDemo: boolean;
  workingDemoRequired: boolean;
};

export function computeBracket(input: BracketInput): Exclude<Bracket, "disqualified"> {
  if (input.capped) return "plate";
  if (input.workingDemoRequired && !input.hasWorkingDemo) return "plate";
  if (input.rubricScore === null) return "unassigned";
  if (input.cupScoreThreshold !== null && input.rubricScore < input.cupScoreThreshold) return "plate";
  return "cup";
}

export type RankInput = { teamId: string; rubricScore: number | null; pairwiseMu: number | null };
export type RankOutput = { teamId: string; pairwiseRank: number | null; finalRank: number | null };

/** 1 = best score in the field, evenly spread to 0 = worst; null values excluded from that metric's ranking. */
function percentiles(values: (number | null)[]): (number | null)[] {
  const withIndex = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  if (withIndex.length <= 1) return values.map((v) => (v === null ? null : 1));
  const sorted = [...withIndex].sort((a, b) => b.v - a.v);
  const result: (number | null)[] = values.map(() => null);
  sorted.forEach(({ i }, rank) => {
    result[i] = 1 - rank / (sorted.length - 1);
  });
  return result;
}

/**
 * Blends rubric and pairwise standings by percentile (not raw units — rubric
 * is 0-100, pairwise mu is unscaled, so ranking within-field is the only
 * comparable currency), weighted by `events.pairwise_blend`. A team missing
 * one signal is ranked on the other alone; a team with neither gets no rank
 * at all rather than a misleading last place.
 */
export function rankTeams(teams: RankInput[], pairwiseBlend: number): RankOutput[] {
  const rubricPct = percentiles(teams.map((t) => t.rubricScore));
  const pairwisePct = percentiles(teams.map((t) => t.pairwiseMu));

  const pairwiseRanked = [...teams]
    .map((t, i) => ({ teamId: t.teamId, mu: t.pairwiseMu, i }))
    .filter((t): t is { teamId: string; mu: number; i: number } => t.mu !== null)
    .sort((a, b) => b.mu - a.mu);
  const pairwiseRankById = new Map(pairwiseRanked.map((t, idx) => [t.teamId, idx + 1]));

  const blended = teams.map((t, i) => {
    const rp = rubricPct[i] ?? null;
    const pp = pairwisePct[i] ?? null;
    let score: number | null;
    if (rp === null && pp === null) score = null;
    else if (rp === null) score = pp;
    else if (pp === null) score = rp;
    else score = pairwiseBlend * pp + (1 - pairwiseBlend) * rp;
    return { teamId: t.teamId, score, rubricScore: t.rubricScore };
  });

  const ranked = blended
    .filter((b): b is { teamId: string; score: number; rubricScore: number | null } => b.score !== null)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : (b.rubricScore ?? 0) - (a.rubricScore ?? 0)));
  const finalRankById = new Map(ranked.map((t, idx) => [t.teamId, idx + 1]));

  return teams.map((t) => ({
    teamId: t.teamId,
    pairwiseRank: pairwiseRankById.get(t.teamId) ?? null,
    finalRank: finalRankById.get(t.teamId) ?? null,
  }));
}
