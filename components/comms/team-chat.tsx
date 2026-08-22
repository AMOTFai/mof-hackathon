"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { getOrSubscribeChannel } from "@/lib/supabase/realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/datetime";
import type { ChatMessage } from "@/lib/comms/queries";

// 5 minutes — consecutive messages from the same sender within this window
// are grouped into one visual block (avatar/name shown once), matching
// WhatsApp/Discord grouping conventions.
const GROUP_WINDOW_MS = 5 * 60_000;

type LocalMessage = ChatMessage & { pending?: boolean; failed?: boolean };

export function TeamChat({
  eventId,
  teamId,
  userId,
  userName,
  userAvatarUrl,
  initial,
}: {
  eventId: string;
  teamId: string;
  userId: string;
  userName: string | null;
  userAvatarUrl?: string | null;
  initial: ChatMessage[];
}) {
  const [messages, setMessages] = useState<LocalMessage[]>(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMessages(initial);
  }, [initial]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (nearBottom) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = getOrSubscribeChannel(supabase, `team-chat-${teamId}`, (ch) =>
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `team_id=eq.${teamId}` },
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
          if (row.channel_type !== "team") return;
          let senderName: string | null = row.sender_id === userId ? userName : null;
          let senderAvatarUrl: string | null = row.sender_id === userId ? (userAvatarUrl ?? null) : null;
          if (row.sender_id !== userId) {
            const { data } = await supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", row.sender_id)
              .maybeSingle();
            senderName = data?.full_name ?? null;
            senderAvatarUrl = data?.avatar_url ?? null;
          }
          setMessages((prev) => {
            if (prev.some((item) => item.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                eventId: row.event_id,
                teamId: row.team_id,
                channelType: "team",
                senderId: row.sender_id,
                senderName,
                senderAvatarUrl,
                body: row.body,
                urgent: row.urgent,
                createdAt: row.created_at,
              },
            ];
          });
        },
      ).subscribe(),
    );
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teamId, userId, userName, userAvatarUrl]);

  async function onSend(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    setBody("");

    // Optimistic append — send feels instant. A temp id lets us reconcile
    // with the realtime echo of our own insert (which arrives with the
    // real DB id) without producing a duplicate bubble.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: LocalMessage = {
      id: tempId,
      eventId,
      teamId,
      channelType: "team",
      senderId: userId,
      senderName: userName,
      senderAvatarUrl: userAvatarUrl ?? null,
      body: text,
      urgent: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const supabase = createClient();
    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({ event_id: eventId, channel_type: "team", team_id: teamId, sender_id: userId, body: text })
      .select("id, created_at")
      .single();

    if (sendError || !data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setError(sendError?.message ?? "Message failed to send.");
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, id: data.id, createdAt: data.created_at, pending: false } : m)),
    );
  }

  return (
    <div className="glass flex flex-col overflow-hidden p-0">
      <div ref={scrollRef} className="flex h-[28rem] flex-col gap-1 overflow-y-auto p-4" data-testid={`chat-${teamId}`}>
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm text-muted-foreground">No messages yet.</p>
            <p className="text-xs text-muted-foreground">Say hello to your team.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const isOwn = message.senderId === userId;
              const isFirstInGroup =
                !prev ||
                prev.senderId !== message.senderId ||
                new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_WINDOW_MS;
              const isLastInGroup =
                !next ||
                next.senderId !== message.senderId ||
                new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() > GROUP_WINDOW_MS;
              return (
                <motion.div
                  key={message.id}
                  data-testid={`chat-msg-${message.id}`}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
                  animate={{ opacity: message.pending ? 0.6 : 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn("flex items-end gap-2", isOwn ? "flex-row-reverse" : "flex-row", isFirstInGroup ? "mt-3" : "mt-0.5")}
                >
                  <div className={cn("w-7 shrink-0", !isFirstInGroup && "invisible")}>
                    {!isOwn ? <Avatar id={message.senderId} name={message.senderName} imageUrl={message.senderAvatarUrl} size="sm" /> : null}
                  </div>
                  <div className={cn("flex max-w-[75%] flex-col gap-0.5", isOwn ? "items-end" : "items-start")}>
                    {isFirstInGroup && !isOwn ? (
                      <p className="px-1 text-xs font-medium text-muted-foreground">{message.senderName || "Teammate"}</p>
                    ) : null}
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                        isOwn
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm border border-panel-border bg-panel text-foreground",
                        message.failed && "border border-destructive/60",
                      )}
                    >
                      {message.body}
                    </div>
                    {isLastInGroup ? (
                      <p className="px-1 font-mono text-[10px] text-muted-foreground">{formatWhen(message.createdAt)}</p>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottom} />
      </div>
      <form onSubmit={onSend} className="flex gap-2 border-t border-panel-border p-3">
        <Input
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Message your team"
          maxLength={4000}
          autoComplete="off"
          data-testid={`chat-input-${teamId}`}
        />
        <Button type="submit" disabled={body.trim().length === 0} data-testid={`chat-send-${teamId}`}>
          Send
        </Button>
      </form>
      {error ? (
        <p className="px-3 pb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
