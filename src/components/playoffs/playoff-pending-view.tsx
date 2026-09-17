import {
  automationOwnsWeek,
  automationPresentation,
  type SeasonAutomationStatus,
} from "@/application/automation/status";
import Link from "next/link";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { PageFrame } from "@/components/league/page-frame";
import { MatchupStateRefresh } from "@/components/matchup/matchup-state-refresh";
import { StatusBadge } from "@/components/ui/status-badge";

export function PlayoffPendingView({
  state,
  automation,
}: {
  state: Stage1StateDto;
  automation?: SeasonAutomationStatus | null;
}) {
  const covered = automationOwnsWeek(automation ?? null, 15);
  const status = automationPresentation(automation ?? null);
  const publication =
    state.league.mode === "SIMULATION"
      ? "Week 14 is final. Your commissioner can publish the playoff field after the applicable review period."
      : automation === undefined
        ? "Week 14 is final. If covered by active season automation, the field publishes after the review and readiness checks; otherwise the commissioner uses the publication controls."
        : automation === null
          ? "Week 14 is final, but automation status could not be confirmed. Check Commissioner before choosing the next publication step."
          : covered
            ? `${status.label}. ${status.detail} Check Commissioner for the next publication step.`
            : "Week 14 is final. This publication is outside active season automation. Your commissioner can publish the field after the applicable review period.";
  const expected = [
    "PLAYOFFS",
    "CHAMPION_FINAL",
    "WEEK_18_EXHIBITION",
    "FINAL",
  ].includes(state.league.lifecycle);
  const week14Final =
    state.week?.nflWeek === 14 && state.week.state === "FINAL";
  return (
    <PageFrame
      eyebrow={state.league.name}
      title={
        expected
          ? "Playoff data is unavailable"
          : week14Final
            ? "The final field awaits publication"
            : "The playoff race"
      }
      description={
        expected
          ? "We could not load the published playoff field. Your qualification and results are unchanged."
          : week14Final
            ? publication
            : "The official playoff field is set after Week 14 is final. Follow your position in standings until then."
      }
      aside={
        <StatusBadge tone="pending">
          {expected ? "Unavailable" : "Awaiting qualification"}
        </StatusBadge>
      }
    >
      <section className="border-boundary mt-6 max-w-2xl border-t pt-5">
        {expected ? (
          <>
            <p className="text-graphite mb-3 text-sm leading-6">
              Refresh to try again. If the field remains unavailable, ask your
              commissioner to check its publication.
            </p>
            <MatchupStateRefresh label="Refresh playoffs" />
          </>
        ) : null}
        <nav
          aria-label="Playoff next steps"
          className="mt-3 flex flex-wrap gap-4"
        >
          <Link
            className="text-action inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
            href={`/l/${state.league.slug}/standings`}
          >
            View standings
          </Link>
          <Link
            className="text-action inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
            href={`/l/${state.league.slug}/rules`}
          >
            View season rules
          </Link>
          {week14Final && state.commissioner.isCommissioner ? (
            <Link
              className="text-action inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              href={`/l/${state.league.slug}/commissioner`}
            >
              Open commissioner controls
            </Link>
          ) : null}
        </nav>
      </section>
    </PageFrame>
  );
}
