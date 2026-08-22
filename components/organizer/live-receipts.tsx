"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getOrSubscribeChannel } from "@/lib/supabase/realtime";
import { AnnouncementReceipts } from "@/components/organizer/announcement-forms";
import type { Announcement } from "@/lib/comms/queries";

export function LiveReceipts({
  items,
  participantCount,
}: {
  items: Announcement[];
  participantCount: number;
}) {
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(items.map((item) => [item.id, item.readCount ?? 0])),
  );

  useEffect(() => {
    setCounts(Object.fromEntries(items.map((item) => [item.id, item.readCount ?? 0])));
  }, [items]);

  // Tracked in a ref (not an effect dependency) so a fresh `items` array on
  // every parent re-render doesn't tear down and recreate the channel below.
  // `supabase.channel(topic)` returns the SAME already-subscribed channel
  // object for a topic that's still in the client's channel list, so
  // recreating it on every render raced with `removeChannel`'s async cleanup
  // and threw "cannot add `postgres_changes` callbacks ... after `subscribe()`".
  const idsRef = useRef(new Set(items.map((item) => item.id)));
  useEffect(() => {
    idsRef.current = new Set(items.map((item) => item.id));
  }, [items]);

  useEffect(() => {
    const supabase = createClient();
    const channel = getOrSubscribeChannel(supabase, "announcement-reads", (ch) =>
      ch
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "announcement_reads" },
          (payload) => {
            const messageId = (payload.new as { message_id?: string }).message_id;
            if (!messageId || !idsRef.current.has(messageId)) return;
            setCounts((prev) => ({ ...prev, [messageId]: (prev[messageId] ?? 0) + 1 }));
          },
        )
        .subscribe(),
    );
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const live = items.map((item) => ({ ...item, readCount: counts[item.id] ?? item.readCount ?? 0 }));
  return <AnnouncementReceipts items={live} participantCount={participantCount} />;
}
