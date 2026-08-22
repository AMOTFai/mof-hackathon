import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type AlumniPostRow = {
  id: string;
  authorId: string;
  authorName: string | null;
  kind: string;
  title: string;
  body: string;
  tags: string[] | null;
  createdAt: string;
};

export async function listAlumniPosts(supabase: Client): Promise<AlumniPostRow[]> {
  const { data, error } = await supabase
    .from("alumni_posts")
    .select("id, author_id, kind, title, body, tags, created_at, profiles!alumni_posts_author_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: profile?.full_name ?? null,
      kind: r.kind,
      title: r.title,
      body: r.body,
      tags: r.tags,
      createdAt: r.created_at,
    };
  });
}

export type IntroRequestRow = {
  id: string;
  requesterId: string;
  requesterName: string | null;
  targetId: string;
  targetName: string | null;
  context: string;
  status: string;
  createdAt: string;
};

export async function listIntroRequests(supabase: Client, userId: string): Promise<IntroRequestRow[]> {
  const { data, error } = await supabase
    .from("intro_requests")
    .select(
      "id, requester_id, target_id, context, status, created_at, requester:profiles!intro_requests_requester_id_fkey(full_name), target:profiles!intro_requests_target_id_fkey(full_name)",
    )
    .or(`requester_id.eq.${userId},target_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
    const target = Array.isArray(r.target) ? r.target[0] : r.target;
    return {
      id: r.id,
      requesterId: r.requester_id,
      requesterName: requester?.full_name ?? null,
      targetId: r.target_id,
      targetName: target?.full_name ?? null,
      context: r.context,
      status: r.status,
      createdAt: r.created_at,
    };
  });
}
