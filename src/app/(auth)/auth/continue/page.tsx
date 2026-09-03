import type { Metadata } from "next";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { AuthContinuation } from "@/components/auth/auth-continuation";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Finishing sign-in",
};

export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const query = await searchParams;
  const next = safeInternalPath(
    Array.isArray(query.next) ? query.next[0] : query.next,
  );

  return <AuthContinuation next={next} />;
}
