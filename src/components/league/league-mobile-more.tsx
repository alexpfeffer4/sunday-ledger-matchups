import Link from "next/link";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { LeagueNavIcon } from "@/components/league/league-nav-icon";

const itemClass =
  "text-graphite hover:bg-subtle hover:text-ink flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold";

export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function ProfileHeader({
  memberName,
  memberRole,
}: {
  memberName: string;
  memberRole: string;
}) {
  return (
    <div className="border-boundary flex items-center gap-3 border-b px-3 pb-3">
      <span className="border-registry bg-subtle text-registry flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
        {initials(memberName)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{memberName}</p>
        <p className="text-muted truncate text-xs">{memberRole}</p>
      </div>
    </div>
  );
}

export function LeagueMobileMore({
  leagueSlug,
  isCommissioner,
  memberName,
  memberRole,
}: {
  leagueSlug: string;
  isCommissioner: boolean;
  memberName: string;
  memberRole: string;
}) {
  return (
    <details className="relative lg:hidden">
      <summary
        aria-label="Open profile menu"
        className="border-control bg-surface text-registry hover:bg-subtle flex size-11 cursor-pointer list-none items-center justify-center rounded-full border text-xs font-bold [&::-webkit-details-marker]:hidden"
      >
        {initials(memberName)}
      </summary>
      <div className="border-boundary bg-surface fixed top-[4.5rem] right-4 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border p-2 shadow-[var(--shadow-modal)]">
        <ProfileHeader memberName={memberName} memberRole={memberRole} />
        <nav aria-label="League and account" className="mt-2">
          <Link className={itemClass} href="/leagues">
            <LeagueNavIcon name="league" />
            Your leagues
          </Link>
          <Link className={itemClass} href="/account">
            <LeagueNavIcon name="account" />
            Account
          </Link>
          <Link className={itemClass} href={`/l/${leagueSlug}/rules`}>
            <LeagueNavIcon name="rules" />
            Rules &amp; trust
          </Link>
          {isCommissioner ? (
            <Link className={itemClass} href={`/l/${leagueSlug}/commissioner`}>
              <LeagueNavIcon name="commissioner" />
              Commissioner
            </Link>
          ) : null}
        </nav>
        <div className="border-boundary mt-2 border-t pt-2">
          <SignOutForm className={`${itemClass} w-full`} />
        </div>
      </div>
    </details>
  );
}

export function LeagueDesktopProfileMenu({
  memberName,
  memberRole,
}: {
  memberName: string;
  memberRole: string;
}) {
  return (
    <details className="relative hidden lg:block">
      <summary
        aria-label="Open account menu"
        className="hover:bg-subtle flex min-h-12 cursor-pointer list-none items-center justify-center rounded-lg px-2 xl:justify-start xl:gap-3 [&::-webkit-details-marker]:hidden"
      >
        <span className="border-registry bg-subtle text-registry flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
          {initials(memberName)}
        </span>
        <span className="hidden min-w-0 flex-1 text-left xl:block">
          <span className="block truncate text-sm font-semibold">
            {memberName}
          </span>
          <span className="text-muted block truncate text-xs">
            {memberRole}
          </span>
        </span>
        <span aria-hidden="true" className="text-muted hidden text-xs xl:block">
          ···
        </span>
      </summary>
      <div className="border-boundary bg-surface absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border p-2 shadow-[var(--shadow-card)]">
        <ProfileHeader memberName={memberName} memberRole={memberRole} />
        <nav aria-label="Account options" className="mt-2">
          <Link className={itemClass} href="/leagues">
            <LeagueNavIcon name="league" />
            Your leagues
          </Link>
          <Link className={itemClass} href="/account">
            <LeagueNavIcon name="account" />
            Account
          </Link>
        </nav>
        <div className="border-boundary mt-2 border-t pt-2">
          <SignOutForm className={`${itemClass} w-full`} />
        </div>
      </div>
    </details>
  );
}
