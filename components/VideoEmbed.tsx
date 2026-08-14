// Inline player for YouTube / Loom links; falls back to a link for anything else.
function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host === "loom.com") {
      const m = u.pathname.match(/\/share\/([a-zA-Z0-9]+)/);
      if (m) return `https://www.loom.com/embed/${m[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

export default function VideoEmbed({ url }: { url: string }) {
  const embed = embedUrl(url);
  if (!embed) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="btn-ghost w-full">Open video ↗</a>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
      <div className="relative aspect-video">
        <iframe src={embed} className="absolute inset-0 h-full w-full" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Team video" />
      </div>
    </div>
  );
}
