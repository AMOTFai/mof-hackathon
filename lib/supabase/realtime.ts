import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Guards a `useEffect`-mounted channel subscription against a React Strict
 * Mode dev-only race: Strict Mode invokes an effect, its cleanup, then the
 * effect again for the same mount — synchronously, before `removeChannel`
 * (which awaits a network round trip) has actually torn the first channel
 * down. `supabase.channel(topic)` returns that still-live channel rather
 * than a fresh one, and calling `.on()` on an already-subscribed channel
 * throws "cannot add ... callbacks ... after subscribe()". If a channel for
 * this topic is already joined/joining, reuse it instead of resubscribing.
 */
export function getOrSubscribeChannel(
  supabase: SupabaseClient,
  topic: string,
  subscribe: (channel: RealtimeChannel) => RealtimeChannel,
): RealtimeChannel {
  const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (existing && (existing.state === "joined" || existing.state === "joining")) {
    return existing;
  }
  return subscribe(supabase.channel(topic));
}
