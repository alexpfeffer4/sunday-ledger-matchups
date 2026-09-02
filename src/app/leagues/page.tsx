import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { LeagueListActions } from "@/components/league/league-list-actions";
import { LeagueSetupForms } from "@/components/league/league-setup-forms";
import { BrandLockup } from "@/components/ui/register-mark";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Your leagues" };

type LeagueSummary = {
  archived_at: string | null;
  current_week: number | null;
  id: string;
  lifecycle: string;
  member_count: number;
  mode: string;
  name: string;
  nfl_year: number;
  role: string;
  slug: string;
};

function leagueStatus(league: LeagueSummary): string {
  if (league.lifecycle === "FINAL") return "Season final";
  if (league.lifecycle === "CHAMPION_FINAL") return "Champion final";
  if (league.lifecycle === "WEEK_18_EXHIBITION") return "Week 18 exhibition";
  if (league.lifecycle === "DRAFT") return "Setting up";
  if (league.current_week) return `Week ${league.current_week}`;
  return league.lifecycle === "PLAYOFFS" ? "Playoffs" : "Season active";
}

function LeagueList({
  archived = false,
  leagues,
}: {
  archived?: boolean;
  leagues: LeagueSummary[];
}) {
  return (
    <div className="divide-boundary border-boundary divide-y border-y">
      {leagues.map((league) => (
        <article
          className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center"
          key={league.id}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">{league.name}</h3>
              <span className="border-control text-muted rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                {league.mode === "SIMULATION"
                  ? "Practice/test · Simulation"
                  : "Live season"}
              </span>
              {archived ? (
                <StatusBadge tone="void">Archived</StatusBadge>
              ) : null}
            </div>
            <p className="text-muted mt-1 text-xs font-semibold">
              {leagueStatus(league)} · {league.member_count} member
              {league.member_count === 1 ? "" : "s"} · {league.nfl_year} ·{" "}
              {league.role === "COMMISSIONER" ? "Commissioner" : "Member"}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
            <Link
              className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
              href={`/l/${league.slug}/matchup`}
            >
              Open league
            </Link>
            <LeagueListActions
              archived={archived}
              leagueName={league.name}
              lifecycle={league.lifecycle}
              role={league.role}
              slug={league.slug}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function LeaguesPage() {
  const supabase = await createSupabaseServerClient();
  const leaguesResult = await supabase
    .schema("api")
    .from("my_leagues")
    .select(
      "id, name, slug, role, mode, nfl_year, lifecycle, archived_at, member_count, current_week, joined_at",
    )
    .order("joined_at", { ascending: false });
  const leagues: LeagueSummary[] = (leaguesResult.data ?? []).flatMap(
    (league) => {
      if (
        !league.id ||
        !league.name ||
        !league.slug ||
        !league.role ||
        !league.mode ||
        !league.nfl_year ||
        !league.lifecycle ||
        league.member_count === null
      ) {
        return [];
      }
      return [
        {
          archived_at: league.archived_at,
          current_week: league.current_week,
          id: league.id,
          lifecycle: league.lifecycle,
          member_count: league.member_count,
          mode: league.mode,
          name: league.name,
          nfl_year: league.nfl_year,
          role: league.role,
          slug: league.slug,
        },
      ];
    },
  );
  const activeLeagues = leagues.filter((league) => !league.archived_at);
  const archivedLeagues = leagues.filter((league) => league.archived_at);

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Sunday Ledger home">
            <BrandLockup variant="horizontal" />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              className="text-registry hover:bg-subtle inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
              href="/account"
            >
              Account
            </Link>
            <SignOutForm className="text-muted hover:text-ink min-h-11 rounded-lg px-3 text-sm font-semibold" />
          </div>
        </div>
        <div className="mt-16">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            League home
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">
            Your leagues
          </h1>
          <p className="text-graphite mt-3 max-w-2xl leading-7">
            Open a league, join with an invitation, or start a new season.
          </p>
        </div>

        {activeLeagues.length > 0 ? (
          <section className="mt-8" aria-labelledby="stored-leagues-title">
            <h2 id="stored-leagues-title" className="text-xl font-bold">
              Active leagues
            </h2>
            <div className="mt-4">
              <LeagueList leagues={activeLeagues} />
            </div>
          </section>
        ) : (
          <section className="border-boundary bg-surface mt-8 rounded-xl border p-6">
            <h2 className="text-xl font-bold">No active leagues yet</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Create a private NFL league or open an invitation from a
              commissioner.
            </p>
          </section>
        )}

        <LeagueSetupForms />

        <section className="border-boundary mt-8 border-t pt-6">
          <h2 className="text-xl font-bold">Learn the game</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className="border-boundary bg-surface rounded-xl border p-5">
              <h3 className="font-bold">Try a practice week</h3>
              <p className="text-graphite mt-2 text-sm leading-6">
                Build a 1,000-credit card and see how a matchup scores. Nothing
                is saved to your leagues.
              </p>
              <Link
                className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
                href="/leagues/demo"
              >
                Start practice week
              </Link>
            </article>
            <article className="border-boundary bg-surface rounded-xl border p-5">
              <h3 className="font-bold">View an Example Season</h3>
              <p className="text-graphite mt-2 text-sm leading-6">
                Explore one neutral, read-only illustration of final standings,
                playoffs, a champion, and season history.
              </p>
              <Link
                href="/l/example-season/matchup"
                className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
              >
                View Example Season
              </Link>
            </article>
          </div>
        </section>

        {archivedLeagues.length > 0 ? (
          <details className="border-boundary mt-8 border-t pt-6">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold">
              Archived leagues ({archivedLeagues.length})
            </summary>
            <div className="mt-4">
              <LeagueList archived leagues={archivedLeagues} />
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
