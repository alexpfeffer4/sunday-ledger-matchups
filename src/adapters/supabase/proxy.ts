import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabasePublicConfig,
  isSupabaseConfigured,
} from "@/adapters/supabase/config";
import type { Database } from "@/adapters/supabase/database.types";

const protectedPrefixes = ["/l/", "/join/", "/leagues"];

export async function updateSupabaseSession(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicConfig();
  const supabase = createServerClient<Database, "api">(url, publishableKey, {
    db: { schema: "api" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isProtected = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (!data?.claims?.sub && isProtected) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/auth/sign-in";
    signInUrl.search = "";
    signInUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  return response;
}
