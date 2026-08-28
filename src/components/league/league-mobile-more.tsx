import Link from "next/link";
import { SignOutForm } from "@/components/auth/sign-out-form";

const itemClass =
  "text-graphite hover:bg-subtle hover:text-ink flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold";

export function LeagueMobileMore({
  leagueSlug,
  isCommissioner,
}: {
  leagueSlug: string;
  isCommissioner: boolean;
}) {
  return (
    <details className="relative lg:hidden">
      <summary className="border-control text-graphite hover:bg-subtle flex min-h-11 cursor-pointer list-none items-center rounded-lg border px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        More
      </summary>
      <div className="border-boundary bg-surface absolute top-full right-0 z-50 mt-2 w-60 rounded-xl border p-2 shadow-[var(--shadow-card)]">
        <nav aria-label="League and account">
          <Link className={itemClass} href="/leagues">
            Your leagues
          </Link>
          <Link className={itemClass} href="/account">
            Account
          </Link>
          <Link className={itemClass} href={`/l/${leagueSlug}/rules`}>
            Rules &amp; trust
          </Link>
          {isCommissioner ? (
            <Link className={itemClass} href={`/l/${leagueSlug}/commissioner`}>
              Commissioner
            </Link>
          ) : null}
        </nav>
        <div className="border-boundary mt-2 border-t pt-2">
          <SignOutForm className={itemClass} />
        </div>
      </div>
    </details>
  );
}
