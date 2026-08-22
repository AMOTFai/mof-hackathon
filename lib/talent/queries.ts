import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TalentVisibility } from "@/lib/enums";

type Client = SupabaseClient<Database>;

export type OwnTalentProfile = {
  visibility: TalentVisibility;
  headline: string | null;
  openTo: string[];
  consentGivenAt: string | null;
  consentExpiresAt: string | null;
  consentScopes: Record<string, boolean> | null;
};

export async function getOwnTalentProfile(supabase: Client, userId: string): Promise<OwnTalentProfile | null> {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("visibility, headline, open_to, consent_given_at, consent_expires_at, consent_scopes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    visibility: data.visibility as TalentVisibility,
    headline: data.headline,
    openTo: data.open_to,
    consentGivenAt: data.consent_given_at,
    consentExpiresAt: data.consent_expires_at,
    consentScopes: (data.consent_scopes as Record<string, boolean> | null) ?? null,
  };
}

export function isConsentActive(profile: OwnTalentProfile | null, now = new Date()): boolean {
  if (!profile || !profile.consentExpiresAt) return false;
  return new Date(profile.consentExpiresAt).getTime() > now.getTime();
}

/** Lightweight, unlogged browse listing — only what RLS already exposes without the RPC. */
export type TalentSearchRow = { userId: string; headline: string | null; openTo: string[] };

export async function searchTalent(supabase: Client): Promise<TalentSearchRow[]> {
  const { data, error } = await supabase.from("talent_profiles").select("user_id, headline, open_to").eq("visibility", "recruiters");
  if (error) throw error;
  return (data ?? []).map((r) => ({ userId: r.user_id, headline: r.headline, openTo: r.open_to }));
}

export type TalentDetail = {
  userId: string;
  headline: string | null;
  openTo: string[];
  visibility: string;
  consentScopes: Record<string, boolean> | null;
  profile: {
    fullName: string | null;
    university: string | null;
    course: string | null;
    gradYear: number | null;
    bio: string | null;
    skills: string[];
    githubUsername: string | null;
    avatarUrl: string | null;
  };
};

/**
 * Full profile detail — ALWAYS via the view_talent_profile RPC, never a raw
 * `.from("talent_profiles")` select. RLS also happens to permit a direct
 * select for recruiters ("recruiters read consented"), but that path skips
 * the RPC's `recruiter_access_log` insert entirely — the schema's own
 * comment calls the RPC "the non-bypassable access log," and that's only
 * true if every consumer actually goes through it.
 */
export async function viewTalentProfile(supabase: Client, userId: string): Promise<TalentDetail | null> {
  const { data, error } = await supabase.rpc("view_talent_profile", { p_user_id: userId });
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    user_id: string;
    headline: string | null;
    open_to: string[];
    visibility: string;
    consent_scopes: Record<string, boolean> | null;
    profile: {
      full_name: string | null;
      university: string | null;
      course: string | null;
      grad_year: number | null;
      bio: string | null;
      skills: string[];
      github_username: string | null;
      avatar_url: string | null;
    };
  };
  return {
    userId: row.user_id,
    headline: row.headline,
    openTo: row.open_to,
    visibility: row.visibility,
    consentScopes: row.consent_scopes,
    profile: {
      fullName: row.profile.full_name,
      university: row.profile.university,
      course: row.profile.course,
      gradYear: row.profile.grad_year,
      bio: row.profile.bio,
      skills: row.profile.skills,
      githubUsername: row.profile.github_username,
      avatarUrl: row.profile.avatar_url,
    },
  };
}

/**
 * The alumni directory browse list. RLS ("alumni read alumni-visible")
 * already scopes this correctly to visibility in (alumni, recruiters) with
 * unexpired consent — no RPC needed, unlike recruiter search: the schema has
 * no `alumni_access_log` table, so peer alumni browsing was never designed
 * to be logged the way employer/recruiter viewing is.
 */
export async function searchAlumni(supabase: Client): Promise<TalentSearchRow[]> {
  const { data, error } = await supabase.from("talent_profiles").select("user_id, headline, open_to").in("visibility", ["alumni", "recruiters"]);
  if (error) throw error;
  return (data ?? []).map((r) => ({ userId: r.user_id, headline: r.headline, openTo: r.open_to }));
}

export type AlumniDetail = {
  userId: string;
  headline: string | null;
  openTo: string[];
  profile: {
    fullName: string | null;
    university: string | null;
    course: string | null;
    gradYear: number | null;
    bio: string | null;
    skills: string[];
    githubUsername: string | null;
  };
};

/** Peer detail view, via view_alumni_profile — unlogged (no alumni_access_log table exists), unlike recruiter detail views. */
export async function viewAlumniProfile(supabase: Client, userId: string): Promise<AlumniDetail | null> {
  const { data, error } = await supabase.rpc("view_alumni_profile", { p_user_id: userId });
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    user_id: string;
    headline: string | null;
    open_to: string[];
    profile: {
      full_name: string | null;
      university: string | null;
      course: string | null;
      grad_year: number | null;
      bio: string | null;
      skills: string[];
      github_username: string | null;
    };
  };
  return {
    userId: row.user_id,
    headline: row.headline,
    openTo: row.open_to,
    profile: {
      fullName: row.profile.full_name,
      university: row.profile.university,
      course: row.profile.course,
      gradYear: row.profile.grad_year,
      bio: row.profile.bio,
      skills: row.profile.skills,
      githubUsername: row.profile.github_username,
    },
  };
}

export type ErasureRequestRow = { id: string; requestedAt: string; completedAt: string | null; scope: string };

export async function getOwnErasureRequests(supabase: Client, userId: string): Promise<ErasureRequestRow[]> {
  const { data, error } = await supabase
    .from("erasure_requests")
    .select("id, requested_at, completed_at, scope")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, requestedAt: r.requested_at, completedAt: r.completed_at, scope: r.scope }));
}
