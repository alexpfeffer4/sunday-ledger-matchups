import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/adapters/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/l/:path*",
    "/join/:path*",
    "/leagues/:path*",
    "/auth/:path*",
  ],
};
