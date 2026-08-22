import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type CommitEntry = {
  id: string;
  sha: string;
  message: string | null;
  authorLogin: string | null;
  authoredAt: string;
  additions: number | null;
  deletions: number | null;
  filesChanged: number | null;
};

export async function listCommits(supabase: Client, teamId: string, limit = 100): Promise<CommitEntry[]> {
  const { data, error } = await supabase
    .from("commits")
    .select("id, sha, message, author_login, authored_at, additions, deletions, files_changed")
    .eq("team_id", teamId)
    .order("authored_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    sha: row.sha,
    message: row.message,
    authorLogin: row.author_login,
    authoredAt: row.authored_at,
    additions: row.additions,
    deletions: row.deletions,
    filesChanged: row.files_changed,
  }));
}
