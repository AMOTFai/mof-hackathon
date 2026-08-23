import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WS from "ws";

(globalThis as { WebSocket?: unknown }).WebSocket = WS;

for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i)] ??= t.slice(i + 1);
}

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const svc = createClient(url, serviceKey);

const EVENT_ID = "fbfcab1b-ec0c-4cde-9764-9a6d8168c907"; // my-hack
const SITE_URL = process.argv[2] ?? "https://mindsofthefutureplatform-eta.vercel.app";

const PERSONAS: { role: "judge" | "participant" | "recruiter"; email: string }[] = [
  { role: "judge", email: "alex.match888+judge@gmail.com" },
  { role: "participant", email: "alex.match888+participant@gmail.com" },
  { role: "recruiter", email: "alex.match888+recruiter@gmail.com" },
];

async function main() {
  for (const p of PERSONAS) {
    const created = await svc.auth.admin.createUser({ email: p.email, email_confirm: true });
    let userId: string;
    if (created.error) {
      const { data: existing } = await svc.auth.admin.listUsers();
      const found = existing.users.find((u) => u.email === p.email);
      if (!found) throw created.error;
      userId = found.id;
    } else {
      userId = created.data.user!.id;
    }

    await svc.from("event_roles").upsert(
      { event_id: EVENT_ID, user_id: userId, role: p.role },
      { onConflict: "event_id,user_id,role" },
    );

    const link = await svc.auth.admin.generateLink({
      type: "magiclink",
      email: p.email,
      options: { redirectTo: `${SITE_URL}/auth/callback` },
    });
    if (link.error) throw link.error;

    // Skip Supabase's own hosted verify page (which needs redirect_to
    // allowlisted) and go straight at our own /auth/callback route the
    // same way it verifies real magic-link emails: token_hash + type.
    const { hashed_token, verification_type } = link.data.properties;
    const callbackUrl = `${SITE_URL}/auth/callback?token_hash=${hashed_token}&type=${verification_type}`;

    console.log(`\n${p.role.toUpperCase()} (${p.email}):`);
    console.log(callbackUrl);
  }
}

main();
