import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type ApiCallEntry = {
  id: string;
  provider: string;
  model: string | null;
  requestTokens: number | null;
  responseTokens: number | null;
  latencyMs: number | null;
  statusCode: number | null;
  createdAt: string;
};

export async function listApiCalls(supabase: Client, teamId: string, limit = 100): Promise<ApiCallEntry[]> {
  const { data, error } = await supabase
    .from("api_calls")
    .select("id, provider, model, request_tokens, response_tokens, latency_ms, status_code, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    model: row.model,
    requestTokens: row.request_tokens,
    responseTokens: row.response_tokens,
    latencyMs: row.latency_ms,
    statusCode: row.status_code,
    createdAt: row.created_at,
  }));
}
