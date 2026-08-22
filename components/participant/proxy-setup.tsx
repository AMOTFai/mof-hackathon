"use client";

import { useActionState, useState } from "react";
import { rotateProxyToken, type ActionResult } from "@/app/(participant)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { PROVIDERS } from "@/lib/proxy/providers";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted px-3 py-1.5 font-mono text-xs">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function ProxySetup({
  teamId,
  proxyToken,
  appUrl,
  isCaptain,
}: {
  teamId: string;
  proxyToken: string;
  appUrl: string;
  isCaptain: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(rotateProxyToken, null);

  return (
    <div className="flex flex-col gap-4 glass p-4" data-testid="proxy-setup">
      <div>
        <h3 className="font-medium">AI call logging (optional)</h3>
        <p className="text-sm text-muted-foreground">
          Point your SDK&apos;s <code className="font-mono text-xs">base_url</code> at us and use your own API key as
          usual — we forward every call unmodified and log only metadata (provider, model, token counts, latency).
          Never prompts or responses.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-eyebrow text-muted-foreground">Team token</span>
        <CopyField value={proxyToken} />
      </div>

      <div className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => {
          const hint = provider.setupHint(appUrl);
          return (
            <div key={provider.id} className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-eyebrow text-muted-foreground">{provider.label}</span>
              <CopyField value={`${hint.proxyBaseUrl}?team=${proxyToken}`} />
              <p className="text-xs text-muted-foreground">{hint.note}</p>
            </div>
          );
        })}
      </div>

      {isCaptain ? (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="teamId" value={teamId} />
          <Button type="submit" size="sm" variant="destructive" disabled={pending} data-testid="rotate-proxy-token">
            {pending ? "Rotating…" : "Rotate token"}
          </Button>
          <p className="text-xs text-muted-foreground">Invalidates the token above immediately — update your SDK config after rotating.</p>
          <FormStatus state={state} />
        </form>
      ) : null}
    </div>
  );
}
