import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // `api` is excluded deliberately: route handlers under app/api/* are machine
    // endpoints that carry their OWN auth (cron uses CRON_SECRET, the Session 8
    // proxy uses a team token). Running the cookie-session middleware over them
    // 307-redirects those callers to /login, which silently breaks the job.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
