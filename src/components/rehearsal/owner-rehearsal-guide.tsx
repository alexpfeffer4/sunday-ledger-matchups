"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  advanceOwnerRehearsalAction,
  fillOwnerRehearsalBotsAction,
  resetOwnerRehearsalAction,
  startOwnerRehearsalAction,
  useOwnerRehearsalSampleCardAction,
} from "@/app/owner/rehearsal/actions";
import {
  initialAppActionState,
  type AppActionState,
} from "@/application/actions/action-state";
import type { OwnerRehearsalSummary } from "@/application/queries/get-owner-rehearsal";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { Button, buttonClassName } from "@/components/ui/button";
import { ownerRehearsalGuide } from "@/domain/rehearsal/owner-rehearsal";

function prepareOperation(
  event: FormEvent<HTMLFormElement>,
  storageKey: string,
) {
  const field = event.currentTarget.elements.namedItem("operationId");
  if (!(field instanceof HTMLInputElement)) return;
  try {
    const stored = localStorage.getItem(storageKey);
    const operationId = stored ?? crypto.randomUUID();
    localStorage.setItem(storageKey, operationId);
    field.value = operationId;
  } catch {
    field.value ||= crypto.randomUUID();
  }
}

function OperationForm({
  action,
  children,
  className,
  operationName,
}: {
  action: (payload: FormData) => void;
  children: ReactNode;
  className?: string;
  operationName: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) =>
        prepareOperation(
          event,
          `sunday-ledger:owner-rehearsal:v1:${operationName}`,
        )
      }
    >
      <input name="operationId" type="hidden" />
      {children}
    </form>
  );
}

function useClearCompletedOperation(
  state: AppActionState,
  operationName: string,
) {
  useEffect(() => {
    if (state.status !== "success") return;
    try {
      localStorage.removeItem(
        `sunday-ledger:owner-rehearsal:v1:${operationName}`,
      );
    } catch {
      // Stable recovery still works for the current submission without storage.
    }
  }, [operationName, state.status]);
}

export function OwnerRehearsalGuide({
  rehearsal,
  showReset = false,
}: {
  rehearsal: OwnerRehearsalSummary | null;
  showReset?: boolean;
}) {
  const [startState, startAction, starting] = useActionState(
    startOwnerRehearsalAction,
    initialAppActionState,
  );
  const [fillState, fillAction, filling] = useActionState(
    fillOwnerRehearsalBotsAction,
    initialAppActionState,
  );
  const [sampleState, sampleAction, sampling] = useActionState(
    useOwnerRehearsalSampleCardAction,
    initialAppActionState,
  );
  const [advanceState, advanceAction, advancing] = useActionState(
    advanceOwnerRehearsalAction,
    initialAppActionState,
  );
  const [resetState, resetAction, resetting] = useActionState(
    resetOwnerRehearsalAction,
    initialAppActionState,
  );

  const generation = rehearsal?.generation ?? 0;
  const checkpoint = rehearsal?.checkpoint ?? "not-started";
  useClearCompletedOperation(startState, `start:${generation}`);
  useClearCompletedOperation(fillState, `fill:${generation}`);
  useClearCompletedOperation(sampleState, `sample:${generation}:${checkpoint}`);
  useClearCompletedOperation(
    advanceState,
    `advance:${generation}:${checkpoint}`,
  );
  useClearCompletedOperation(resetState, `reset:${generation}`);

  if (!rehearsal) {
    return (
      <section
        aria-labelledby="owner-rehearsal-start-title"
        className="border-registry bg-surface rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-6"
      >
        <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
          Owner rehearsal · Simulated data
        </p>
        <h2
          className="mt-2 text-2xl font-bold tracking-[-0.03em]"
          id="owner-rehearsal-start-title"
        >
          Practice one complete season
        </h2>
        <p className="text-graphite mt-3 max-w-2xl leading-7">
          Start one private 10-member rehearsal. It does not appear in Your
          leagues, does not contact real people, and cannot affect Live records.
        </p>
        <OperationForm
          action={startAction}
          className="mt-5"
          operationName={`start:${generation}`}
        >
          <Button disabled={starting} type="submit">
            {starting ? "Starting…" : "Start guided rehearsal"}
          </Button>
        </OperationForm>
        <ActionFeedback state={startState} />
      </section>
    );
  }

  const step = ownerRehearsalGuide[rehearsal.checkpoint];
  const openWeek = rehearsal.checkpoint.endsWith("_OPEN");
  const cardNeeded = openWeek && !rehearsal.ownerCardSealed;
  const percent = Math.round(
    (rehearsal.checkpointOrdinal / rehearsal.totalCheckpoints) * 100,
  );
  const manualFirst = rehearsal.currentWeek === 1;

  return (
    <section
      aria-labelledby="owner-rehearsal-guide-title"
      className="border-registry/45 bg-surface rounded-xl border p-4 shadow-[var(--shadow-card)] sm:p-5"
      data-owner-rehearsal-guide
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
              Guided rehearsal
            </p>
            <span className="border-control text-muted rounded-full border px-2.5 py-1 text-xs font-semibold">
              {step.task}
            </span>
          </div>
          <h2
            className="mt-2 text-lg font-bold tracking-[-0.02em] sm:text-xl"
            id="owner-rehearsal-guide-title"
          >
            {step.title}
          </h2>
        </div>
        <p className="text-muted shrink-0 text-xs font-semibold">
          {rehearsal.checkpointOrdinal} of {rehearsal.totalCheckpoints}
        </p>
      </div>

      <div
        aria-label={`${percent}% of rehearsal complete`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="bg-subtle mt-4 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className="bg-registry h-full rounded-full motion-safe:transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-ink mt-4 text-sm leading-6 font-semibold">
        {step.action}
      </p>
      <p className="text-graphite mt-1 max-w-3xl text-sm leading-6">
        {step.detail}
      </p>

      {rehearsal.checkpoint === "FORMATION_EMPTY" ? (
        <div className="mt-4">
          <p className="text-muted mb-3 text-xs font-semibold">
            1 owner seat filled · 9 rehearsal seats open
          </p>
          <OperationForm
            action={fillAction}
            operationName={`fill:${generation}`}
          >
            <Button disabled={filling} type="submit">
              {filling ? "Filling seats…" : "Fill with rehearsal teams"}
            </Button>
          </OperationForm>
        </div>
      ) : null}

      {cardNeeded ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {step.href && step.linkLabel ? (
            <Link
              className={buttonClassName({
                intent: manualFirst ? "primary" : "secondary",
              })}
              href={step.href(rehearsal.leagueSlug)}
            >
              {step.linkLabel}
            </Link>
          ) : null}
          <OperationForm
            action={sampleAction}
            operationName={`sample:${generation}:${checkpoint}`}
          >
            <Button
              disabled={sampling}
              intent={manualFirst ? "secondary" : "primary"}
              type="submit"
            >
              {sampling ? "Sealing sample…" : "Use a sample card"}
            </Button>
          </OperationForm>
        </div>
      ) : step.href && step.linkLabel ? (
        <Link
          className="text-action mt-3 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
          href={step.href(rehearsal.leagueSlug)}
        >
          {step.linkLabel}
        </Link>
      ) : null}

      {step.advanceLabel ? (
        <OperationForm
          action={advanceAction}
          className="border-boundary mt-4 border-t pt-4"
          operationName={`advance:${generation}:${checkpoint}`}
        >
          <input
            name="expectedCheckpoint"
            type="hidden"
            value={rehearsal.checkpoint}
          />
          {step.confirmation ? (
            <label className="mb-3 flex cursor-pointer items-start gap-3 text-sm leading-6">
              <input
                className="mt-1 size-4 shrink-0 accent-[var(--brand-primary)]"
                name="confirmed"
                required
                type="checkbox"
              />
              <span>{step.confirmation}</span>
            </label>
          ) : null}
          <Button disabled={advancing || cardNeeded} type="submit">
            {advancing ? "Advancing…" : step.advanceLabel}
          </Button>
          {cardNeeded ? (
            <p className="text-muted mt-2 text-xs leading-5">
              This becomes available after your card is sealed.
            </p>
          ) : null}
        </OperationForm>
      ) : null}

      <ActionFeedback state={fillState} />
      <ActionFeedback state={sampleState} />
      <ActionFeedback state={advanceState} />

      {showReset ? (
        <details className="border-boundary mt-5 border-t pt-4">
          <summary className="text-muted hover:text-ink inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold">
            Reset rehearsal
          </summary>
          <div className="max-w-xl pb-1">
            <p className="text-graphite text-sm leading-6">
              This retires only “{rehearsal.leagueName}” and preserves its
              immutable simulated audit trail. It cannot target a Live, Example,
              or ordinary Simulation league.
            </p>
            <OperationForm
              action={resetAction}
              className="mt-4"
              operationName={`reset:${generation}`}
            >
              <label
                className="text-sm font-semibold"
                htmlFor="owner-rehearsal-confirmation"
              >
                Type {rehearsal.leagueName} to confirm
              </label>
              <input
                autoComplete="off"
                className="border-control bg-canvas text-ink focus:border-registry focus:ring-registry/20 mt-2 min-h-11 w-full rounded-lg border px-3 focus:ring-4 focus:outline-none"
                id="owner-rehearsal-confirmation"
                name="confirmationName"
                required
                type="text"
              />
              <Button
                className="mt-3"
                disabled={resetting}
                intent="destructive"
                type="submit"
              >
                {resetting ? "Resetting…" : "Reset simulated rehearsal"}
              </Button>
            </OperationForm>
            <ActionFeedback state={resetState} />
          </div>
        </details>
      ) : null}
    </section>
  );
}
