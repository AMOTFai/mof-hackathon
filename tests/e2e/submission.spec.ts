import { test, expect } from "@playwright/test";
import { LIVE, admin, appReachable, signInAs, uniqueSuffix } from "./helpers";

/**
 * The submission path — one of the two DoD-named critical paths (BUILD-PLAN
 * Part 13). Fixtures (event, team, membership) are seeded directly via the
 * service role, same as the live vitest suites; only the actual submission
 * UI is driven through the real browser, which is the part worth E2E-testing
 * (the fixture setup is already covered at the RLS layer elsewhere).
 */
test("captain fills out and submits a project, and the page locks afterwards", async ({ page, baseURL }) => {
  test.skip(!LIVE, "requires Supabase env vars");
  test.skip(!(await appReachable(baseURL!)), "requires `pnpm dev` running locally");

  const svc = admin();
  const suffix = uniqueSuffix();
  const email = `e2e.submit.${suffix}@motf.test`;

  const created = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("no user");
  const userId = created.data.user.id;

  const { data: event, error: eventErr } = await svc
    .from("events")
    .insert({
      slug: `e2e-submit-${suffix}`,
      name: "E2E submission fixture",
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      ends_at: new Date(Date.now() + 86400_000).toISOString(),
      submission_deadline: new Date(Date.now() + 3600_000).toISOString(),
      status: "live",
      working_demo_required: false,
    })
    .select("id")
    .single();
  if (eventErr || !event) throw eventErr ?? new Error("event");

  await svc.from("event_roles").insert({ event_id: event.id, user_id: userId, role: "participant" });
  const { data: team, error: teamErr } = await svc
    .from("teams")
    .insert({ event_id: event.id, name: `E2E Submit ${suffix}` })
    .select("id")
    .single();
  if (teamErr || !team) throw teamErr ?? new Error("team");
  await svc.from("team_members").insert({ team_id: team.id, user_id: userId, role: "captain" });

  try {
    await signInAs(page, svc, email);
    await page.goto("/dashboard/submit");

    await expect(page.getByTestId("sub-missing")).toBeVisible();
    await expect(page.getByTestId("sub-submit")).toBeDisabled();

    await page.getByTestId("sub-project").fill("Aurora");
    await page.getByTestId("sub-repo").fill("https://github.com/motf/aurora");
    await page.getByTestId("sub-video").fill("https://youtu.be/demo");
    await page.getByTestId("sub-save").click();
    await expect(page.getByText("Team updated.")).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByTestId("sub-submit")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("sub-submit").click();

    await expect(page.getByTestId("submission-locked")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("submission-locked")).toContainText("Aurora");

    const { data: row } = await svc.from("teams").select("submitted_at, project_name").eq("id", team.id).single();
    expect(row?.submitted_at).toBeTruthy();
    expect(row?.project_name).toBe("Aurora");
  } finally {
    await svc.from("events").delete().eq("id", event.id);
    await svc.auth.admin.deleteUser(userId);
  }
});
