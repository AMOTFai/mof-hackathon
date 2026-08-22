import { cn } from "@/lib/utils";

// Deterministic hue from an id so the same person always gets the same
// initials-avatar color across sessions/devices, without storing anything.
function hueFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  imageUrl,
  id,
  size = "md",
  className,
}: {
  name: string | null;
  imageUrl?: string | null;
  id: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs (arbitrary hosts), no next/image remotePatterns configured
      <img
        src={imageUrl}
        alt=""
        className={cn(dims, "shrink-0 rounded-full border border-panel-border object-cover", className)}
      />
    );
  }
  const hue = hueFromId(id);
  return (
    <div
      aria-hidden="true"
      className={cn(dims, "flex shrink-0 items-center justify-center rounded-full border border-panel-border font-mono font-medium text-foreground", className)}
      style={{ background: `hsl(${hue} 45% 18%)`, color: `hsl(${hue} 85% 75%)` }}
    >
      {initials(name)}
    </div>
  );
}
