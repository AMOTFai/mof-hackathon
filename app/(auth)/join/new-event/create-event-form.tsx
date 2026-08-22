"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { createEvent } from "./actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { FormStatus } from "@/components/ui/form-status";

export function CreateEventForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createEvent, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/organizer"), 1200);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  if (state?.ok) {
    return (
      <Panel variant="glow" className="flex flex-col items-center gap-3 py-10 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary"
        >
          <Check className="h-6 w-6" />
        </motion.div>
        <p className="font-display text-lg font-semibold">Event created</p>
        <p className="text-sm text-muted-foreground">Taking you to the organizer console…</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <form action={action} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Event name</Label>
            <Input id="name" name="name" required maxLength={120} data-testid="event-name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              required
              maxLength={60}
              pattern="[a-z0-9-]+"
              placeholder="my-hackathon-2026"
              className="font-mono"
              data-testid="event-slug"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tagline">Tagline</Label>
            <Input id="tagline" name="tagline" maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="venue">Venue</Label>
            <Input id="venue" name="venue" maxLength={200} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="starts_at">Starts</Label>
            <Input id="starts_at" name="starts_at" type="datetime-local" required data-testid="event-starts" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="submission_deadline">Submission deadline</Label>
            <Input
              id="submission_deadline"
              name="submission_deadline"
              type="datetime-local"
              required
              data-testid="event-deadline"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ends_at">Ends</Label>
            <Input id="ends_at" name="ends_at" type="datetime-local" required data-testid="event-ends" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label htmlFor="max_team_size">Max team size</Label>
          <Input id="max_team_size" name="max_team_size" type="number" min={1} max={20} defaultValue={5} />
        </div>
        <Button type="submit" variant="mission" disabled={pending} data-testid="create-event-submit">
          {pending ? "Creating…" : "Create event"}
        </Button>
        <AnimatePresence>
          {state && !state.ok ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FormStatus state={state} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>
    </Panel>
  );
}
