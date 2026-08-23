"use client";

import { useActionState } from "react";
import { motion } from "framer-motion";
import { updateProfile, type ActionResult } from "@/app/(participant)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { FormStatus } from "@/components/ui/form-status";

// Judge equivalent of the participant WelcomeNamePrompt — this is the ONLY
// thing the judge dashboard shows until a name is set. Preserves the rest
// of the profile via hidden inputs, same pattern as the participant version.
export function JudgeWelcomePrompt({
  preserve,
}: {
  preserve: {
    university: string | null;
    course: string | null;
    grad_year: number | null;
    skills: string;
    github_username: string | null;
    timezone: string;
  };
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateProfile, null);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Panel variant="glow" className="flex flex-col gap-4">
        <div>
          <p className="text-xs uppercase tracking-eyebrow text-primary">Welcome</p>
          <h2 className="font-display text-xl font-semibold">Set up your profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A couple of details so teams and organizers know who&apos;s judging.
          </p>
        </div>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="university" value={preserve.university ?? ""} />
          <input type="hidden" name="course" value={preserve.course ?? ""} />
          <input type="hidden" name="grad_year" value={preserve.grad_year ?? ""} />
          <input type="hidden" name="skills" value={preserve.skills} />
          <input type="hidden" name="github_username" value={preserve.github_username ?? ""} />
          <input type="hidden" name="timezone" value={preserve.timezone} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Your name</Label>
            <Input
              id="full_name"
              name="full_name"
              required
              maxLength={120}
              placeholder="Ada Lovelace"
              autoFocus
              data-testid="judge-welcome-name-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bio">Background</Label>
            <Textarea id="bio" name="bio" maxLength={1000} placeholder="What you do, what you're evaluating for." />
          </div>
          <Button type="submit" variant="mission" disabled={pending} data-testid="judge-welcome-name-submit">
            {pending ? "Saving…" : "Continue"}
          </Button>
          <FormStatus state={state} />
        </form>
      </Panel>
    </motion.div>
  );
}
