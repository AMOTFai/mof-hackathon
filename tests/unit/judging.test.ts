import { describe, expect, it } from "vitest";
import { clampScoreValue, isCardComplete, isValueInRange, weightedTotal, type RubricCriterion } from "@/lib/judging/rubric";
import { calibrationDeviation, isCalibrationConcerning } from "@/lib/judging/calibration";
import { aggregateRubricScore, dropHighLow, effectiveCardPerJudge, summarizeTeamScores, type JudgeCard } from "@/lib/judging/aggregate";
import {
  applyPairwiseVote,
  newJudgeReliability,
  newTeamRating,
  pairKey,
  reliabilityMean,
  selectNextPair,
  winProbability,
} from "@/lib/judging/pairwise";
import { computeBracket, rankTeams } from "@/lib/judging/results";

function criteria(overrides: Partial<RubricCriterion>[] = []): RubricCriterion[] {
  const base: RubricCriterion[] = [
    { id: "c1", key: "technical", label: "Technical", description: "", weight: 30, scaleMax: 5, sortOrder: 1 },
    { id: "c2", key: "originality", label: "Originality", description: "", weight: 20, scaleMax: 5, sortOrder: 2 },
  ];
  return overrides.length ? overrides.map((o, i) => ({ ...base[i % base.length]!, ...o })) : base;
}

describe("rubric", () => {
  it("is incomplete when a criterion is unscored", () => {
    expect(isCardComplete(criteria(), [{ criterionId: "c1", value: 5 }])).toBe(false);
  });

  it("is complete when every criterion has a score", () => {
    expect(isCardComplete(criteria(), [{ criterionId: "c1", value: 5 }, { criterionId: "c2", value: 3 }])).toBe(true);
  });

  it("returns null weighted total for an incomplete card", () => {
    expect(weightedTotal(criteria(), [{ criterionId: "c1", value: 5 }])).toBeNull();
  });

  it("computes a 0-100 weighted total across criteria with the same scale", () => {
    // c1 weight 30 maxed (5/5), c2 weight 20 half (2.5/5) -> (1*30 + 0.5*20)/50 *100 = 80
    const total = weightedTotal(criteria(), [
      { criterionId: "c1", value: 5 },
      { criterionId: "c2", value: 2.5 },
    ]);
    expect(total).toBeCloseTo(80, 5);
  });

  it("normalizes criteria with different scaleMax correctly", () => {
    const c = criteria([
      { id: "c1", weight: 50, scaleMax: 10 },
      { id: "c2", weight: 50, scaleMax: 5 },
    ]);
    // c1: 10/10=100%, c2: 0/5=0% -> weighted avg 50%
    const total = weightedTotal(c, [
      { criterionId: "c1", value: 10 },
      { criterionId: "c2", value: 0 },
    ]);
    expect(total).toBeCloseTo(50, 5);
  });

  it("clamps and rounds a score value to the scale", () => {
    expect(clampScoreValue(7, 5)).toBe(5);
    expect(clampScoreValue(-1, 5)).toBe(0);
    expect(clampScoreValue(3.456, 5)).toBe(3.46);
  });

  it("isValueInRange rejects what the schema's own CHECK constraint does not — this is the actual gate", () => {
    // scores.value has no DB-level bound to scale_max; a malicious client
    // posting a raw out-of-range value would otherwise be stored unmodified.
    expect(isValueInRange(999, 5)).toBe(false);
    expect(isValueInRange(-1, 5)).toBe(false);
    expect(isValueInRange(5, 5)).toBe(true);
    expect(isValueInRange(0, 5)).toBe(true);
    expect(isValueInRange(Number.NaN, 5)).toBe(false);
    expect(isValueInRange(Infinity, 5)).toBe(false);
  });
});

describe("calibration", () => {
  it("is zero deviation for a perfect match", () => {
    const c = criteria();
    const ref = [{ criterionId: "c1", value: 4 }, { criterionId: "c2", value: 3 }];
    expect(calibrationDeviation(c, ref, ref)).toBe(0);
  });

  it("is null with no reference scores", () => {
    expect(calibrationDeviation(criteria(), [{ criterionId: "c1", value: 4 }], [])).toBeNull();
  });

  it("computes mean absolute deviation as a percentage of scale", () => {
    // c1 off by 5/5=100%, c2 exact (0%) -> mean 50%
    const c = criteria();
    const submitted = [{ criterionId: "c1", value: 0 }, { criterionId: "c2", value: 3 }];
    const reference = [{ criterionId: "c1", value: 5 }, { criterionId: "c2", value: 3 }];
    expect(calibrationDeviation(c, submitted, reference)).toBeCloseTo(50, 5);
  });

  it("flags a large deviation as concerning but not a small one", () => {
    expect(isCalibrationConcerning(30)).toBe(true);
    expect(isCalibrationConcerning(10)).toBe(false);
    expect(isCalibrationConcerning(null)).toBe(false);
  });
});

describe("aggregate", () => {
  function card(judgeId: string, phase: "prepanel" | "live", total: number): JudgeCard {
    return { judgeId, phase, total };
  }

  it("prefers a judge's live card over their prepanel card", () => {
    const cards = [card("j1", "prepanel", 40), card("j1", "live", 90)];
    expect(effectiveCardPerJudge(cards)).toEqual([{ judgeId: "j1", total: 90 }]);
  });

  it("uses the prepanel card when no live card exists", () => {
    const cards = [card("j1", "prepanel", 60)];
    expect(effectiveCardPerJudge(cards)).toEqual([{ judgeId: "j1", total: 60 }]);
  });

  it("does not trim with fewer than 4 scores", () => {
    expect(dropHighLow([10, 90, 50])).toEqual([10, 90, 50]);
  });

  it("drops exactly one high and one low with 4+ scores", () => {
    expect(dropHighLow([10, 50, 60, 90])).toEqual([50, 60]);
  });

  it("aggregates with trimming across judges, live-preferred", () => {
    const cards = [
      card("j1", "prepanel", 10),
      card("j2", "prepanel", 50),
      card("j3", "prepanel", 60),
      card("j4", "prepanel", 90),
      card("j1", "live", 95), // j1's live card replaces their prepanel 10
    ];
    // effective: j1=95, j2=50, j3=60, j4=90 -> sorted [50,60,90,95] -> trimmed [60,90] -> mean 75
    expect(aggregateRubricScore(cards)).toBeCloseTo(75, 5);
  });

  it("is null when no judge has a complete card", () => {
    expect(aggregateRubricScore([])).toBeNull();
  });

  it("summarizes phase averages and judge count separately from the trimmed final", () => {
    const cards = [card("j1", "prepanel", 40), card("j2", "live", 80)];
    const summary = summarizeTeamScores(cards);
    expect(summary.prepanelAverage).toBe(40);
    expect(summary.liveAverage).toBe(80);
    expect(summary.judgeCount).toBe(2);
    expect(summary.finalScore).toBe(60); // untrimmed mean of [40,80], <4 judges
  });
});

describe("pairwise: win probability and reliability", () => {
  it("is 0.5 for two identically-rated teams", () => {
    const a = newTeamRating("a");
    const b = newTeamRating("b");
    expect(winProbability(a, b)).toBeCloseTo(0.5, 5);
  });

  it("favors the higher-mu team", () => {
    const a = { ...newTeamRating("a"), mu: 5 };
    const b = newTeamRating("b");
    expect(winProbability(a, b)).toBeGreaterThan(0.5);
    expect(winProbability(b, a)).toBeLessThan(0.5);
  });

  it("computes reliability mean from alpha/beta", () => {
    expect(reliabilityMean({ judgeId: "j", alpha: 9, beta: 1 })).toBeCloseTo(0.9, 5);
  });
});

describe("pairwise: rating updates", () => {
  it("raises the winner's mu and lowers the loser's mu on an even matchup", () => {
    const winner = newTeamRating("a");
    const loser = newTeamRating("b");
    const judge = newJudgeReliability("j");
    const result = applyPairwiseVote(winner, loser, judge);
    expect(result.winner.mu).toBeGreaterThan(winner.mu);
    expect(result.loser.mu).toBeLessThan(loser.mu);
  });

  it("moves ratings more for a surprising (upset) result than an expected one", () => {
    const judge = newJudgeReliability("j");
    // Expected: high-mu team wins (low surprise).
    const strongWinner = { ...newTeamRating("a"), mu: 5 };
    const weakLoser = newTeamRating("b");
    const expectedResult = applyPairwiseVote(strongWinner, weakLoser, judge);
    const expectedMove = expectedResult.winner.mu - strongWinner.mu;

    // Upset: low-mu team wins over a high-mu team (high surprise).
    const weakWinner = newTeamRating("c");
    const strongLoser = { ...newTeamRating("d"), mu: 5 };
    const upsetResult = applyPairwiseVote(weakWinner, strongLoser, judge);
    const upsetMove = upsetResult.winner.mu - weakWinner.mu;

    expect(upsetMove).toBeGreaterThan(expectedMove);
  });

  it("scales the update by judge reliability — an unreliable judge moves ratings less", () => {
    const reliable = { judgeId: "j1", alpha: 10, beta: 1 };
    const unreliable = { judgeId: "j2", alpha: 1, beta: 10 };
    const winnerA = newTeamRating("a");
    const loserA = newTeamRating("b");
    const winnerB = newTeamRating("c");
    const loserB = newTeamRating("d");

    const reliableResult = applyPairwiseVote(winnerA, loserA, reliable);
    const unreliableResult = applyPairwiseVote(winnerB, loserB, unreliable);

    expect(reliableResult.winner.mu - winnerA.mu).toBeGreaterThan(unreliableResult.winner.mu - winnerB.mu);
  });

  it("shrinks sigma toward the floor and never below it", () => {
    const winner = newTeamRating("a");
    const loser = newTeamRating("b");
    const judge = newJudgeReliability("j");
    let w = winner;
    let l = loser;
    for (let i = 0; i < 50; i += 1) {
      const r = applyPairwiseVote(w, l, judge);
      w = r.winner;
      l = r.loser;
    }
    expect(w.sigmaSq).toBeGreaterThanOrEqual(0.05);
    expect(w.sigmaSq).toBeLessThan(winner.sigmaSq);
  });

  it("increases comparison counts for both teams", () => {
    const winner = newTeamRating("a");
    const loser = newTeamRating("b");
    const result = applyPairwiseVote(winner, loser, newJudgeReliability("j"));
    expect(result.winner.comparisonCount).toBe(1);
    expect(result.loser.comparisonCount).toBe(1);
  });

  it("increases judge alpha on an agreeing (expected) vote, beta on a surprising one", () => {
    const judge = newJudgeReliability("j");
    const expected = applyPairwiseVote({ ...newTeamRating("a"), mu: 5 }, newTeamRating("b"), judge);
    expect(expected.judge.alpha).toBeGreaterThan(judge.alpha);
    expect(expected.judge.beta).toBe(judge.beta);

    const surprising = applyPairwiseVote(newTeamRating("c"), { ...newTeamRating("d"), mu: 5 }, judge);
    expect(surprising.judge.beta).toBeGreaterThan(judge.beta);
    expect(surprising.judge.alpha).toBe(judge.alpha);
  });
});

describe("pairwise: pair selection", () => {
  it("returns null when fewer than 2 teams", () => {
    expect(selectNextPair([newTeamRating("a")], new Set())).toBeNull();
  });

  it("skips a pair the judge already voted on, in either order", () => {
    const a = newTeamRating("a");
    const b = newTeamRating("b");
    const c = newTeamRating("c");
    const voted = new Set([pairKey("a", "b")]);
    const next = selectNextPair([a, b, c], voted);
    expect(next).not.toBeNull();
    const ids = [next!.teamA.teamId, next!.teamB.teamId].sort();
    expect(ids).not.toEqual(["a", "b"]);
  });

  it("returns null once every pair has been compared", () => {
    const a = newTeamRating("a");
    const b = newTeamRating("b");
    const voted = new Set([pairKey("a", "b")]);
    expect(selectNextPair([a, b], voted)).toBeNull();
  });

  it("prefers a closer (more uncertain-outcome) pair over a lopsided one", () => {
    const close1 = { ...newTeamRating("a"), mu: 0 };
    const close2 = { ...newTeamRating("b"), mu: 0.1 };
    const lopsided = { ...newTeamRating("c"), mu: 20 };
    const next = selectNextPair([close1, close2, lopsided], new Set());
    const ids = [next!.teamA.teamId, next!.teamB.teamId].sort();
    expect(ids).toEqual(["a", "b"]);
  });

  it("pairKey is order-independent", () => {
    expect(pairKey("x", "y")).toBe(pairKey("y", "x"));
  });
});

describe("results: bracket computation", () => {
  const base = { capped: false, rubricScore: 80, cupScoreThreshold: null, hasWorkingDemo: true, workingDemoRequired: true };

  it("caps to plate regardless of score when capped", () => {
    expect(computeBracket({ ...base, capped: true, rubricScore: 99 })).toBe("plate");
  });

  it("caps to plate when a working demo is required but missing", () => {
    expect(computeBracket({ ...base, hasWorkingDemo: false })).toBe("plate");
  });

  it("is unassigned when there is no rubric score yet", () => {
    expect(computeBracket({ ...base, rubricScore: null })).toBe("unassigned");
  });

  it("falls to plate below the cup threshold", () => {
    expect(computeBracket({ ...base, cupScoreThreshold: 85 })).toBe("plate");
  });

  it("is cup when everything clears", () => {
    expect(computeBracket({ ...base, cupScoreThreshold: 70 })).toBe("cup");
  });

  it("never returns disqualified — that is a human-only override (enforced by the return type itself)", () => {
    const result = computeBracket({ ...base, capped: true });
    expect(result).not.toBe("disqualified");
  });
});

describe("results: ranking", () => {
  it("blends rubric and pairwise percentiles by pairwise_blend", () => {
    const teams = [
      { teamId: "a", rubricScore: 100, pairwiseMu: 0 },
      { teamId: "b", rubricScore: 0, pairwiseMu: 10 },
    ];
    // blend=0: pure rubric -> a ranks 1st
    expect(rankTeams(teams, 0).find((t) => t.teamId === "a")?.finalRank).toBe(1);
    // blend=1: pure pairwise -> b ranks 1st
    expect(rankTeams(teams, 1).find((t) => t.teamId === "b")?.finalRank).toBe(1);
  });

  it("ranks pairwise standings independent of the blend weight", () => {
    const teams = [
      { teamId: "a", rubricScore: null, pairwiseMu: 5 },
      { teamId: "b", rubricScore: null, pairwiseMu: 1 },
    ];
    const ranks = rankTeams(teams, 0.5);
    expect(ranks.find((t) => t.teamId === "a")?.pairwiseRank).toBe(1);
    expect(ranks.find((t) => t.teamId === "b")?.pairwiseRank).toBe(2);
  });

  it("ranks a team on whichever single signal it has", () => {
    const teams = [
      { teamId: "a", rubricScore: 90, pairwiseMu: null },
      { teamId: "b", rubricScore: 50, pairwiseMu: null },
    ];
    const ranks = rankTeams(teams, 0.5);
    expect(ranks.find((t) => t.teamId === "a")?.finalRank).toBe(1);
  });

  it("gives no rank to a team with neither signal", () => {
    const teams = [{ teamId: "a", rubricScore: null, pairwiseMu: null }];
    expect(rankTeams(teams, 0.5)[0]?.finalRank).toBeNull();
    expect(rankTeams(teams, 0.5)[0]?.pairwiseRank).toBeNull();
  });
});
