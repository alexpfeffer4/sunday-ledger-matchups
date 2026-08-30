import type { RivalryProjection } from "@/domain/history/project-season-memory";
import { scopeLabels } from "@/domain/history/project-season-memory";
import { formatCenticredits } from "@/domain/odds/american";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";

function score(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

export function RivalryHeader({
  rivalry,
  leagueName,
}: {
  rivalry: RivalryProjection;
  leagueName: string;
}) {
  const last = rivalry.lastMeeting;
  const facts = [
    {
      label: "Competitive H2H",
      value: `${rivalry.memberAWins}–${rivalry.memberBWins}${rivalry.ties > 0 ? `–${rivalry.ties}` : ""}`,
    },
    {
      label: "Current streak",
      value: rivalry.streak
        ? `${rivalry.streak.name} · ${rivalry.streak.count}`
        : "None",
    },
    {
      label: "Average margin",
      value:
        rivalry.averageMarginCenticredits === null
          ? "—"
          : `${score(rivalry.averageMarginCenticredits)} credits`,
    },
    {
      label: "Playoff meetings",
      value: `${rivalry.playoffMeetings}`,
    },
  ];
  return (
    <PageFrame
      description="All finalized versioned meetings are shown with competition scope. The competitive H2H, streak, and average use regular-season and playoff meetings only."
      eyebrow={`${leagueName} · factual all-time record`}
      title={`${rivalry.memberA.displayName} vs. ${rivalry.memberB.displayName}`}
    >
      <dl className="border-boundary bg-surface mt-7 grid overflow-hidden rounded-xl border sm:grid-cols-2 xl:grid-cols-4">
        {facts.map((fact) => (
          <div
            className="border-boundary border-b p-5 last:border-b-0 sm:nth-[n+3]:border-b-0 sm:nth-[odd]:border-r xl:border-r xl:border-b-0 xl:last:border-r-0"
            key={fact.label}
          >
            <dt className="text-muted text-xs font-bold tracking-[0.07em] uppercase">
              {fact.label}
            </dt>
            <dd className="mt-2 text-lg font-bold">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <section className="border-boundary bg-subtle mt-5 rounded-xl border p-5">
        <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
          Last meeting
        </p>
        {last ? (
          <p className="mt-2 font-semibold">
            {last.nflYear} Week {last.nflWeek} · {scopeLabels[last.scope]} ·{" "}
            {last.sideA.name} {score(last.sideA.scoreCenticredits)}–
            {score(last.sideB.scoreCenticredits)} {last.sideB.name}
          </p>
        ) : (
          <p className="text-graphite mt-2">No finalized meetings yet.</p>
        )}
        <p className="text-muted mt-2 text-xs">
          {rivalry.placementMeetings} placement · {rivalry.exhibitionMeetings}{" "}
          exhibition. These remain visible below but do not enter competitive
          H2H.
        </p>
      </section>

      {rivalry.meetings.length === 0 ? (
        <section className="border-boundary bg-surface mt-5 rounded-xl border p-6">
          <h2 className="text-lg font-bold">No official meetings yet</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            A finalized matchup will create the first factual rivalry entry.
          </p>
        </section>
      ) : (
        <section aria-labelledby="rivalry-meetings-heading" className="mt-7">
          <h2 className="text-xl font-bold" id="rivalry-meetings-heading">
            Finalized meetings
          </h2>
          <ol className="mt-3 space-y-3">
            {rivalry.meetings.toReversed().map((matchup) => (
              <li
                className="border-boundary bg-surface rounded-xl border p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
                key={matchup.id}
              >
                <div>
                  <p className="text-muted text-xs font-bold tracking-[0.07em] uppercase">
                    {matchup.nflYear} · Week {matchup.nflWeek} ·{" "}
                    {scopeLabels[matchup.scope]}
                  </p>
                  <p className="mt-1 font-semibold">
                    {matchup.sideA.name} vs. {matchup.sideB.name}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-3 sm:mt-0">
                  <p className="font-mono font-bold">
                    {score(matchup.sideA.scoreCenticredits)}–
                    {score(matchup.sideB.scoreCenticredits)}
                  </p>
                  {matchup.corrected ? (
                    <StatusBadge tone="corrected">Corrected</StatusBadge>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </PageFrame>
  );
}
