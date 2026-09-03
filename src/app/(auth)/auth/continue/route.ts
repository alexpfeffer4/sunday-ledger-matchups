import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/adapters/supabase/redirect";

export function GET(request: NextRequest) {
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, request.url), {
    status: 303,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
