import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { TalentConsentForm, ErasureSection } from "@/components/participant/talent-form";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { getOwnErasureRequests, getOwnTalentProfile } from "@/lib/talent/queries";

export default async function TalentPage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const [profile, erasureRequests] = await Promise.all([
    getOwnTalentProfile(supabase, access.user.id),
    getOwnErasureRequests(supabase, access.user.id),
  ]);

  return (
    <RoleFrame title="Talent & privacy" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      <FadeUp>
        <div className="flex flex-col gap-6">
          <TalentConsentForm profile={profile} />
          <ErasureSection requests={erasureRequests} />
        </div>
      </FadeUp>
    </RoleFrame>
  );
}
