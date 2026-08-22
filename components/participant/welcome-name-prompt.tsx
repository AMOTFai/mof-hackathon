"use client";

import { useActionState } from "react";
import { motion } from "framer-motion";
import { updateProfile, type ActionResult } from "@/app/(participant)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { FormStatus } from "@/components/ui/form-status";

// First-run onboarding step: this is the ONLY thing the dashboard shows
// until a name is set. Reuses updateProfile but preserves every other
// profile field via hidden inputs so a partially-filled profile (edge case,
// not the common path) is never clobbered by this minimal form.
export function WelcomeNamePrompt({
  preserve,
}: {
  preserve: {
    university: string | null;
    course: string | null;
    grad_year: number | null;
    bio: string | null;
    skills: string;
    github_username: string | null;
    timezone: string;
  };
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateProfile, null);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Panel variant="glow" className="flex flex-col gap-3">
        <div>
          <p className="text-xs uppercase tracking-eyebrow text-primary">Welcome</p>
          <h2 className="font-display text-xl font-semibold">What should we call you?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your name is how teammates and judges will see you across the platform.
          </p>
        </div>
        <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="university" value={preserve.university ?? ""} />
          <input type="hidden" name="course" value={preserve.course ?? ""} />
          <input type="hidden" name="grad_year" value={preserve.grad_year ?? ""} />
          <input type="hidden" name="bio" value={preserve.bio ?? ""} />
          <input type="hidden" name="skills" value={preserve.skills} />
          <input type="hidden" name="github_username" value={preserve.github_username ?? ""} />
          <input type="hidden" name="timezone" value={preserve.timezone} />
          <Input
            name="full_name"
            required
            maxLength={120}
            placeholder="Your name"
            autoFocus
            className="sm:flex-1"
            data-testid="welcome-name-input"
          />
          <Button type="submit" variant="mission" disabled={pending} data-testid="welcome-name-submit">
            {pending ? "Saving…" : "Continue"}
          </Button>
        </form>
        <FormStatus state={state} />
      </Panel>
    </motion.div>
  );
}
