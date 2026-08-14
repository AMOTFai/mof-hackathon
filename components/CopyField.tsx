"use client";

import { useState } from "react";

// A read-only monospace field with a copy button. Used for proxy setup snippets.
export default function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <p className="label mb-1">{label}</p>}
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-200">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              /* clipboard blocked — user can select manually */
            }
          }}
          className="btn-ghost shrink-0 px-3 py-2 text-xs"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
