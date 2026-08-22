import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { ProfileForm } from "@/components/participant/profile-form";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email, full_name, university, course, grad_year, bio, skills, github_username, timezone")
    .eq("id", access.user.id)
    .single();

  if (error || !profile) {
    throw error ?? new Error("Profile not found");
  }

  return (
    <RoleFrame title="Your profile" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      <FadeUp>
        <Panel>
          <p className="mb-4 text-sm text-muted-foreground">Visible to teammates, assigned judges, and event staff.</p>
          <ProfileForm profile={profile} />
        </Panel>
      </FadeUp>
    </RoleFrame>
  );
}
