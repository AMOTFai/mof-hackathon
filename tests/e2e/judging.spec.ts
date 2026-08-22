import { test, expect } from "@playwright/test";
import { LIVE, admin, appReachable, setRangeValue, signInAs, uniqueSuffix } from "./helpers";

/**
 * The judging path — the other DoD-named critical path. Event/team/rubric/
 * calibration-sample/assignment fixtures are seeded via the service role
 * (already exercised at the RLS layer by tests/unit/judging-live.test.ts);
 * this spec drives the actual judge-facing UI: the calibration gate, then
 * scoring, in a real browser.
 */
test("judge clears the calibration gate through the UI, then scores an assigned team", async ({ page, baseURL }) => {
  test.skip(!LIVE, "requires Supabase env vars");
  test.skip(!(await appReachable(baseURL!)), "requires `pnpm dev` running locally");

  const svc = admin();
  const suffix = uniqueSuffix();
  const email = `e2e.judge.${suffix}@motf.test`;

  const created = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("no user");
  const judgeId = created.data.user.id;

  const { data: event, error: eventErr } = await svc
    .from("events")
    .insert({
      slug: `e2e-judge-${suffix}`,
      name: "E2E judging fixture",
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      ends_at: new Date(Date.now() + 86400_000).toISOString(),
      submission_deadline: new Date(Date.now() - 60_000).toISOString(),
      status: "judging",
    })
    .select("id")
    .single();
  if (eventErr || !event) throw eventErr ?? new Error("event");

  const { data: criterion, error: critErr } = await svc
    .from("rubric_criteria")
    .insert({ event_id: event.id, key: "technical", label: "Technical", description: "Execution quality", weight: 100, scale_max: 5, sort_order: 1 })
    .select("id")
    .single();
  if (critErr || !criterion) throw critErr ?? new Error("criterion");

  const { data: team, error: teamErr } = await svc
    .from("teams")
    .insert({ event_id: event.id, name: `E2E Judged ${suffix}`, project_name: "Aurora", submitted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (teamErr || !team) throw teamErr ?? new Error("team");

  const { data: sample, error: sampleErr } = await svc
    .from("calibration_samples")
    .insert({ event_id: event.id, title: "Practice sample", content: { description: "A reference project to calibrate against." }, reference_scores: [{ criterionId: criterion.id, value: 4 }] })
    .select("id")
    .single();
  if (sampleErr || !sample) throw sampleErr ?? new Error("sample");

  await svc.from("event_roles").insert({ event_id: event.id, user_id: judgeId, role: "judge" });
  await svc.from("judge_assignments").insert({ event_id: event.id, judge_id: judgeId, team_id: team.id, status: "pending" });

  try {
    await signInAs(page, svc, email);

    // Calibration gate blocks the assignment list until cleared.
    await page.goto("/judge");
    await expect(page.getByTestId("calibration-gate")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`open-${team.id}`)).not.toBeVisible();

    await setRangeValue(page.getByTestId(`cal-slider-${sample.id}-${criterion.id}`), "4");
    await expect(page.getByTestId(`submit-calibration-${sample.id}`)).toBeEnabled();
    await page.getByTestId(`submit-calibration-${sample.id}`).click();

    // Submitting calibration revalidates /judge, which immediately swaps the
    // calibration form for the assignment list — the gate disappearing IS
    // the success signal here, not a transient status message.
    await expect(page.getByTestId("calibration-gate")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`open-${team.id}`)).toBeVisible();
    await Promise.all([page.waitForURL(new RegExp(`/judge/${team.id}$`)), page.getByTestId(`open-${team.id}`).click()]);
    await setRangeValue(page.getByTestId(`slider-prepanel-${criterion.id}`), "5");
    await expect(page.getByTestId("submit-scores-prepanel")).toBeEnabled();
    await page.getByTestId("submit-scores-prepanel").click();
    await expect(page.getByText("Scores saved.")).toBeVisible({ timeout: 10_000 });

    const { data: scoreRow } = await svc.from("scores").select("value").eq("team_id", team.id).eq("judge_id", judgeId).eq("phase", "prepanel").single();
    expect(scoreRow?.value).toBe(5);
  } finally {
    await svc.from("events").delete().eq("id", event.id);
    await svc.auth.admin.deleteUser(judgeId);
  }
});
