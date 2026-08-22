"use client";

import { useActionState, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { markAnnouncementRead } from "@/app/(participant)/dashboard/comms-actions";
import { createClient } from "@/lib/supabase/client";
import { getOrSubscribeChannel } from "@/lib/supabase/realtime";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Avatar } from "@/components/ui/avatar";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";
import type { Announcement } from "@/lib/comms/queries";
import type { ActionResult } from "@/lib/forms";

export function AnnouncementInbox({
  eventId,
  userId,
  initial,
}: {
  eventId: string;
  userId: string;
  initial: Announcement[];
}) {
  const [items, setItems] = useState(initial);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = getOrSubscribeChannel(supabase, `announcements-${eventId}`, (ch) =>
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `event_id=eq.${eventId}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            event_id: string;
            team_id: string | null;
            sender_id: string;
            body: string;
            urgent: boolean;
            created_at: string;
            channel_type: string;
          };
          if (row.channel_type !== "announcement") return;
          const { data } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", row.sender_id)
            .maybeSingle();
          setItems((prev) => {
            if (prev.some((item) => item.id === row.id)) return prev;
            return [
              {
                id: row.id,
                eventId: row.event_id,
                teamId: row.team_id,
                channelType: "announcement",
                senderId: row.sender_id,
                senderName: data?.full_name ?? null,
                senderAvatarUrl: data?.avatar_url ?? null,
                body: row.body,
                urgent: row.urgent,
                createdAt: row.created_at,
                readAt: null,
              },
              ...prev,
            ];
          });
        },
      ).subscribe(),
    );
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  return (
    <ul className="flex flex-col gap-3">
      {items.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">No announcements yet — organizer updates land here.</Panel>
      ) : (
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <AnnouncementRow key={item.id} item={item} userId={userId} />
          ))}
        </AnimatePresence>
      )}
    </ul>
  );
}

function AnnouncementRow({ item, userId }: { item: Announcement; userId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(markAnnouncementRead, null);
  const read = Boolean(item.readAt) || state?.ok;
  return (
    <motion.li
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      data-testid={`inbox-${item.id}`}
      data-read={read ? "true" : "false"}
    >
      <Panel variant={item.urgent ? "glow" : "default"} className={item.urgent ? "border-warning/50 bg-warning/[0.04]" : undefined}>
        <div className="flex items-start gap-3">
          <Avatar id={item.senderId} name={item.senderName} imageUrl={item.senderAvatarUrl} />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{item.senderName || "Organizer"}</p>
              {item.urgent ? (
                <span className="chip border-warning/50 text-warning">Urgent</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm">{item.body}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{formatWhen(item.createdAt)}</p>
          </div>
        </div>
        {read ? (
          <p className="mt-3 text-xs text-muted-foreground">Read</p>
        ) : (
          <form action={action} className="mt-3">
            <input type="hidden" name="messageId" value={item.id} />
            <input type="hidden" name="userId" value={userId} />
            <Button type="submit" size="sm" variant="outline" disabled={pending} data-testid={`mark-read-${item.id}`}>
              {pending ? "Saving…" : "Mark as read"}
            </Button>
            <FormStatus state={state} />
          </form>
        )}
      </Panel>
    </motion.li>
  );
}
