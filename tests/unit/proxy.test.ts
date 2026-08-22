import { describe, expect, it } from "vitest";
import { getAdapter, PROVIDERS } from "@/lib/proxy/providers";
import { forEachSseJson } from "@/lib/proxy/sse";
import { trackUsage } from "@/lib/proxy/usage";
import { buildResponseHeaders, buildUpstreamHeaders } from "@/lib/proxy/headers";

describe("provider registry", () => {
  it("exposes exactly openai and anthropic", () => {
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual(["anthropic", "openai"]);
  });

  it("returns null for an unknown provider id", () => {
    expect(getAdapter("cohere")).toBeNull();
  });

  it("extracts the model from a request body for both providers", () => {
    const openai = getAdapter("openai")!;
    const anthropic = getAdapter("anthropic")!;
    expect(openai.extractModel({ model: "gpt-4o-mini", messages: [] })).toBe("gpt-4o-mini");
    expect(anthropic.extractModel({ model: "claude-haiku-4-5", messages: [] })).toBe("claude-haiku-4-5");
    expect(openai.extractModel({})).toBeNull();
    expect(openai.extractModel(null)).toBeNull();
    expect(openai.extractModel("not an object")).toBeNull();
  });

  it("setup hints point at the right proxy path and never leak a real token", () => {
    const openai = getAdapter("openai")!;
    const anthropic = getAdapter("anthropic")!;
    expect(openai.setupHint("https://motf.example").proxyBaseUrl).toBe("https://motf.example/api/proxy/openai/v1");
    expect(anthropic.setupHint("https://motf.example").proxyBaseUrl).toBe("https://motf.example/api/proxy/anthropic");
  });
});

describe("OpenAI usage extraction", () => {
  const openai = getAdapter("openai")!;

  it("reads usage from a non-streaming response", () => {
    const usage = openai.extractUsageFromJson({
      id: "chatcmpl-1",
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    });
    expect(usage).toEqual({ requestTokens: 12, responseTokens: 34 });
  });

  it("returns nulls when usage is absent", () => {
    expect(openai.extractUsageFromJson({ id: "chatcmpl-1" })).toEqual({ requestTokens: null, responseTokens: null });
    expect(openai.extractUsageFromJson(null)).toEqual({ requestTokens: null, responseTokens: null });
  });

  it("reads usage from a stream_options include_usage SSE chunk", () => {
    const usage = openai.extractUsageFromSseEvent({
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 5, completion_tokens: 9 },
    });
    expect(usage).toEqual({ requestTokens: 5, responseTokens: 9 });
  });

  it("returns nulls for a plain delta chunk with no usage", () => {
    const usage = openai.extractUsageFromSseEvent({ choices: [{ delta: { content: "hi" } }] });
    expect(usage).toEqual({ requestTokens: null, responseTokens: null });
  });
});

describe("Anthropic usage extraction", () => {
  const anthropic = getAdapter("anthropic")!;

  it("reads usage from a non-streaming response", () => {
    const usage = anthropic.extractUsageFromJson({
      id: "msg_1",
      usage: { input_tokens: 20, output_tokens: 8 },
    });
    expect(usage).toEqual({ requestTokens: 20, responseTokens: 8 });
  });

  it("splits streaming usage across message_start (input) and message_delta (output)", () => {
    const start = anthropic.extractUsageFromSseEvent({
      type: "message_start",
      message: { id: "msg_1", usage: { input_tokens: 20, output_tokens: 0 } },
    });
    expect(start).toEqual({ requestTokens: 20, responseTokens: null });

    const delta = anthropic.extractUsageFromSseEvent({
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 15 },
    });
    expect(delta).toEqual({ requestTokens: null, responseTokens: 15 });
  });

  it("returns nulls for a content_block_delta event", () => {
    const usage = anthropic.extractUsageFromSseEvent({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "hi" },
    });
    expect(usage).toEqual({ requestTokens: null, responseTokens: null });
  });
});

describe("forEachSseJson", () => {
  function streamOf(text: string): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  it("parses multiple data frames and ignores [DONE]", async () => {
    const seen: unknown[] = [];
    await forEachSseJson(
      streamOf('data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n'),
      (event) => seen.push(event),
    );
    expect(seen).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("ignores malformed JSON lines without throwing", async () => {
    const seen: unknown[] = [];
    await forEachSseJson(streamOf("data: {not json}\n\ndata: {\"a\":1}\n\n"), (event) => seen.push(event));
    expect(seen).toEqual([{ a: 1 }]);
  });

  it("handles a frame split across two chunks", async () => {
    const bytes1 = new TextEncoder().encode('data: {"a":');
    const bytes2 = new TextEncoder().encode("1}\n\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes1);
        controller.enqueue(bytes2);
        controller.close();
      },
    });
    const seen: unknown[] = [];
    await forEachSseJson(stream, (event) => seen.push(event));
    expect(seen).toEqual([{ a: 1 }]);
  });

  it("does nothing on an empty stream", async () => {
    const seen: unknown[] = [];
    await forEachSseJson(streamOf(""), (event) => seen.push(event));
    expect(seen).toEqual([]);
  });
});

describe("buildUpstreamHeaders", () => {
  const openai = getAdapter("openai")!;
  const anthropic = getAdapter("anthropic")!;

  it("forwards the caller's own auth and content-type headers unmodified", () => {
    const req = new Headers({
      Authorization: "Bearer sk-team-owns-this-key",
      "Content-Type": "application/json",
    });
    const headers = buildUpstreamHeaders(req, openai);
    expect(headers.get("authorization")).toBe("Bearer sk-team-owns-this-key");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("strips the caller's Cookie header — never leak our session cookie to a third-party provider", () => {
    const req = new Headers({
      Cookie: "sb-access-token=super-secret-session; other=1",
      Authorization: "Bearer sk-real-key",
    });
    const headers = buildUpstreamHeaders(req, openai);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.get("authorization")).toBe("Bearer sk-real-key");
  });

  it("strips hop-by-hop and our own routing header", () => {
    const req = new Headers({
      Host: "motf.example",
      Connection: "keep-alive",
      "Content-Length": "123",
      "Transfer-Encoding": "chunked",
      "Accept-Encoding": "gzip",
      "x-motf-team": "motf_should_not_forward",
      "X-Custom-Header": "keep-me",
    });
    const headers = buildUpstreamHeaders(req, openai);
    for (const stripped of ["host", "connection", "content-length", "transfer-encoding", "accept-encoding", "x-motf-team"]) {
      expect(headers.has(stripped)).toBe(false);
    }
    expect(headers.get("x-custom-header")).toBe("keep-me");
  });

  it("adds an adapter default header only when the caller didn't already send one", () => {
    const withoutVersion = buildUpstreamHeaders(new Headers(), anthropic);
    expect(withoutVersion.get("anthropic-version")).toBe("2023-06-01");

    const withVersion = buildUpstreamHeaders(new Headers({ "anthropic-version": "2099-01-01" }), anthropic);
    expect(withVersion.get("anthropic-version")).toBe("2099-01-01");
  });
});

describe("buildResponseHeaders", () => {
  it("drops encoding/length headers that no longer describe the decoded body", () => {
    const headers = buildResponseHeaders(
      new Headers({ "content-encoding": "gzip", "content-length": "42", "transfer-encoding": "chunked" }),
    );
    expect(headers.has("content-encoding")).toBe(false);
    expect(headers.has("content-length")).toBe(false);
    expect(headers.has("transfer-encoding")).toBe(false);
  });

  it("strips a Set-Cookie from the upstream provider — never let it set a cookie on our origin", () => {
    const headers = buildResponseHeaders(new Headers({ "set-cookie": "evil=1; Path=/" }));
    expect(headers.has("set-cookie")).toBe(false);
  });

  it("keeps ordinary response headers", () => {
    const headers = buildResponseHeaders(new Headers({ "content-type": "application/json", "x-request-id": "abc" }));
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-request-id")).toBe("abc");
  });
});

describe("trackUsage", () => {
  const openai = getAdapter("openai")!;

  it("passes a non-streaming JSON response through byte-for-byte while extracting usage", async () => {
    const payload = JSON.stringify({ id: "x", usage: { prompt_tokens: 3, completion_tokens: 4 } });
    const upstream = new Response(payload, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const { response, usage } = trackUsage(openai, upstream);
    const text = await response.text();
    expect(text).toBe(payload);
    expect(await usage).toEqual({ requestTokens: 3, responseTokens: 4 });
  });

  it("streams SSE through unmodified while extracting usage from a teed copy", async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":7,"completion_tokens":2}}\n\n' +
      "data: [DONE]\n\n";
    const upstream = new Response(sse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const { response, usage } = trackUsage(openai, upstream);
    const text = await response.text();
    expect(text).toBe(sse);
    expect(await usage).toEqual({ requestTokens: 7, responseTokens: 2 });
  });

  it("degrades to nulls on a malformed JSON body without throwing", async () => {
    const upstream = new Response("not json", { status: 200, headers: { "content-type": "application/json" } });
    const { response, usage } = trackUsage(openai, upstream);
    expect(await response.text()).toBe("not json");
    expect(await usage).toEqual({ requestTokens: null, responseTokens: null });
  });

  it("handles a bodyless response", async () => {
    const upstream = new Response(null, { status: 204 });
    const { response, usage } = trackUsage(openai, upstream);
    expect(response.status).toBe(204);
    expect(await usage).toEqual({ requestTokens: null, responseTokens: null });
  });
});
