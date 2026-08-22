"use server";

import { requireUser, ensureProfile } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { createEventSchema } from "@/lib/validation/event";

/**
 * Event creation is the one deliberate bootstrap exception. There is no
 * INSERT policy on `events` or `tenants` at all — by design, RLS scopes staff
 * access to events they already have an `event_roles` row on, which is
 * exactly the chicken-and-egg problem a brand-new event has. `bootstrap` is
 * one of the three sanctioned service-role uses (webhooks, cron, bootstrap —
 * see CLAUDE.md), and this is that: any signed-in user can spin up a new
 * event, in exchange for becoming its organizer. It does NOT grant any role
 * on an EXISTING event — the service-role writes here are scoped to rows this
 * action just created in the same call, never to an id the caller supplied
 * for something already in the database.
 */
export async function createEvent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await ensureProfile(user);

  const parsed = createEventSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    tagline: formData.get("tagline") ?? "",
    venue: formData.get("venue") ?? "",
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    submission_deadline: formData.get("submission_deadline"),
    max_team_size: formData.get("max_team_size") ?? "5",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const service = createServiceClient();

  const { data: existingEvent } = await service.from("events").select("id").eq("slug", parsed.data.slug).maybeSingle();
  if (existingEvent) return { ok: false, error: "That event slug is already taken." };

  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .insert({ slug: parsed.data.slug, name: parsed.data.name })
    .select("id")
    .single();
  if (tenantErr || !tenant) {
    if (tenantErr && /duplicate key/i.test(tenantErr.message)) {
      return { ok: false, error: "That event slug is already taken." };
    }
    return { ok: false, error: tenantErr?.message ?? "Could not create the event." };
  }

  const { data: event, error: eventErr } = await service
    .from("events")
    .insert({
      tenant_id: tenant.id,
      slug: parsed.data.slug,
      name: parsed.data.name,
      tagline: parsed.data.tagline,
      venue: parsed.data.venue,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      submission_deadline: parsed.data.submission_deadline,
      max_team_size: parsed.data.max_team_size,
      status: "draft",
    })
    .select("id, slug")
    .single();
  if (eventErr || !event) {
    // Partial failure: clean up the orphaned tenant rather than leaving debris.
    await service.from("tenants").delete().eq("id", tenant.id);
    return { ok: false, error: eventErr?.message ?? "Could not create the event." };
  }

  const { error: roleErr } = await service.from("event_roles").insert({
    event_id: event.id,
    user_id: user.id,
    role: "organizer",
  });
  if (roleErr) {
    return {
      ok: false,
      error: `Event was created but you weren't made organizer (${roleErr.message}). Contact an admin.`,
    };
  }

  return { ok: true, message: `Event "${parsed.data.name}" created. You are its organizer.` };
}
