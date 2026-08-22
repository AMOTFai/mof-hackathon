import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/proxy/providers";
import { trackUsage } from "@/lib/proxy/usage";
import { buildResponseHeaders, buildUpstreamHeaders } from "@/lib/proxy/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The API proxy. Teams point their AI SDK's `base_url` here; we forward the
 * call UNMODIFIED using the team's own upstream API key and log metadata,
 * producing a third activity signal next to commits and check-ins.
 *
 * CLAUDE.md is explicit: "Keep it dumb: no rewriting, no blocking, no rate
 * limiting" and "api_calls never stores prompt or response bodies." This
 * route has zero provider-specific logic — that lives in lib/proxy/providers.ts
 * — and logging failures must never affect the proxied response (fail open).
 */

function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

async function logCall(input: {
  teamId: string;
  tenantId: string | null;
  provider: string;
  model: string | null;
  requestTokens: number | null;
  responseTokens: number | null;
  latencyMs: number;
  statusCode: number;
}) {
  try {
    const service = createServiceClient();
    await service.from("api_calls").insert({
      team_id: input.teamId,
      tenant_id: input.tenantId,
      provider: input.provider,
      model: input.model,
      request_tokens: input.requestTokens,
      response_tokens: input.responseTokens,
      latency_ms: input.latencyMs,
      status_code: input.statusCode,
    });
  } catch {
    // Logging must never break the proxied call — swallow and move on.
  }
}

async function handle(req: Request, params: { provider: string; path: string[] }): Promise<Response> {
  const adapter = getAdapter(params.provider);
  if (!adapter) return err(404, `Unknown provider '${params.provider}'.`);

  const url = new URL(req.url);
  const token = url.searchParams.get("team") || req.headers.get("x-motf-team");
  if (!token) return err(401, "Missing team token — add ?team=<token> or an x-motf-team header.");

  // No Supabase Auth session exists for an external SDK call, so team lookup
  // by proxy token is one of the sanctioned service-role paths (this route is
  // effectively a webhook receiver, per CLAUDE.md's "webhooks, cron, bootstrap").
  const service = createServiceClient();
  const { data: team } = await service.from("teams").select("id, tenant_id").eq("proxy_token", token).maybeSingle();
  if (!team) return err(401, "Unknown team token.");

  const fwd = new URLSearchParams(url.searchParams);
  fwd.delete("team");
  const qs = fwd.toString();
  const endpoint = params.path.join("/");
  const upstreamUrl = `${adapter.host}/${endpoint}${qs ? `?${qs}` : ""}`;

  const headers = buildUpstreamHeaders(req.headers, adapter);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const bodyBuf = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;
  let model: string | null = null;
  if (bodyBuf?.length) {
    try {
      model = adapter.extractModel(JSON.parse(bodyBuf.toString("utf8")));
    } catch {
      // Non-JSON body (e.g. audio/multipart) — no model to record.
    }
  }

  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { method: req.method, headers, body: bodyBuf, redirect: "manual" });
  } catch (error) {
    await logCall({
      teamId: team.id,
      tenantId: team.tenant_id,
      provider: adapter.id,
      model,
      requestTokens: null,
      responseTokens: null,
      latencyMs: Date.now() - startedAt,
      statusCode: 0,
    });
    return err(502, `Upstream request to ${adapter.label} failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // undici already decoded the body stream, so the encoding/length headers
  // upstream sent no longer describe the bytes we pass on — drop them.
  const resHeaders = buildResponseHeaders(upstream.headers);

  const { response, usage } = trackUsage(adapter, upstream);
  const finalResponse = new Response(response.body, { status: upstream.status, headers: resHeaders });

  // Log once usage settles, scheduled via `after()` so the serverless runtime
  // keeps this function alive to finish it — a bare floating promise here can
  // get killed the instant the response stream closes and the platform tears
  // the invocation down. Never delays bytes reaching the caller either way.
  after(async () => {
    const tokens = await usage;
    await logCall({
      teamId: team.id,
      tenantId: team.tenant_id,
      provider: adapter.id,
      model,
      requestTokens: tokens.requestTokens,
      responseTokens: tokens.responseTokens,
      latencyMs: Date.now() - startedAt,
      statusCode: upstream.status,
    });
  });

  return finalResponse;
}

type RouteParams = { params: Promise<{ provider: string; path: string[] }> };

export async function POST(req: Request, ctx: RouteParams) {
  return handle(req, await ctx.params);
}
export async function GET(req: Request, ctx: RouteParams) {
  return handle(req, await ctx.params);
}
