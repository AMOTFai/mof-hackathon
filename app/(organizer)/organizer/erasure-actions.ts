"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateAfterStaffWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { completeErasureSchema } from "@/lib/validation/talent";

/**
 * Completes an erasure request. Admin-only (not organizer) — this writes
 * across another user's `profiles` row, which no RLS policy permits any
 * staff role to do directly (there is no "staff write profiles" policy at
 * all), so it goes through the service role after confirming both the
 * request is real and the caller is an admin.
 *
 * Scope is honest about what it does, not aspirational:
 *  - talent_only: deletes the talent_profiles row and logs a withdrawal.
 *  - full: the above, PLUS anonymizes the profile's PII fields (name, bio,
 *    skills, school, GitHub, avatar, email). It does NOT delete the auth
 *    account or cascade into teams/scores/check-ins/commits — those carry
 *    other people's data too (teammates, judges, results) and a same-session
 *    cascading delete across ~15 tables is a product decision this action
 *    does not make unilaterally. That gap is real and should be closed
 *    deliberately, not silently claimed as done.
 */
export async function completeErasure(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  if (!access.roles.includes("admin")) {
    return { ok: false, error: "Only an admin can complete an erasure request." };
  }
  const parsed = completeErasureSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("erasure_requests")
    .select("id, user_id, scope, completed_at")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (!request) return { ok: false, error: "Erasure request not found." };
  if (request.completed_at) return { ok: false, error: "Already completed." };

  const service = createServiceClient();

  const { error: talentErr } = await service.from("talent_profiles").delete().eq("user_id", request.user_id);
  if (talentErr) return { ok: false, error: talentErr.message };
  await service.from("consent_events").insert({ user_id: request.user_id, action: "withdrawn", scopes: null });

  if (request.scope === "full") {
    const { error: profileErr } = await service
      .from("profiles")
      .update({
        full_name: null,
        university: null,
        course: null,
        grad_year: null,
        bio: null,
        skills: [],
        github_username: null,
        avatar_url: null,
        email: `erased-${request.user_id}@erased.invalid`,
      })
      .eq("id", request.user_id);
    if (profileErr) return { ok: false, error: profileErr.message };
  }

  const { error: completeErr } = await service
    .from("erasure_requests")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", parsed.data.requestId);
  if (completeErr) return { ok: false, error: completeErr.message };

  revalidateAfterStaffWrite();
  return {
    ok: true,
    message:
      request.scope === "full"
        ? "Talent data deleted and profile anonymized."
        : "Talent data deleted.",
  };
}
