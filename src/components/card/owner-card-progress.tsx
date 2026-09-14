"use client";

import Link from "next/link";
import { easternTime } from "@/application/queries/score-freshness";
import type { OwnerCardContext } from "@/components/card/owner-card-context";
import {
  useCardDeadline,
  useCardDraft,
} from "@/components/card/use-card-draft";
import { StatusBadge } from "@/components/ui/status-badge";
import { usesRollingSubmissions } from "@/rulesets/card-rules";
import { formatCredits } from "@/domain/odds/american";

export function SealedCardSummary({
  leagueSlug,
  lockAt,
  onCardPage = false,
  heading = "Card sealed",
  credits = 1_000,
}: {
  leagueSlug: string;
  lockAt: string;
  onCardPage?: boolean;
  heading?: string;
  credits?: number;
}) {
  return (
    <section
      aria-label="Your weekly card"
      className="border-boundary bg-subtle rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{heading}</h2>
        <StatusBadge tone="sealed">Sealed</StatusBadge>
      </div>
      <p className="text-graphite mt-1 text-sm leading-5">
        {formatCredits(credits)} credits sealed. Sealed picks cannot be changed.
      </p>
      <p className="text-muted mt-2 text-sm">
        Cards lock · <time dateTime={lockAt}>{easternTime(lockAt)}</time>
      </p>
      {!onCardPage ? (
        <Link
          className="text-action mt-1 inline-flex min-h-11 items-center font-semibold"
          href={`/l/${leagueSlug}/card`}
        >
          View card
        </Link>
      ) : null}
    </section>
  );
}

export function OwnerCardProgress({
  context,
  onCardPage = false,
  onSlatePage = false,
  presentation = "full",
}: {
  context: OwnerCardContext;
  onCardPage?: boolean;
  onSlatePage?: boolean;
  presentation?: "full" | "matchup";
}) {
  const { drafts, hydrated, saved, sealed, status } = useCardDraft(context);
  const closed = useCardDeadline(context);
  if (!context.week || !context.ownerCard) return null;
  if (usesRollingSubmissions(context.rules)) {
    const card = context.ownerCard;
    const unsettled = card.positions.filter((position) => !position.settlement);
    const canSubmit =
      !closed &&
      card.canSubmit !== false &&
      card.remainingCredits >= 50 &&
      card.positions.length < 20;
    const deadline = context.week.entryClosesAt;
    if (presentation === "matchup")
      return (
        <section
          aria-label="Your weekly card"
          className="matchup-next-action border-boundary bg-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
        >
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {closed
                ? "Weekly betting is closed"
                : canSubmit
                  ? `${formatCredits(card.remainingCredits)} credits available to bet`
                  : card.positions.length
                    ? "Your bets are submitted"
                    : "No bets submitted"}
            </p>
            <p className="text-muted mt-1 text-xs">
              {closed
                ? "Submitted bets settle normally."
                : canSubmit
                  ? "Choose from games that have not started."
                  : card.positions.length
                    ? "Follow your selections below."
                    : "Open your card for details."}
            </p>
            {hydrated && drafts.length ? (
              <p className="text-muted mt-1 text-xs">
                {drafts.length} unsubmitted{" "}
                {drafts.length === 1 ? "draft" : "drafts"}.{" "}
                {saved
                  ? "Saved on this device."
                  : "Device storage is unavailable."}{" "}
                Drafts never submit automatically.
              </p>
            ) : null}
          </div>
          <Link
            className={`${canSubmit ? "bg-registry hover:bg-registry-hover text-white" : "text-action"} inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold`}
            href={`/l/${context.leagueSlug}/${canSubmit ? "slate" : "card"}`}
          >
            {canSubmit
              ? drafts.length
                ? "Continue picks"
                : "Make picks"
              : "View card"}
          </Link>
        </section>
      );
    return (
      <section
        aria-label="Your weekly card"
        className="border-boundary bg-subtle rounded-lg border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            {closed ? "Submissions closed" : "Your weekly card"}
          </h2>
          <StatusBadge tone={card.positions.length ? "sealed" : "pending"}>
            {card.positions.length ? "Submitted" : "Not submitted"}
          </StatusBadge>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">
              {closed ? "Expired credits" : "Available to bet"}
            </dt>
            <dd className="mt-1 font-mono text-xl font-bold">
              {formatCredits(card.remainingCredits)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">In unsettled bets</dt>
            <dd className="mt-1 font-mono text-xl font-bold">
              {formatCredits(
                unsettled.reduce(
                  (sum, position) => sum + position.stakeCredits,
                  0,
                ),
              )}
            </dd>
          </div>
        </dl>
        <p className="text-graphite mt-3 text-sm">
          {card.positions.length} submitted{" "}
          {card.positions.length === 1 ? "bet" : "bets"} ·{" "}
          {formatCredits(card.allocatedCredits)} credits committed. Submitted
          bets cannot be changed.
        </p>
        {!closed && deadline ? (
          <p className="mt-2 text-sm">
            Each game closes at kickoff. Unused credits expire{" "}
            <time dateTime={deadline}>{easternTime(deadline)}</time>.
          </p>
        ) : null}
        {!closed && card.remainingCredits > 0 && card.remainingCredits < 50 ? (
          <p className="text-graphite mt-2 text-sm">
            The remaining {card.remainingCredits} credits cannot fund the
            50-credit minimum and will expire.
          </p>
        ) : null}
        {hydrated && drafts.length ? (
          <p className="text-graphite mt-2 text-sm">
            {drafts.length} unsubmitted{" "}
            {drafts.length === 1 ? "draft" : "drafts"} ·{" "}
            {formatCredits(
              drafts.reduce((sum, draft) => sum + draft.stakeCredits, 0),
            )}{" "}
            draft credits.{" "}
            {saved
              ? "Saved on this device."
              : "Keep this page open; device storage is unavailable."}{" "}
            Drafts never submit automatically.
          </p>
        ) : null}
        {closed && !card.positions.length ? (
          <p className="text-graphite mt-2 text-sm">
            No bets were submitted. The missed-week result follows this week’s
            rules.
          </p>
        ) : null}
        {canSubmit && !onSlatePage ? (
          <Link
            className="bg-registry hover:bg-registry-hover mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-center font-semibold text-white sm:w-auto"
            href={`/l/${context.leagueSlug}/slate`}
          >
            {drafts.length
              ? "Continue picks"
              : card.positions.length
                ? "Add more bets"
                : "Make picks"}
          </Link>
        ) : null}
      </section>
    );
  }
  if (sealed && presentation === "matchup")
    return (
      <details className="border-boundary rounded-lg border px-4">
        <summary className="text-action min-h-11 cursor-pointer py-3 text-sm font-semibold">
          Your card is sealed · View details
        </summary>
        <div className="pb-4">
          <SealedCardSummary
            leagueSlug={context.leagueSlug}
            lockAt={context.week.commonLockAt}
            credits={context.ownerCard.allocatedCredits}
          />
        </div>
      </details>
    );
  if (sealed)
    return (
      <SealedCardSummary
        leagueSlug={context.leagueSlug}
        lockAt={context.week.commonLockAt}
        credits={context.ownerCard.allocatedCredits}
        onCardPage={onCardPage}
      />
    );
  const allocated = drafts.reduce((sum, draft) => sum + draft.stakeCredits, 0);
  const action =
    status === "Ready to review"
      ? "Review card"
      : drafts.length
        ? "Continue card"
        : "Make picks";
  const href = `/l/${context.leagueSlug}/${status === "Ready to review" ? "slate?review=1" : "slate"}`;
  if (onSlatePage && !closed) {
    return (
      <section
        aria-label="Your weekly card"
        className="border-boundary border-b pb-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge tone="pending">
            {hydrated ? status : "Checking your card…"}
          </StatusBadge>
          {hydrated ? (
            <p className="font-mono text-[.9375rem] leading-5 font-semibold">
              {formatCredits(context.ownerCard.grantedCredits - allocated)} left
            </p>
          ) : null}
        </div>
        <p className="mt-1 text-sm font-semibold">
          Seal by ·{" "}
          <time dateTime={context.week.commonLockAt}>
            {easternTime(context.week.commonLockAt)}
          </time>
        </p>
        <p className="text-graphite mt-1 text-sm leading-5">
          {!saved
            ? "Draft not saved on this device. Keep this page open to avoid losing it."
            : drafts.length
              ? "Draft saved on this device."
              : "Drafts stay on this device."}
        </p>
      </section>
    );
  }
  return (
    <section
      aria-label="Your weekly card"
      className="border-boundary bg-subtle rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          {closed ? "Picks closed" : "Your weekly card"}
        </h2>
        <StatusBadge tone={status === "Incomplete" ? "negative" : "pending"}>
          {closed && status !== "Incomplete"
            ? "Closed"
            : hydrated
              ? status
              : "Checking your card…"}
        </StatusBadge>
      </div>
      {hydrated ? (
        <p className="mt-2 font-mono text-lg font-bold tabular-nums">
          {formatCredits(allocated)}{" "}
          <span className="text-muted text-base">
            / {formatCredits(context.ownerCard.grantedCredits)} allocated
          </span>
        </p>
      ) : null}
      <p className="mt-2 text-sm font-semibold">
        {closed ? "Deadline passed" : "Seal by"} ·{" "}
        <time dateTime={context.week.commonLockAt}>
          {easternTime(context.week.commonLockAt)}
        </time>
      </p>
      <p className="text-graphite mt-1 text-sm leading-5">
        {status === "Incomplete"
          ? "This card was not sealed by the deadline. Its missed-week result follows this season’s rules."
          : closed
            ? "This draft was not sealed by the deadline. It cannot be submitted; the weekly result will confirm the consequence."
            : drafts.length
              ? saved
                ? "Draft saved on this device. Seal your card to submit it."
                : "Draft not saved on this device. Keep this page open to avoid losing it."
              : "Choose a side to start. Drafts stay on this device."}
      </p>
      {!closed && !onSlatePage && hydrated ? (
        <Link
          className="bg-registry hover:bg-registry-hover mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-center font-semibold text-white sm:w-auto"
          href={href}
        >
          {action}
        </Link>
      ) : null}
    </section>
  );
}
