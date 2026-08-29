"use client";

import { useEffect, useId, useRef } from "react";
import {
  OutcomeSelector,
  type OutcomeSelectorOption,
} from "@/components/card/outcome-selector";

export function PositionEditorSheet({
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const contextId = useId();
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      requestAnimationFrame(() => headingRef.current?.focus());
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
    requestAnimationFrame(() => returnTarget?.focus());
  }

  return (
    <dialog
      aria-describedby={contextId}
      aria-labelledby={titleId}
      className="practice-position-dialog m-0 max-h-none max-w-none p-0"
      onCancel={(event) => {
        event.preventDefault();
        closeEditor();
      }}
      ref={dialogRef}
    >
      <form
        className="flex max-h-[inherit] min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <header className="border-boundary flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
              Edit pick
            </p>
            <h2
              className="mt-1 text-xl font-bold outline-none"
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
            >
              {title}
            </h2>
            <p className="text-graphite mt-1 text-sm" id={contextId}>
              {context}
            </p>
          </div>
          <button
            aria-label="Close pick editor"
            className="border-control bg-surface hover:bg-subtle flex size-11 shrink-0 items-center justify-center rounded-lg border text-xl"
            onClick={closeEditor}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <OutcomeSelector
            label={`${title} outcomes`}
            onSelect={onSelectOutcome}
            options={outcomes}
            selectedId={selectedOutcomeId}
          />

          <div className="mt-6">
            <div className="flex items-end justify-between gap-4">
              <label className="text-sm font-semibold" htmlFor={inputId}>
                Stake in credits
              </label>
              <span className="text-muted text-xs">
                {remainingCredits.toLocaleString()} available
              </span>
            </div>
            <div className="border-control bg-surface focus-within:border-registry mt-2 flex min-h-12 items-center rounded-lg border">
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
          </div>
        </div>

        <footer className="practice-position-dialog-footer border-boundary bg-surface shrink-0 border-t px-4 pt-4 sm:px-6">
          <button
            className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
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
