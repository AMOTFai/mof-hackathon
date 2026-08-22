import Link from "next/link";
import { requireAlumnus } from "@/lib/auth/guards";
import { RoleFrame } from "@/components/auth/role-frame";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { searchAlumni, viewAlumniProfile } from "@/lib/talent/queries";
import { listAlumniPosts, listIntroRequests } from "@/lib/alumni/queries";
import { DirectoryList, IntroRequestForm, IntroRequestsList, PostsBoard } from "@/components/alumni/alumni-sections";

export default async function AlumniDirectoryPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const access = await requireAlumnus();
  const supabase = await createClient();

  if (view) {
    const detail = await viewAlumniProfile(supabase, view);
    return (
      <RoleFrame title="Alum" roleLabel="Alumni" eventRoles={access.eventRoles}>
        <Link href="/alumni" className="text-sm text-primary underline">
          ← Back to directory
        </Link>
        {detail ? (
          <FadeUp>
            <div className="flex flex-col gap-3">
              <Panel variant="glow" data-testid="alumni-detail">
                <h2 className="font-display text-lg font-semibold">{detail.profile.fullName ?? "Alum"}</h2>
                {detail.headline ? <p className="text-sm text-muted-foreground">{detail.headline}</p> : null}
                {detail.openTo.length > 0 ? <p className="text-sm">Open to: {detail.openTo.join(", ")}</p> : null}
                {detail.profile.university ? (
                  <p className="text-sm">
                    {detail.profile.university}
                    {detail.profile.course ? ` · ${detail.profile.course}` : ""}
                    {detail.profile.gradYear ? ` · ${detail.profile.gradYear}` : ""}
                  </p>
                ) : null}
                {detail.profile.bio ? <p className="text-sm">{detail.profile.bio}</p> : null}
                {detail.profile.skills.length > 0 ? <p className="text-sm">Skills: {detail.profile.skills.join(", ")}</p> : null}
                {detail.profile.githubUsername ? <p className="text-sm">GitHub: @{detail.profile.githubUsername}</p> : null}
              </Panel>
              {detail.userId !== access.user.id ? <IntroRequestForm targetId={detail.userId} /> : null}
            </div>
          </FadeUp>
        ) : (
          <Panel className="text-sm text-muted-foreground">Profile not found or no longer consented.</Panel>
        )}
      </RoleFrame>
    );
  }

  const [candidates, posts, intros] = await Promise.all([
    searchAlumni(supabase),
    listAlumniPosts(supabase),
    listIntroRequests(supabase, access.user.id),
  ]);

  return (
    <RoleFrame title="Alumni directory" roleLabel="Alumni" eventRoles={access.eventRoles}>
      <div className="flex flex-col gap-10">
        <FadeUp>
          <div>
            <h2 className="mb-3 text-xs uppercase tracking-eyebrow text-primary">Directory</h2>
            <DirectoryList candidates={candidates} />
          </div>
        </FadeUp>
        <FadeUp delay={0.05}>
          <div>
            <h2 className="mb-3 text-xs uppercase tracking-eyebrow text-primary">Board</h2>
            <PostsBoard posts={posts} currentUserId={access.user.id} />
          </div>
        </FadeUp>
        <FadeUp delay={0.1}>
          <div>
            <h2 className="mb-3 text-xs uppercase tracking-eyebrow text-primary">Intro requests</h2>
            <IntroRequestsList requests={intros} currentUserId={access.user.id} />
          </div>
        </FadeUp>
      </div>
    </RoleFrame>
  );
}
