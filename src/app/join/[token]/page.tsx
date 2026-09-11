import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { getLeagueInvitePreview } from "@/application/queries/get-league-invite-preview";
import invitePreviewImage from "@/app/join/opengraph-image.png";
import {
  InvitePreviewPanel,
  InviteUnavailable,
} from "@/components/league/invite-preview";
import { BrandLockup } from "@/components/ui/register-mark";

// Share the existing public preview within this request, never across invites.
const getInvitePreview = cache(getLeagueInvitePreview);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const preview = await getInvitePreview(token).catch(() => null);
  const title = preview
    ? `Join ${preview.league_name}`
    : "League invitation unavailable";
  const description = preview
    ? "Join your friends on Sunday Ledger. Make your NFL picks, face a friend each week, and compete all season. Free to play with virtual credits."
    : "This invitation is unavailable. Ask the commissioner for a current private league link.";
  const images = [
    {
      url: invitePreviewImage.src,
      width: invitePreviewImage.width,
      height: invitePreviewImage.height,
      alt: "Sunday Ledger league invitation. You're invited.",
    },
  ];

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "Sunday Ledger",
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function JoinLeaguePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getInvitePreview(token);
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
