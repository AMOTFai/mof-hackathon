export type JudgeCard = { judgeId: string; phase: "prepanel" | "live"; total: number };

/**
 * One weighted total per judge: their `live` card if they have one (the
 * Sunday pitch panel supersedes async pre-review), else their `prepanel`
 * card. A judge who scored both phases only counts once.
 */
export function effectiveCardPerJudge(cards: JudgeCard[]): { judgeId: string; total: number }[] {
  const byJudge = new Map<string, JudgeCard>();
  for (const card of cards) {
    const existing = byJudge.get(card.judgeId);
    if (!existing || (existing.phase !== "live" && card.phase === "live")) {
      byJudge.set(card.judgeId, card);
    }
  }
  return [...byJudge.values()].map((c) => ({ judgeId: c.judgeId, total: c.total }));
}

/**
 * Drop the single highest and single lowest score before averaging — the
 * standard trimmed-mean guard against one outlier judge (too harsh or too
 * generous) swinging a team's result. Only trims when there are enough
 * scores that removing two still leaves a real average (4+); below that,
 * every score is load-bearing and none are dropped.
 */
export function dropHighLow(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.slice(1, -1);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * A team's final rubric score: one card per judge (live-preferred), trimmed,
 * averaged. Null when no judge has produced a complete card yet — never 0,
 * which would look like a real (bad) score.
 */
export function aggregateRubricScore(cards: JudgeCard[]): number | null {
  const effective = effectiveCardPerJudge(cards);
  const trimmed = dropHighLow(effective.map((c) => c.total));
  return mean(trimmed);
}

export type PhaseBreakdown = {
  prepanelAverage: number | null;
  liveAverage: number | null;
  judgeCount: number;
  finalScore: number | null;
};

/** Both phase averages (for organizer visibility) plus the final blended score. */
export function summarizeTeamScores(cards: JudgeCard[]): PhaseBreakdown {
  const prepanel = cards.filter((c) => c.phase === "prepanel").map((c) => c.total);
  const live = cards.filter((c) => c.phase === "live").map((c) => c.total);
  return {
    prepanelAverage: mean(prepanel),
    liveAverage: mean(live),
    judgeCount: effectiveCardPerJudge(cards).length,
    finalScore: aggregateRubricScore(cards),
  };
}
