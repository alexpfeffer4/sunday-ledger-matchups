import type { ReactNode } from "react";
import type { LeagueInvitePreview } from "@/application/queries/league-invite-dtos";
import { RegisterMark } from "@/components/ui/register-mark";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

export function SignedOutInviteActions({ token }: { token: string }) {
  const next = `/join/${token}`;
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <a
        className="bg-registry hover:bg-registry-hover inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-center text-sm font-semibold text-white"
        href={`/auth/create-account?next=${encodeURIComponent(next)}`}
      >
        Create account
      </a>
      <a
        className="border-control hover:border-registry hover:text-registry inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-center text-sm font-semibold"
        href={`/auth/sign-in?next=${encodeURIComponent(next)}`}
      >
        Sign in
      </a>
    </div>
  );
}

export function InvitePreviewCard({
  actions,
  preview,
}: {
  actions: ReactNode;
  preview: LeagueInvitePreview;
}) {
  return (
    <section className="border-boundary bg-surface mt-14 overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
      <div className="bg-registry px-6 py-7 text-white sm:px-8">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/10">
            <RegisterMark master="compact" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.1em] text-white/75 uppercase">
              Private NFL league
            </p>
            <h1 className="mt-1 text-2xl font-bold break-words">
              {preview.league_name}
            </h1>
          </div>
        </div>
      </div>
      <div className="p-6 sm:p-8">
        <p className="text-copper text-xs font-bold tracking-[0.1em] uppercase">
          {preview.commissioner_name} invited you
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
          Beat one friend every week
        </h2>
        <p className="text-graphite mt-3 leading-7">
          Build a sealed card from real NFL markets. Picks stay private until
          their games begin, and weekly results build the league season.
        </p>

        <dl className="border-boundary mt-6 grid gap-4 border-y py-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Season</dt>
            <dd className="mt-1 font-semibold">
              NFL {preview.nfl_year} ·{" "}
              {preview.mode === "LIVE" ? "Live season" : "Simulation season"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Members joined</dt>
            <dd className="mt-1 font-semibold">
              {preview.member_count} · even roster required
            </dd>
          </div>
          <div>
            <dt className="text-muted">Cost</dt>
            <dd className="mt-1 font-semibold">Free · virtual credits only</dd>
          </div>
          <div>
            <dt className="text-muted">Link expires</dt>
            <dd className="mt-1 font-semibold">
              {dateFormatter.format(new Date(preview.expires_at))} ET
            </dd>
          </div>
        </dl>

        {actions}
        <p className="text-muted mt-4 text-center text-xs leading-5">
          Sealed picks stay private until their games begin. Commissioners
          cannot inspect sealed cards.
        </p>
      </div>
    </section>
  );
}
