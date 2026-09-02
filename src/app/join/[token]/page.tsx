import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { getLeagueInvitePreview } from "@/application/queries/get-league-invite-preview";
import {
  InvitePreviewPanel,
  InviteUnavailable,
} from "@/components/league/invite-preview";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = {
  title: "Private league invitation",
  robots: { index: false, follow: false },
};

export default async function JoinLeaguePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getLeagueInvitePreview(token);
  let authenticated = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const claims = await supabase.auth.getClaims();
      authenticated = Boolean(claims.data?.claims?.sub);
    } catch {}
  }

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-xl">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup variant="horizontal" />
        </Link>

        {preview ? (
          <InvitePreviewPanel
            authenticated={authenticated}
            preview={preview}
            token={token}
          />
        ) : (
          <InviteUnavailable />
        )}
      </div>
    </main>
  );
}
