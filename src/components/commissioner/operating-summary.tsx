import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { Stage1CommissionerControlState } from "./stage1-controls";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import {
  automationOwnsWeek,
  automationPresentation,
  type SeasonAutomationStatus,
} from "@/application/automation/status";
import {
  commissionerNextStep,
  timedCommissionerAction,
} from "@/application/queries/commissioner-next-action";
import {
  easternTime,
  scoreFreshness,
} from "@/application/queries/score-freshness";

export function CommissionerOperatingSummary({
  state,
  controls,
  automation,
  operations,
  hasLiveImport,
  providerConfigured,
  ownerRehearsal = false,
  now = new Date(),
}: {
  state: {
    league: Stage1StateDto["league"];
    week: Stage1CommissionerControlState["week"];
  };
  controls: Stage1CommissionerControlState;
  automation: SeasonAutomationStatus | null;
  operations: LiveWeekOperations | null;
  hasLiveImport: boolean;
  providerConfigured: boolean;
  ownerRehearsal?: boolean;
  now?: Date;
}) {
  const formation = state.league.lifecycle === "DRAFT";
  const complete = state.league.lifecycle === "FINAL";
  const missed =
    formation &&
    state.week?.state === "PLANNED" &&
    Date.parse(state.week.commonLockAt) <= now.getTime();
  const manual =
    timedCommissionerAction(controls, operations, now) ??
    commissionerNextStep({
      state: controls,
      hasLiveImport,
      providerConfigured,
    });
  const automatic = automationPresentation(automation);
  const automatedNext = automationOwnsWeek(
    automation,
    state.week?.state === "PLANNED"
      ? state.week.nflWeek
      : Math.min(18, (state.week?.nflWeek ?? 1) + 1),
  );
  const activeLive =
    state.league.mode === "LIVE" && !formation && !complete && !ownerRehearsal;
  const delayed = activeLive && scoreFreshness(operations, now).delayed;
  const overdue =
    activeLive &&
    operations?.events.find(
      (event) =>
        !event.result &&
        Date.parse(event.scheduledStartAt) + 48 * 60 * 60_000 <= now.getTime(),
    );
  const missingOperations =
    activeLive && (!operations || operations.automationEnabled === undefined);
  const manualChecks = activeLive && operations?.automationEnabled === false;
  const label = complete
    ? "Season complete"
    : ownerRehearsal
      ? "Owner rehearsal"
      : missed
        ? "Season not started — opening deadline passed"
        : formation
          ? manual.title
          : state.league.mode === "SIMULATION"
            ? manual.title
            : automatic.attention
              ? automatic.label
              : delayed || overdue || missingOperations || manualChecks
                ? "Needs attention · game updates"
                : automatic.label;
  const attention = Boolean(
    missed ||
    delayed ||
    overdue ||
    missingOperations ||
    manualChecks ||
    (activeLive && automatic.attention),
  );
  return (
    <>
      <section
        aria-labelledby="commissioner-operating-summary"
        className="border-registry bg-registry/5 mt-5 rounded-xl border p-5"
      >
        <p className="text-muted text-sm">
          {state.league.name} · {state.league.nflYear} ·{" "}
          {state.week ? `Week ${state.week.nflWeek}` : "Formation"} ·{" "}
          {state.league.mode === "LIVE"
            ? "Live season"
            : "Practice/test · Simulation"}
        </p>
        <h2
          id="commissioner-operating-summary"
          className="mt-2 text-xl font-bold"
        >
          {label}
        </h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          {complete
            ? "The champion and season archive are final. No further publication is needed."
            : ownerRehearsal
              ? "Use the rehearsal guide for the next safe checkpoint. Simulated data does not affect Live leagues."
              : formation || state.league.mode === "SIMULATION"
                ? manual.detail
                : automatic.detail}
        </p>
        {!formation &&
        !complete &&
        !ownerRehearsal &&
        state.league.mode === "LIVE" ? (
          <>
            {automatic.next ? (
              <p className="mt-3 text-sm font-semibold">
                Next: {automatic.next}
              </p>
            ) : null}
            {automatic.dueAt ? (
              <p className="mt-1 text-sm">
                {easternTime(automatic.dueAt)} · conditional on eligibility and
                readiness; this is not a guaranteed completion time.
              </p>
            ) : null}
            {automation?.enrolled && !automatedNext && !automatic.attention ? (
              <p className="mt-2 text-sm">
                This next week is outside active automation. {manual.title}:{" "}
                {manual.detail}
              </p>
            ) : null}
            {automation && !automation.enrolled ? (
              <p className="mt-2 text-sm">
                {manual.title}: {manual.detail}
              </p>
            ) : null}
          </>
        ) : null}
        {formation ? (
          <>
            <p className="mt-3 text-sm">{manual.prerequisites}</p>
            <a
              className="text-action mt-2 inline-flex min-h-11 items-center font-semibold"
              href={
                missed
                  ? "#commissioner-recovery"
                  : state.league.memberCount < 4 ||
                      state.league.memberCount > 16 ||
                      state.league.memberCount % 2
                    ? "#league-invitations"
                    : "#season-start"
              }
            >
              {missed ? "Review setup limitation" : "Continue setup"}
            </a>
            <p className="text-muted text-sm">
              Optional future-week automation comes after the season starts.
            </p>
          </>
        ) : (
          <nav
            aria-label="Commissioner sections"
            className="mt-3 flex flex-wrap gap-x-5"
          >
            <a
              href="#commissioner-recovery"
              className="text-action inline-flex min-h-11 items-center text-sm font-semibold"
            >
              Recovery
            </a>
            <a
              href="#commissioner-settings"
              className="text-action inline-flex min-h-11 items-center text-sm font-semibold"
            >
              Season settings
            </a>
          </nav>
        )}
      </section>
      {attention ? (
        <section
          aria-labelledby="commissioner-attention"
          className="border-pending bg-surface mt-5 rounded-xl border p-5"
        >
          <h2 id="commissioner-attention" className="font-bold">
            Needs attention
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            {missed
              ? "The published opening deadline cannot be moved. This console cannot reopen this setup. A replacement-season decision is needed; the published slate stays unchanged."
              : overdue
                ? `${overdue.awayTeam} at ${overdue.homeTeam}: final not captured. Use the bounded score check in Recovery. The correction form only changes an existing final; first-result recovery has no established manual process here. Keep the game unresolved if the check cannot capture it.`
                : missingOperations
                  ? "Game-update status could not be confirmed. Refresh this page; do not infer that automatic checks are healthy."
                  : delayed
                    ? scoreFreshness(operations, now).message
                    : manualChecks
                      ? "Automatic game checks are off. Use the bounded score checks in Recovery at the scheduled times; season approval does not activate current-week game checks."
                      : automatic.detail}
          </p>
          {automatic.attention &&
          (overdue || missingOperations || delayed || manualChecks) ? (
            <p className="text-graphite mt-2 text-sm leading-6">
              {automatic.detail}
            </p>
          ) : null}
          <a
            href="#commissioner-recovery"
            className="text-action mt-2 inline-flex min-h-11 items-center text-sm font-semibold"
          >
            Open recovery controls
          </a>
        </section>
      ) : null}
    </>
  );
}
