"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Github } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { magicLinkSchema } from "@/lib/validation/auth";
import { AUTH_CALLBACK_PATH, VERIFY_PATH, safeNextPath } from "@/lib/auth/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"email" | "github" | null>(null);
  const [message, setMessage] = useState<string | null>(oauthError);

  async function originRedirect() {
    const origin = window.location.origin;
    const redirectTo = `${origin}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;
    return redirectTo;
  }

  async function onMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    setPending("email");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: await originRedirect() },
    });
    setPending(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.assign(`${VERIFY_PATH}?email=${encodeURIComponent(parsed.data.email)}`);
  }

  async function onGitHub() {
    setMessage(null);
    setPending("github");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: await originRedirect(), scopes: "read:user user:email" },
    });
    if (error) {
      setPending(null);
      setMessage(error.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onMagicLink} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" variant="mission" disabled={pending !== null}>
          {pending === "email" ? "Sending link…" : "Email me a magic link"}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-panel-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-eyebrow">
          <span className="bg-panel px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        data-testid="github-oauth"
        onClick={onGitHub}
        disabled={pending !== null}
      >
        <Github />
        {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
      </Button>

      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
