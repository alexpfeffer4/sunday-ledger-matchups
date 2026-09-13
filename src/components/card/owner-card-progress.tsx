"use client";

import Link from "next/link";
import { easternTime } from "@/application/queries/score-freshness";
import type { OwnerCardContext } from "@/components/card/owner-card-context";
import {
  useCardDeadline,
  useCardDraft,
} from "@/components/card/use-card-draft";
import { StatusBadge } from "@/components/ui/status-badge";
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
}: {
  context: OwnerCardContext;
  onCardPage?: boolean;
  onSlatePage?: boolean;
}) {
  const { drafts, hydrated, saved, sealed, status } = useCardDraft(context);
  const closed = useCardDeadline(context);
  if (!context.week || !context.ownerCard) return null;
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
