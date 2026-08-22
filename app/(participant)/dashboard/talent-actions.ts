"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterParticipantWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { requestErasureSchema, upsertTalentProfileSchema } from "@/lib/validation/talent";

/**
 * Grant or renew consent. This is fully self-service — RLS lets a user
 * write their own `talent_profiles` row directly, no service role involved
 * (Part 0 #2: consent should be as frictionless to grant, renew, and revoke
 * as the platform can make it).
 */
export async function upsertTalentProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const scopes: Record<string, boolean> = {};
  for (const key of ["profile", "projects", "contact"]) {
    scopes[key] = formData.get(`scope_${key}`) === "on";
  }
  const parsed = upsertTalentProfileSchema.safeParse({
    visibility: formData.get("visibility"),
    headline: formData.get("headline") ?? "",
    openTo: formData.get("openTo") ?? "",
    scopes,
    durationDays: formData.get("durationDays") ?? "90",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + parsed.data.durationDays * 86_400_000).toISOString();

  const { data: existing } = await supabase.from("talent_profiles").select("user_id").eq("user_id", access.user.id).maybeSingle();

  const { error } = await supabase.from("talent_profiles").upsert({
    user_id: access.user.id,
    visibility: parsed.data.visibility,
    headline: parsed.data.headline,
    open_to: parsed.data.openTo,
    consent_given_at: existing ? undefined : now.toISOString(),
    consent_expires_at: expiresAt,
    consent_scopes: parsed.data.scopes,
    last_reviewed_at: now.toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  await supabase.from("consent_events").insert({
    user_id: access.user.id,
    action: existing ? "updated" : "granted",
    scopes: parsed.data.scopes,
  });

  revalidateAfterParticipantWrite();
  return { ok: true, message: `Consent ${existing ? "renewed" : "granted"} — expires ${new Date(expiresAt).toLocaleDateString()}.` };
}

export async function withdrawConsent(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("talent_profiles")
    .update({ visibility: "private", consent_expires_at: null })
    .eq("user_id", access.user.id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("consent_events").insert({ user_id: access.user.id, action: "withdrawn", scopes: null });

  revalidateAfterParticipantWrite();
  return { ok: true, message: "Consent withdrawn. Your profile is private again immediately." };
}

export async function requestErasure(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = requestErasureSchema.safeParse({ scope: formData.get("scope") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("erasure_requests").insert({ user_id: access.user.id, scope: parsed.data.scope });
  if (error) return { ok: false, error: error.message };

  revalidateAfterParticipantWrite();
  return { ok: true, message: "Erasure requested. An admin will process it — this is logged and cannot be undone once completed." };
}
