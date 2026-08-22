"use client";

import { useActionState, type ReactNode } from "react";
import { updateProfile, type ActionResult } from "@/app/(participant)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatSkills } from "@/lib/teams/membership";
import { FormStatus } from "@/components/ui/form-status";

export { FormStatus };

type ProfileFields = {
  email: string;
  full_name: string | null;
  university: string | null;
  course: string | null;
  grad_year: number | null;
  bio: string | null;
  skills: string[];
  github_username: string | null;
  timezone: string;
};

export function ProfileForm({ profile }: { profile: ProfileFields }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateProfile, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" value={profile.email} disabled />
      </Field>
      <Field label="Full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} maxLength={120} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="University" htmlFor="university">
          <Input id="university" name="university" defaultValue={profile.university ?? ""} maxLength={160} />
        </Field>
        <Field label="Course" htmlFor="course">
          <Input id="course" name="course" defaultValue={profile.course ?? ""} maxLength={160} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Graduation year" htmlFor="grad_year">
          <Input
            id="grad_year"
            name="grad_year"
            inputMode="numeric"
            placeholder="2027"
            defaultValue={profile.grad_year ?? ""}
          />
        </Field>
        <Field label="Timezone" htmlFor="timezone">
          <Input id="timezone" name="timezone" defaultValue={profile.timezone} maxLength={80} />
        </Field>
      </div>
      <Field label="GitHub username" htmlFor="github_username">
        <Input
          id="github_username"
          name="github_username"
          defaultValue={profile.github_username ?? ""}
          maxLength={80}
        />
      </Field>
      <Field label="Skills (comma-separated)" htmlFor="skills">
        <Input id="skills" name="skills" defaultValue={formatSkills(profile.skills)} placeholder="TypeScript, product, ML" />
      </Field>
      <Field label="Bio" htmlFor="bio">
        <Textarea id="bio" name="bio" defaultValue={profile.bio ?? ""} maxLength={1000} />
      </Field>
      <Button type="submit" variant="mission" disabled={pending} data-testid="save-profile">
        {pending ? "Saving…" : "Save profile"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
