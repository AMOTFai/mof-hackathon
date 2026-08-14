"use client";

import { useRef, useTransition } from "react";
import { sendMessage } from "@/app/actions";

export default function MessageComposer({ channel, placeholder }: { channel: string; placeholder: string }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={(fd) => start(async () => { await sendMessage(fd); ref.current?.reset(); })}
      className="flex gap-2"
    >
      <input type="hidden" name="channel" value={channel} />
      <input name="text" required placeholder={placeholder} className="input flex-1" />
      <button className="btn-primary" disabled={pending}>{pending ? "…" : "Send"}</button>
    </form>
  );
}
