import { formatWhen } from "@/lib/datetime";
import { isHttpUrl } from "@/lib/url";
import { commitWebUrl, parseRepo } from "@/lib/github/parse";
import { DeleteCheckInButton } from "@/components/checkins/delete-checkin-button";
import { Panel } from "@/components/ui/panel";
import type { ProcessSummary, TimelineEvent } from "@/lib/timeline/merge";
import type { ApiCallEntry } from "@/lib/proxy/queries";

export function ProcessSummaryBar({ summary }: { summary: ProcessSummary }) {
  const stats = [
    { label: "Check-ins", value: summary.totalCheckIns },
    { label: "Commits", value: summary.totalCommits },
    { label: "AI calls", value: summary.totalApiCalls },
    { label: "Active days", value: summary.activeDays },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="process-summary">
      {stats.map((stat) => (
        <div key={stat.label} className="glass p-3">
          <dt className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">{stat.label}</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-primary">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CommitDiffStat({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  if (additions === null && deletions === null) return null;
  return (
    <span className="font-mono text-xs">
      {additions !== null ? <span className="text-success">+{additions}</span> : null}{" "}
      {deletions !== null ? <span className="text-destructive">-{deletions}</span> : null}
    </span>
  );
}

export function UnifiedTimeline({
  events,
  repoUrl,
  currentUserId,
}: {
  events: TimelineEvent[];
  repoUrl: string | null;
  currentUserId?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing yet. Log a check-in or sync your repo to start the build story.
      </p>
    );
  }
  const ref = parseRepo(repoUrl);

  return (
    <ol className="flex flex-col gap-3" data-testid="unified-timeline">
      {events.map((event) => {
        if (event.kind === "api-call") {
          return <ApiCallRow key={event.id} call={event.data} />;
        }
        if (event.kind === "check-in") {
          const c = event.data;
          return (
            <li key={event.id}>
              <Panel className="border-l-2 border-l-glow">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">
                    Check-in · {c.authorName ?? "Teammate"} · {formatWhen(c.createdAt)}
                    {c.milestoneLabel ? ` · ${c.milestoneLabel}` : ""}
                  </p>
                  {currentUserId && c.authorId === currentUserId ? <DeleteCheckInButton checkInId={c.id} /> : null}
                </div>
                <p className="mt-1 text-sm">{c.body}</p>
                {isHttpUrl(c.linkUrl) ? (
                  <a href={c.linkUrl} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-primary underline">
                    {c.linkUrl}
                  </a>
                ) : null}
                {c.blockers ? <p className="mt-1 text-sm text-destructive">Blocked: {c.blockers}</p> : null}
              </Panel>
            </li>
          );
        }

        const commit = event.data;
        return (
          <li key={event.id}>
            <Panel className="border-l-2 border-l-primary">
              <p className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">
                Commit · {commit.authorLogin ?? "unknown"} · {formatWhen(commit.authoredAt)}
              </p>
              <p className="mt-1 text-sm">{commit.message ?? "(no message)"}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                {ref ? (
                  <a
                    href={commitWebUrl(ref, commit.sha)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-primary underline"
                  >
                    {commit.sha.slice(0, 7)}
                  </a>
                ) : (
                  <span className="font-mono text-xs">{commit.sha.slice(0, 7)}</span>
                )}
                <CommitDiffStat additions={commit.additions} deletions={commit.deletions} />
                {commit.filesChanged !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {commit.filesChanged} file{commit.filesChanged === 1 ? "" : "s"}
                  </span>
                ) : null}
              </p>
            </Panel>
          </li>
        );
      })}
    </ol>
  );
}

function ApiCallRow({ call }: { call: ApiCallEntry }) {
  const ok = call.statusCode !== null && call.statusCode >= 200 && call.statusCode < 300;
  const tokens =
    call.requestTokens !== null || call.responseTokens !== null
      ? `${call.requestTokens ?? "?"} in / ${call.responseTokens ?? "?"} out`
      : null;
  return (
    <li>
      <Panel className="border-l-2 border-l-warning">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">
          AI call · {call.provider} · {formatWhen(call.createdAt)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>{call.model ?? "unknown model"}</span>
          <span className={ok ? "text-success" : "text-destructive"}>{call.statusCode ?? "—"}</span>
          {call.latencyMs !== null ? <span className="text-xs text-muted-foreground">{call.latencyMs}ms</span> : null}
          {tokens ? <span className="text-xs text-muted-foreground">{tokens} tokens</span> : null}
        </p>
      </Panel>
    </li>
  );
}
