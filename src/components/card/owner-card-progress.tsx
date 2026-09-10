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

export function OwnerCardProgress({
  context,
  onCardPage = false,
}: {
  context: OwnerCardContext;
  onCardPage?: boolean;
}) {
  const { drafts, hydrated, saved, sealed, status } = useCardDraft(context);
  const closed = useCardDeadline(context);
  if (!context.week || !context.ownerCard) return null;
  const allocated = sealed
    ? context.ownerCard.allocatedCredits
    : drafts.reduce((sum, draft) => sum + draft.stakeCredits, 0);
  const action = sealed
    ? "View card"
    : status === "Ready to review"
      ? "Review card"
      : drafts.length
        ? "Continue card"
        : "Make picks";
  const href = `/l/${context.leagueSlug}/${sealed ? "card" : status === "Ready to review" ? "slate?review=1" : "slate"}`;
  return (
    <section
      aria-label="Your weekly card"
      className="border-boundary bg-subtle rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          {sealed
            ? "Card sealed"
            : closed
              ? "Picks closed"
              : "Your weekly card"}
        </h2>
        <StatusBadge
          tone={
            sealed ? "sealed" : status === "Incomplete" ? "negative" : "pending"
          }
        >
          {hydrated || sealed ? status : "Checking your card…"}
        </StatusBadge>
      </div>
      {hydrated || sealed ? (
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums">
          {formatCredits(allocated)}{" "}
          <span className="text-muted text-base">
            / {formatCredits(context.ownerCard.grantedCredits)}{" "}
            {sealed ? "sealed" : "allocated"}
          </span>
        </p>
      ) : null}
      <p className="mt-3 text-sm font-semibold">
        {closed ? "Deadline passed" : "Seal by"} ·{" "}
        <time dateTime={context.week.commonLockAt}>
          {easternTime(context.week.commonLockAt)}
        </time>
      </p>
      <p className="text-graphite mt-2 text-sm leading-6">
        {sealed
          ? "Your picks and receipts are saved. Sealed picks cannot be changed."
          : status === "Incomplete"
            ? "This card was not sealed by the deadline. Its missed-week result follows this season’s rules."
            : closed
              ? "This draft was not sealed by the deadline. It cannot be submitted; the weekly result will confirm the consequence."
              : drafts.length
                ? saved
                  ? "Draft saved on this device. It stays private until you seal it and each game starts."
                  : "Draft not saved on this device. Keep this page open to avoid losing it."
                : "Choose your picks and allocate all 1,000 credits. Drafts stay on the device where you create them."}
      </p>
      {(sealed && !onCardPage) || (!sealed && !closed && hydrated) ? (
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
