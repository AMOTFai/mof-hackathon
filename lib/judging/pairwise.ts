/**
 * Pairwise comparison ratings: a simplified Crowd-BT (Chen et al.) — Bradley-
 * Terry team skill jointly updated with per-judge reliability from crowd
 * votes. The schema's `team_ratings(mu, sigma_sq)` and
 * `judge_reliability(alpha, beta)` columns are this model's state.
 *
 * This is a pragmatic approximation, not the paper's exact variational
 * update (that needs digamma functions and joint EM) — it keeps the same
 * shape (Gaussian team skill, Beta judge reliability, reliability-weighted
 * updates, uncertainty shrinkage) with simple closed-form steps that are
 * easy to reason about and test. Good enough for a weekend event's judge
 * panel; flag before trusting it for a much larger competition.
 */

export type TeamRating = { teamId: string; mu: number; sigmaSq: number; comparisonCount: number };
export type JudgeReliability = { judgeId: string; alpha: number; beta: number };

const COMPARISON_NOISE = 1; // additive variance modeling noise in a single comparison
const MIN_SIGMA_SQ = 0.05;
const BASE_LEARNING_RATE = 0.5;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** P(a beats b) under the current ratings. */
export function winProbability(a: TeamRating, b: TeamRating): number {
  const denom = Math.sqrt(a.sigmaSq + b.sigmaSq + 2 * COMPARISON_NOISE * COMPARISON_NOISE);
  return sigmoid((a.mu - b.mu) / denom);
}

export function reliabilityMean(r: JudgeReliability): number {
  return r.alpha / (r.alpha + r.beta);
}

export type RatingUpdateResult = { winner: TeamRating; loser: TeamRating; judge: JudgeReliability };

/**
 * Online update after a judge votes winner-over-loser.
 *
 * - `surprise` = how unexpected the outcome was under the PRIOR ratings
 *   (1 − P(winner wins)); an already-expected result barely moves anything.
 * - The step is scaled by the judge's current reliability mean, so an
 *   unreliable judge's vote nudges ratings less than a reliable judge's.
 * - Each team's own uncertainty (`sigmaSq`) scales how far ITS rating can
 *   move in one vote — a team with few comparisons (high sigma) swings more
 *   than one the panel already has a confident read on.
 * - sigma shrinks a fixed fraction toward a floor on every comparison: more
 *   data -> more confidence, but it never collapses to zero.
 * - Judge reliability updates as Beta pseudo-counts: a vote that agreed with
 *   what the ratings already predicted (p >= 0.5 for the actual winner) is
 *   evidence of a reliable judge (alpha += 1). A surprising vote is treated
 *   as weak negative evidence (beta += 0.5, not a full penalty) — one upset
 *   call shouldn't tank a judge's credibility; a pattern of them will.
 */
export function applyPairwiseVote(winner: TeamRating, loser: TeamRating, judge: JudgeReliability): RatingUpdateResult {
  const p = winProbability(winner, loser);
  const surprise = 1 - p;
  const reliability = reliabilityMean(judge);
  const step = BASE_LEARNING_RATE * reliability * surprise;

  const newWinner: TeamRating = {
    ...winner,
    mu: winner.mu + step * Math.sqrt(winner.sigmaSq),
    sigmaSq: Math.max(MIN_SIGMA_SQ, winner.sigmaSq * 0.9),
    comparisonCount: winner.comparisonCount + 1,
  };
  const newLoser: TeamRating = {
    ...loser,
    mu: loser.mu - step * Math.sqrt(loser.sigmaSq),
    sigmaSq: Math.max(MIN_SIGMA_SQ, loser.sigmaSq * 0.9),
    comparisonCount: loser.comparisonCount + 1,
  };
  const agreed = p >= 0.5;
  const newJudge: JudgeReliability = agreed
    ? { ...judge, alpha: judge.alpha + 1 }
    : { ...judge, beta: judge.beta + 0.5 };

  return { winner: newWinner, loser: newLoser, judge: newJudge };
}

function entropy(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

export function pairKey(teamIdA: string, teamIdB: string): string {
  return [teamIdA, teamIdB].sort().join("|");
}

export type PairCandidate = { teamA: TeamRating; teamB: TeamRating };

/**
 * Next pair to show a judge, maximizing expected information gain.
 *
 * Outcome entropy peaks at p=0.5 (a genuine toss-up is the most informative
 * comparison to observe), so that's the base score. A small exploration
 * bonus favors teams with fewer comparisons so far, so the panel doesn't
 * fixate on a few well-compared teams while others stay unrated. Pairs the
 * judge has already voted on (either order) are excluded.
 */
export function selectNextPair(ratings: TeamRating[], alreadyCompared: Set<string>): PairCandidate | null {
  let best: PairCandidate | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < ratings.length; i += 1) {
    for (let j = i + 1; j < ratings.length; j += 1) {
      const a = ratings[i];
      const b = ratings[j];
      if (!a || !b) continue;
      if (alreadyCompared.has(pairKey(a.teamId, b.teamId))) continue;
      const p = winProbability(a, b);
      const exploration = 1 / (1 + Math.min(a.comparisonCount, b.comparisonCount));
      const score = entropy(p) + 0.25 * exploration;
      if (score > bestScore) {
        bestScore = score;
        best = { teamA: a, teamB: b };
      }
    }
  }
  return best;
}

export function newTeamRating(teamId: string): TeamRating {
  return { teamId, mu: 0, sigmaSq: 1, comparisonCount: 0 };
}

export function newJudgeReliability(judgeId: string): JudgeReliability {
  return { judgeId, alpha: 10, beta: 1 };
}
