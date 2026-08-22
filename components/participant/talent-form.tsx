"use client";

import { useActionState } from "react";
import { requestErasure, upsertTalentProfile, withdrawConsent } from "@/app/(participant)/dashboard/talent-actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";
import { TALENT_VISIBILITY } from "@/lib/enums";
import type { OwnTalentProfile } from "@/lib/talent/queries";
import { isConsentActive } from "@/lib/talent/queries";
import type { ErasureRequestRow } from "@/lib/talent/queries";
import { CONSENT_SCOPE_KEYS } from "@/lib/validation/talent";

export function TalentConsentForm({ profile }: { profile: OwnTalentProfile | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(upsertTalentProfile, null);
  const active = isConsentActive(profile);

  return (
    <div className="flex flex-col gap-4 glass p-4" data-testid="talent-consent">
      <div>
        <h3 className="font-display font-medium">Talent profile & consent</h3>
        <p className="text-sm text-muted-foreground">
          Off by default. Grant recruiters access on your terms — a scope, a visibility level, an expiry you set.
          Nothing here is visible to anyone until you say so, and it stops being visible the moment consent expires or
          you withdraw it.
        </p>
      </div>

      {profile ? (
        <p className="text-sm" data-testid="consent-status">
          {active ? (
            <span className="text-success">
              Active — visible as &ldquo;{profile.visibility}&rdquo;, expires {formatWhen(profile.consentExpiresAt!)}.
            </span>
          ) : (
            <span className="text-muted-foreground">Not currently visible to anyone.</span>
          )}
        </p>
      ) : null}

      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visibility">Visibility</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={profile?.visibility ?? "private"}
            className="h-9 rounded-md border border-input bg-panel px-2 text-sm"
            data-testid="visibility-select"
          >
            {TALENT_VISIBILITY.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="headline">Headline</Label>
          <Input id="headline" name="headline" maxLength={200} defaultValue={profile?.headline ?? ""} placeholder="Full-stack builder, open to internships" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openTo">Open to (comma-separated)</Label>
          <Input id="openTo" name="openTo" maxLength={500} defaultValue={(profile?.openTo ?? []).join(", ")} placeholder="internship, new grad" />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">What you&apos;re consenting to share</p>
          {CONSENT_SCOPE_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`scope_${key}`} defaultChecked={profile?.consentScopes?.[key] ?? key === "profile"} />
              {key}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 sm:w-48">
          <Label htmlFor="durationDays">Expires after (days)</Label>
          <Input id="durationDays" name="durationDays" type="number" min={1} max={365} defaultValue={90} />
        </div>
        <Button type="submit" variant="mission" disabled={pending} data-testid="save-consent">
          {pending ? "Saving…" : active ? "Renew / update consent" : "Grant consent"}
        </Button>
        <FormStatus state={state} />
      </form>

      {active ? <WithdrawButton /> : null}
    </div>
  );
}

function WithdrawButton() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(withdrawConsent, null);
  return (
    <form action={action}>
      <Button type="submit" variant="destructive" size="sm" disabled={pending} data-testid="withdraw-consent">
        {pending ? "Withdrawing…" : "Withdraw consent now"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function ErasureSection({ requests }: { requests: ErasureRequestRow[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(requestErasure, null);
  return (
    <div className="flex flex-col gap-3 glass p-4" data-testid="erasure-section">
      <h3 className="font-display font-medium">Delete my data</h3>
      <p className="text-sm text-muted-foreground">
        Deletes your talent profile and consent trail. The wider option also anonymizes your name, school, bio,
        skills, and GitHub username on your profile. An admin processes this — it&apos;s logged and cannot be undone
        once completed. It does not delete your account or your team&apos;s history.
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {requests.map((r) => (
          <li key={r.id} data-testid={`erasure-${r.id}`}>
            {r.scope} requested {formatWhen(r.requestedAt)} — {r.completedAt ? `completed ${formatWhen(r.completedAt)}` : "pending"}
          </li>
        ))}
      </ul>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="erasure-scope">Scope</Label>
          <select id="erasure-scope" name="scope" defaultValue="talent_only" className="h-9 rounded-md border border-input bg-panel px-2 text-sm">
            <option value="talent_only">Talent profile only</option>
            <option value="full">Talent profile + anonymize my name, bio, school, GitHub</option>
          </select>
        </div>
        <Button type="submit" variant="destructive" disabled={pending} data-testid="request-erasure">
          {pending ? "Requesting…" : "Request erasure"}
        </Button>
      </form>
      <FormStatus state={state} />
    </div>
  );
}
