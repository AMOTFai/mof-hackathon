/**
 * Provider adapters for the API proxy. The proxy itself is a dumb pass-through
 * — it forwards the request unmodified using the TEAM's own API key. A
 * provider only declares where upstream lives, headers the SDK might omit,
 * and how to pull usage/model out of a response for the activity log.
 *
 * Adding a provider = adding one object to ADAPTERS. Nothing in the route
 * handler hardcodes provider logic (CLAUDE.md: "Keep it dumb").
 *
 * `host` is a fixed allowlisted origin, never derived from request input —
 * that is what keeps this an SDK relay instead of an open SSRF proxy.
 */

export type TokenUsage = { requestTokens: number | null; responseTokens: number | null };

export type ProviderAdapter = {
  id: string;
  label: string;
  /** Upstream origin, no trailing slash. Captured path is appended verbatim. */
  host: string;
  /** Set only if the caller's own request didn't already send them. */
  defaultHeaders?: Record<string, string>;
  extractModel: (body: unknown) => string | null;
  /** Usage from a fully-parsed, non-streaming JSON response body. */
  extractUsageFromJson: (body: unknown) => TokenUsage;
  /** Usage from one decoded SSE `data:` payload of a streaming response. */
  extractUsageFromSseEvent: (event: unknown) => TokenUsage;
  /** How a team points their SDK at us, shown in the setup instructions. */
  setupHint: (baseUrl: string) => { proxyBaseUrl: string; note: string };
};

function modelFromBody(body: unknown): string | null {
  if (body && typeof body === "object" && "model" in body) {
    const m = (body as { model?: unknown }).model;
    return typeof m === "string" ? m : null;
  }
  return null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

const NO_USAGE: TokenUsage = { requestTokens: null, responseTokens: null };

const openai: ProviderAdapter = {
  id: "openai",
  label: "OpenAI-compatible",
  host: "https://api.openai.com",
  extractModel: modelFromBody,
  extractUsageFromJson: (body) => {
    const usage = record(record(body)?.usage);
    if (!usage) return NO_USAGE;
    return { requestTokens: num(usage.prompt_tokens), responseTokens: num(usage.completion_tokens) };
  },
  extractUsageFromSseEvent: (event) => {
    // Only present when the request set `stream_options: { include_usage: true }`.
    const usage = record(record(event)?.usage);
    if (!usage) return NO_USAGE;
    return { requestTokens: num(usage.prompt_tokens), responseTokens: num(usage.completion_tokens) };
  },
  setupHint: (baseUrl) => ({
    proxyBaseUrl: `${baseUrl}/api/proxy/openai/v1`,
    note: "Works for OpenAI and any OpenAI-compatible SDK — point base_url here and use your own API key as normal.",
  }),
};

const anthropic: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  host: "https://api.anthropic.com",
  defaultHeaders: { "anthropic-version": "2023-06-01" },
  extractModel: modelFromBody,
  extractUsageFromJson: (body) => {
    const usage = record(record(body)?.usage);
    if (!usage) return NO_USAGE;
    return { requestTokens: num(usage.input_tokens), responseTokens: num(usage.output_tokens) };
  },
  extractUsageFromSseEvent: (event) => {
    const rec = record(event);
    if (!rec) return NO_USAGE;
    // Anthropic splits usage across the stream: input_tokens arrives on
    // message_start, output_tokens accumulates and lands on message_delta.
    if (rec.type === "message_start") {
      const usage = record(record(rec.message)?.usage);
      return { requestTokens: num(usage?.input_tokens), responseTokens: null };
    }
    if (rec.type === "message_delta") {
      const usage = record(rec.usage);
      return { requestTokens: null, responseTokens: num(usage?.output_tokens) };
    }
    return NO_USAGE;
  },
  setupHint: (baseUrl) => ({
    proxyBaseUrl: `${baseUrl}/api/proxy/anthropic`,
    note: "The Anthropic SDK appends /v1/messages to base_url itself — leave that off here.",
  }),
};

const ADAPTERS: Record<string, ProviderAdapter> = { openai, anthropic };

export function getAdapter(id: string): ProviderAdapter | null {
  return ADAPTERS[id] ?? null;
}

export const PROVIDERS = Object.values(ADAPTERS);
