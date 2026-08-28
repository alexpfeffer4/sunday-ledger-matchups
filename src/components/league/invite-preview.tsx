import Link from "next/link";
import type { LeagueInvitePreview } from "@/application/queries/league-invite-dtos";
import {
  InvitePreviewCard,
  SignedOutInviteActions,
} from "@/components/league/invite-public-preview";
import { JoinLeagueForm } from "@/components/league/join-league-form";

export function InviteUnavailable() {
  return (
    <section className="border-boundary bg-surface mt-14 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
      <p className="text-pending text-xs font-bold tracking-[0.1em] uppercase">
        Invitation unavailable
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
        This league link is no longer active
      </h1>
      <p className="text-graphite mt-3 leading-7">
        It may have expired, reached its use limit, or been revoked. Ask the
        commissioner for a new private invitation.
      </p>
      <Link
        className="text-action mt-5 inline-flex min-h-11 items-center font-semibold hover:underline"
        href="/"
      >
        Return home
      </Link>
    </section>
  );
}

export function InvitePreviewPanel({
  authenticated,
  preview,
  token,
}: {
  authenticated: boolean;
  preview: LeagueInvitePreview;
  token: string;
}) {
  return (
    <InvitePreviewCard
      actions={
        authenticated ? (
          <JoinLeagueForm token={token} />
        ) : (
          <SignedOutInviteActions token={token} />
        )
      }
      preview={preview}
    />
  );
}
