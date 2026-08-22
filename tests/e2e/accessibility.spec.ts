import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { LIVE, admin, appReachable, signInAs, uniqueSuffix } from "./helpers";

/**
 * BUILD-PLAN Part 13 asks for "Accessibility >= 95 on judging and check-in
 * flows" — phrased like a Lighthouse score. This uses axe-core instead: it
 * checks real WCAG rules (axe is what Lighthouse's own a11y category runs
 * under the hood) and reports concrete, actionable violations rather than a
 * single composite number that can hide exactly what's broken. The bar here
 * is stricter and more honest: zero serious/critical violations on either
 * flow, not a rounded score.
 */
test.describe("accessibility — WCAG 2.1 AA (axe-core)", () => {
  test("check-in flow (/dashboard/checkins) has no serious or critical violations", async ({ page, baseURL }) => {
    test.skip(!LIVE, "requires Supabase env vars");
    test.skip(!(await appReachable(baseURL!)), "requires `pnpm dev` running locally");

    const svc = admin();
    const suffix = uniqueSuffix();
    const email = `e2e.a11y-checkin.${suffix}@motf.test`;
    const created = await svc.auth.admin.createUser({ email, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("no user");
    const userId = created.data.user.id;

    const { data: event } = await svc
      .from("events")
      .insert({
        slug: `e2e-a11y-ci-${suffix}`,
        name: "A11y check-in fixture",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
        status: "live",
      })
      .select("id")
      .single();
    if (!event) throw new Error("event");

    await svc.from("event_roles").insert({ event_id: event.id, user_id: userId, role: "participant" });
    await svc.from("milestones").insert({
      event_id: event.id,
      key: "v1_slice",
      label: "V1 slice",
      due_at: new Date(Date.now() + 3600_000).toISOString(),
      required: true,
      penalty: "flag",
      sort_order: 1,
    });
    const { data: team } = await svc.from("teams").insert({ event_id: event.id, name: `A11y CI ${suffix}` }).select("id").single();
    if (!team) throw new Error("team");
    await svc.from("team_members").insert({ team_id: team.id, user_id: userId, role: "captain" });
    await svc.from("check_ins").insert({ team_id: team.id, author_id: userId, body: "Wired up the login flow." });

    try {
      // FadeUp (components/motion/fade-up.tsx) skips its entrance animation
      // under reduced motion — without this, axe can scan mid-fade and flag
      // a transient opacity-blended color as a contrast violation that was
      // never true of the page's actual settled state.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await signInAs(page, svc, email);
      await page.goto("/dashboard/checkins");
      await expect(page.getByTestId("checkin-composer")).toBeVisible({ timeout: 10_000 });

      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      if (serious.length > 0) {
        console.error(JSON.stringify(serious, null, 2));
      }
      expect(serious, `${serious.length} serious/critical a11y violation(s) — see console output above`).toEqual([]);
    } finally {
      await svc.from("events").delete().eq("id", event.id);
      await svc.auth.admin.deleteUser(userId);
    }
  });

  test("judging flow (/judge/[teamId]) has no serious or critical violations", async ({ page, baseURL }) => {
    test.skip(!LIVE, "requires Supabase env vars");
    test.skip(!(await appReachable(baseURL!)), "requires `pnpm dev` running locally");

    const svc = admin();
    const suffix = uniqueSuffix();
    const email = `e2e.a11y-judge.${suffix}@motf.test`;
    const created = await svc.auth.admin.createUser({ email, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("no user");
    const judgeId = created.data.user.id;

    const { data: event } = await svc
      .from("events")
      .insert({
        slug: `e2e-a11y-judge-${suffix}`,
        name: "A11y judging fixture",
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 86400_000).toISOString(),
        submission_deadline: new Date(Date.now() - 60_000).toISOString(),
        status: "judging",
      })
      .select("id")
      .single();
    if (!event) throw new Error("event");

    const { data: criterion } = await svc
      .from("rubric_criteria")
      .insert({ event_id: event.id, key: "technical", label: "Technical", description: "d", weight: 100, scale_max: 5, sort_order: 1 })
      .select("id")
      .single();
    if (!criterion) throw new Error("criterion");

    const { data: team } = await svc
      .from("teams")
      .insert({ event_id: event.id, name: `A11y Judged ${suffix}`, submitted_at: new Date().toISOString() })
      .select("id")
      .single();
    if (!team) throw new Error("team");

    await svc.from("event_roles").insert({ event_id: event.id, user_id: judgeId, role: "judge" });
    await svc.from("judge_assignments").insert({ event_id: event.id, judge_id: judgeId, team_id: team.id, status: "pending" });

    const { data: sample } = await svc
      .from("calibration_samples")
      .insert({ event_id: event.id, title: "Sample", content: { description: "d" }, reference_scores: [{ criterionId: criterion.id, value: 4 }] })
      .select("id")
      .single();
    await svc.from("calibration_results").insert({ judge_id: judgeId, sample_id: sample!.id, scores: { [criterion.id]: 4 }, deviation: 0 });

    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await signInAs(page, svc, email);
      await page.goto(`/judge/${team.id}`);
      await expect(page.getByTestId(`rubric-form-prepanel`)).toBeVisible({ timeout: 10_000 });

      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      if (serious.length > 0) {
        console.error(JSON.stringify(serious, null, 2));
      }
      expect(serious, `${serious.length} serious/critical a11y violation(s) — see console output above`).toEqual([]);
    } finally {
      await svc.from("events").delete().eq("id", event.id);
      await svc.auth.admin.deleteUser(judgeId);
    }
  });
});
