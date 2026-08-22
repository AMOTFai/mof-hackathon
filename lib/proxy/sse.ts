/**
 * Minimal Server-Sent-Events line parser for usage extraction.
 *
 * Only reads `data:` payloads and hands each parsed JSON object to a callback
 * — it does not interpret event types, ids, or retry directives, because it
 * never drives anything user-visible. It exists purely so the proxy can peek
 * at token usage on the internal, teed copy of a streaming response without
 * touching the copy going to the caller.
 */
export async function forEachSseJson(
  stream: ReadableStream<Uint8Array>,
  onEvent: (data: unknown) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; process complete frames only.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            onEvent(JSON.parse(payload));
          } catch {
            // Non-JSON data line (rare, provider-specific) — ignore.
          }
        }
      }
    }
  } catch {
    // The client disconnecting or the upstream erroring mid-stream must not
    // throw out of this background parse — it only ever affects logging.
  } finally {
    reader.releaseLock();
  }
}
