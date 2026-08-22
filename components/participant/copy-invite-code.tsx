"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyInviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex items-center gap-3">
      <p className="font-mono text-3xl tracking-eyebrow text-primary" data-testid="invite-code-value">
        {code}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onCopy}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
