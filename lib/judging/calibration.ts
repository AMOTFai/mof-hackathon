import type { RubricCriterion, ScoreEntry } from "@/lib/judging/rubric";

/**
 * Calibration is a completion gate, not a pass/fail bar: RLS
 * ("judge upsert own scores") only requires that a `calibration_results` row
 * exists for the judge on this event before real scoring inserts succeed —
 * it does not check the deviation value. That is enforced in Postgres, so a
 * client bug here cannot let a judge score without calibrating. `deviation`
 * is still computed and stored so organizers can spot miscalibrated judges,
 * per BUILD-PLAN's "AI assists, humans decide" posture: surface the signal,
 * let a person act on it.
 */
export function calibrationDeviation(
  criteria: RubricCriterion[],
  submitted: ScoreEntry[],
  reference: ScoreEntry[],
): number | null {
  if (reference.length === 0) return null;
  const submittedById = new Map(submitted.map((s) => [s.criterionId, s.value]));
  const referenceById = new Map(reference.map((s) => [s.criterionId, s.value]));

  let totalAbsFraction = 0;
  let count = 0;
  for (const c of criteria) {
    const ref = referenceById.get(c.id);
    if (ref === undefined) continue;
    const got = submittedById.get(c.id) ?? 0;
    if (c.scaleMax <= 0) continue;
    totalAbsFraction += Math.abs(got - ref) / c.scaleMax;
    count += 1;
  }
  if (count === 0) return null;
  // Mean absolute deviation as a percentage of scale — comparable across
  // events with different scaleMax values.
  return (totalAbsFraction / count) * 100;
}

export const CALIBRATION_FLAG_THRESHOLD = 25;

/** A deviation this large is worth an organizer's attention, not a block. */
export function isCalibrationConcerning(deviation: number | null): boolean {
  return deviation !== null && deviation >= CALIBRATION_FLAG_THRESHOLD;
}
