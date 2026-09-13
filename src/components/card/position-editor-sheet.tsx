"use client";

import { useEffect, useId, useRef } from "react";
import {
  OutcomeSelector,
  type OutcomeSelectorOption,
} from "@/components/card/outcome-selector";
import { formatCredits } from "@/domain/odds/american";
import { PickReturn, ReturnExplanation } from "@/components/card/pick-return";
import { useEditorViewport } from "@/components/card/use-editor-viewport";

export function PositionEditorSheet({
  americanOdds = null,
  confirmLabel,
  context,
  error,
  helper,
  maximumStakeCredits,
  minimumStakeCredits,
  onClose,
  onSelectOutcome,
  onStakeChange,
  onSubmit,
  open,
  outcomes,
  remainingCredits,
  selectedOutcomeId,
  stakeCredits,
  title,
}: {
  americanOdds?: number | null;
  confirmLabel: string;
  context: string;
  error: string | null;
  helper: string;
  maximumStakeCredits: number | null;
  minimumStakeCredits: number;
  onClose: () => void;
  onSelectOutcome: (id: string) => void;
  onStakeChange: (value: string) => void;
  onSubmit: () => void;
  open: boolean;
  outcomes: readonly OutcomeSelectorOption[];
  remainingCredits: number;
  selectedOutcomeId: string | null;
  stakeCredits: string;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const contextId = useId();
  const inputId = useId();
  const errorId = useId();
  useEditorViewport(open, dialogRef, bodyRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      // showModal is synchronous. Deferring focus can interrupt typing that
      // starts immediately after the native dialog has already focused its heading.
      headingRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open && error) inputRef.current?.focus();
  }, [error, open]);

  function closeEditor() {
    const returnTarget = returnFocusRef.current;
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
    returnTarget?.focus();
  }

  return (
    <dialog
      aria-describedby={contextId}
      aria-labelledby={titleId}
      className="practice-position-dialog m-0 max-w-none p-0"
      onCancel={(event) => {
        event.preventDefault();
        closeEditor();
      }}
      ref={dialogRef}
    >
      <form
        className="flex max-h-[inherit] min-h-0 flex-col"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
          // Both consumers validate with the shared rules before closing. Keep
          // repeated invalid submissions on the field, even if the error text
          // is unchanged and React does not rerun the error effect.
          if (dialogRef.current?.open) inputRef.current?.focus();
        }}
      >
        <header className="border-boundary flex shrink-0 items-center justify-between gap-3 border-b px-[16px] py-[8px] sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              className="text-xl font-bold outline-none"
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
            >
              {title}
            </h2>
          </div>
          <button
            aria-label="Close pick editor"
            className="border-control bg-surface hover:bg-subtle flex size-[44px] shrink-0 items-center justify-center rounded-lg border text-xl"
            onClick={closeEditor}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div
          ref={bodyRef}
          className="practice-position-dialog-body min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6"
        >
          <p className="text-graphite mb-3 text-sm" id={contextId}>
            {context}
          </p>
          <OutcomeSelector
            label={`${title} outcomes`}
            onSelect={onSelectOutcome}
            options={outcomes}
            selectedId={selectedOutcomeId}
          />

          <div className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <label className="text-sm font-semibold" htmlFor={inputId}>
                Stake in credits
              </label>
              <span className="text-graphite text-sm">
                {formatCredits(remainingCredits)} available
              </span>
            </div>
            <div className="practice-stake-field border-control bg-surface focus-within:border-registry mt-2 flex min-h-12 items-center rounded-lg border">
              <input
                aria-describedby={`${inputId}-copy${error ? ` ${errorId}` : ""}`}
                aria-invalid={Boolean(error)}
                className="min-h-12 min-w-0 flex-1 bg-transparent px-4 font-mono text-base font-semibold outline-none"
                disabled={!selectedOutcomeId}
                id={inputId}
                inputMode="numeric"
                max={maximumStakeCredits ?? undefined}
                min={minimumStakeCredits}
                onChange={(event) => onStakeChange(event.currentTarget.value)}
                ref={inputRef}
                step={1}
                type="number"
                value={stakeCredits}
              />
              <span className="text-muted pr-4 text-sm">credits</span>
            </div>
            <p className="text-graphite mt-2 text-sm" id={`${inputId}-copy`}>
              {helper}
            </p>
            {error ? (
              <p
                className="border-negative text-negative mt-3 border-l-2 pl-3 text-sm font-semibold"
                id={errorId}
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <details className="border-boundary mt-3 border-t">
              <summary className="text-action min-h-11 cursor-pointer py-3 text-sm font-semibold">
                How returns work
              </summary>
              {americanOdds !== null && selectedOutcomeId ? (
                <PickReturn
                  stakeCredits={Number(stakeCredits)}
                  americanOdds={americanOdds}
                />
              ) : null}
              <div className="mt-3 pb-3">
                <ReturnExplanation />
              </div>
            </details>
          </div>
        </div>

        <footer className="practice-position-dialog-footer border-boundary bg-surface shrink-0 space-y-[8px] border-t px-[16px] pt-[8px] sm:px-6">
          {americanOdds !== null && selectedOutcomeId ? (
            <PickReturn
              compact
              showBreakdown={false}
              stakeCredits={Number(stakeCredits)}
              americanOdds={americanOdds}
            />
          ) : null}
          <button
            className="bg-registry hover:bg-registry-hover min-h-[48px] w-full rounded-lg px-[20px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedOutcomeId}
            type="submit"
          >
            {confirmLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
