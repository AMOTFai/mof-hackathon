// Provider adapters for the API proxy. The proxy itself is a dumb pass-through —
// it forwards the request unmodified using the TEAM's own API key. All a provider
// needs to declare here is where upstream lives, any headers the SDK might omit,
// and how to read the model name out of the request body for the activity log.
//
// Adding a provider = adding one object to ADAPTERS. Nothing in the route handler
// hardcodes provider logic.

export type ProviderAdapter = {
  id: string;
  label: string;
  host: string; // upstream origin, no trailing slash. Captured path is appended verbatim.
  defaultHeaders?: Record<string, string>; // set only if the client didn't already send them
  extractModel: (body: unknown) => string | null;
  // How a team points their SDK at us, shown in the setup instructions.
  setupHint: (base: string, provider: string) => { baseUrl: string; note: string };
};

function modelFromBody(body: unknown): string | null {
  if (body && typeof body === "object" && "model" in body) {
    const m = (body as { model?: unknown }).model;
    return typeof m === "string" ? m : null;
  }
  return null;
}

const openai: ProviderAdapter = {
  id: "openai",
  label: "OpenAI-compatible",
  host: "https://api.openai.com",
  extractModel: modelFromBody,
  setupHint: (base) => ({
    baseUrl: `${base}/api/proxy/openai/v1`,
    note: "Works for OpenAI and any OpenAI-compatible SDK (Together, Groq, etc. point the SDK's base_url here).",
  }),
};

const anthropic: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  host: "https://api.anthropic.com",
  defaultHeaders: { "anthropic-version": "2023-06-01" },
  extractModel: modelFromBody,
  setupHint: (base) => ({
    baseUrl: `${base}/api/proxy/anthropic`,
    note: "The Anthropic SDK appends /v1/messages to base_url; leave it off here.",
  }),
};

const ADAPTERS: Record<string, ProviderAdapter> = { openai, anthropic };

export function getAdapter(id: string): ProviderAdapter | null {
  return ADAPTERS[id] ?? null;
}

export const PROVIDERS = Object.values(ADAPTERS);
