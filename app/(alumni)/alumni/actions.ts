"use server";

import { requireAlumnus } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterParticipantWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { createPostSchema, deletePostSchema, respondIntroSchema, sendIntroSchema } from "@/lib/validation/alumni";

export async function createPost(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireAlumnus();
  const parsed = createPostSchema.safeParse({
    kind: formData.get("kind"),
    title: formData.get("title"),
    body: formData.get("body"),
    tags: formData.get("tags") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("alumni_posts").insert({
    author_id: access.user.id,
    kind: parsed.data.kind,
    title: parsed.data.title,
    body: parsed.data.body,
    tags: parsed.data.tags,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Posted." };
}

export async function deletePost(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAlumnus();
  const parsed = deletePostSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("alumni_posts").delete().eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Removed." };
}

export async function sendIntroRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireAlumnus();
  const parsed = sendIntroSchema.safeParse({ targetId: formData.get("targetId"), context: formData.get("context") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (parsed.data.targetId === access.user.id) return { ok: false, error: "You can't request an intro to yourself." };

  const supabase = await createClient();
  const { error } = await supabase.from("intro_requests").insert({
    requester_id: access.user.id,
    target_id: parsed.data.targetId,
    context: parsed.data.context,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Intro requested." };
}

export async function respondToIntro(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAlumnus();
  const parsed = respondIntroSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("intro_requests").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: `Marked ${parsed.data.status}.` };
}
