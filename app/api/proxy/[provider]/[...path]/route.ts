import { prisma } from "@/lib/db";
import { getAdapter } from "@/lib/providers";

// Prisma needs the Node runtime; every call is dynamic (never cached).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Headers that describe THIS hop and must not be forwarded upstream/downstream.
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding", // let undici negotiate + auto-decompress
]);

// Cap stored content so an opted-in team can't bloat the SQLite DB with one call.
const CONTENT_CAP = 100_000;

function err(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

async function logCall(input: {
  teamId: string;
  provider: string;
  endpoint: string;
  model: string | null;
  requestSize: number;
  responseSize: number;
  status: number;
  requestBody: string | null;
  responseBody: string | null;
}) {
  try {
    await prisma.apiCall.create({ data: input });
  } catch {
    // Logging must never break the proxied call — swallow and move on.
  }
}

async function handle(req: Request, params: { provider: string; path: string[] }) {
  const adapter = getAdapter(params.provider);
  if (!adapter) return err(404, `Unknown provider '${params.provider}'.`);

  const url = new URL(req.url);
  const token = url.searchParams.get("team") || req.headers.get("x-motf-team");
  if (!token) return err(401, "Missing team token — add ?team=<token> or an x-motf-team header.");
  const team = await prisma.team.findUnique({ where: { proxyToken: token } });
  if (!team) return err(401, "Unknown team token.");

  // Upstream URL = provider origin + captured path + forwarded query (minus our token).
  const fwd = new URLSearchParams(url.searchParams);
  fwd.delete("team");
  const qs = fwd.toString();
  const endpoint = params.path.join("/");
  const upstreamUrl = `${adapter.host}/${endpoint}${qs ? `?${qs}` : ""}`;

  // Pass the caller's headers through verbatim (their own API key rides along),
  // minus hop-by-hop and our routing header.
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (!HOP_BY_HOP.has(lk) && lk !== "x-motf-team") headers.set(k, v);
  });
  if (adapter.defaultHeaders) {
    for (const [k, v] of Object.entries(adapter.defaultHeaders)) if (!headers.has(k)) headers.set(k, v);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const bodyBuf = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;
  const requestSize = bodyBuf?.length ?? 0;
  let model: string | null = null;
  if (bodyBuf?.length) {
    try {
      model = adapter.extractModel(JSON.parse(bodyBuf.toString("utf8")));
    } catch {
      // non-JSON body (e.g. audio) — no model to record
    }
  }
  const storeReqBody = team.logApiContent && bodyBuf ? bodyBuf.toString("utf8").slice(0, CONTENT_CAP) : null;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { method: req.method, headers, body: bodyBuf, redirect: "manual" });
  } catch (e: unknown) {
    await logCall({ teamId: team.id, provider: adapter.id, endpoint, model, requestSize, responseSize: 0, status: 0, requestBody: storeReqBody, responseBody: null });
    return err(502, `Upstream request to ${adapter.label} failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // undici has already decompressed the body stream, so the encoding/length
  // headers upstream sent no longer describe the bytes we pass on. Drop them.
  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");
  resHeaders.delete("transfer-encoding");

  // Opt-in content logging: buffer the response so we can store it.
  if (team.logApiContent) {
    const respBuf = Buffer.from(await upstream.arrayBuffer());
    await logCall({
      teamId: team.id, provider: adapter.id, endpoint, model,
      requestSize, responseSize: respBuf.length, status: upstream.status,
      requestBody: storeReqBody, responseBody: respBuf.toString("utf8").slice(0, CONTENT_CAP),
    });
    return new Response(respBuf, { status: upstream.status, headers: resHeaders });
  }

  // Default: stream straight through, counting bytes, and log once the stream
  // finishes — keeps token streaming intact and the proxy invisible to the SDK.
  let count = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      count += chunk.byteLength;
      ctrl.enqueue(chunk);
    },
    async flush() {
      await logCall({ teamId: team.id, provider: adapter.id, endpoint, model, requestSize, responseSize: count, status: upstream.status, requestBody: null, responseBody: null });
    },
  });
  const body = upstream.body ?? new ReadableStream({ start: (c) => c.close() });
  return new Response(body.pipeThrough(counter), { status: upstream.status, headers: resHeaders });
}

export function POST(req: Request, { params }: { params: { provider: string; path: string[] } }) {
  return handle(req, params);
}
export function GET(req: Request, { params }: { params: { provider: string; path: string[] } }) {
  return handle(req, params);
}
