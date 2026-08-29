"use client";

import { useId } from "react";

export type OutcomeSelectorOption = {
  id: string;
  accessibleLabel: string;
  primary: string;
  secondary: string;
  unavailableReason?: string;
};

export function OutcomeSelector({
  label,
  onSelect,
  options,
  selectedId,
}: {
  label: string;
  onSelect: (id: string) => void;
  options: readonly OutcomeSelectorOption[];
  selectedId: string | null;
}) {
  const groupId = useId();

  return (
    <div
      aria-labelledby={groupId}
      className="outcome-selector-group"
      role="group"
    >
      <p className="sr-only" id={groupId}>
        {label}
      </p>
      <div className="outcome-selector-grid grid gap-2">
        {options.map((option) => {
          const selected = selectedId === option.id;
          const unavailableId = `${groupId}-${option.id}-unavailable`;
          return (
            <button
              aria-describedby={
                option.unavailableReason ? unavailableId : undefined
              }
              aria-label={option.accessibleLabel}
              aria-pressed={selected}
              className={`relative flex min-h-20 min-w-0 flex-col justify-center rounded-lg border px-3 py-3 pr-10 text-left transition-colors ${
                selected
                  ? "border-registry bg-selected text-ink shadow-[inset_0_0_0_1px_var(--brand-primary)]"
                  : "border-control bg-surface text-ink hover:border-registry hover:bg-subtle"
              } disabled:border-boundary disabled:bg-subtle disabled:text-muted disabled:cursor-not-allowed`}
              disabled={Boolean(option.unavailableReason)}
              key={option.id}
              onClick={() => onSelect(option.id)}
              type="button"
            >
              <span className="block text-sm leading-5 font-semibold break-words">
                {option.primary}
              </span>
              <span className="mt-1 block font-mono text-xs leading-4">
                {option.secondary}
              </span>
              <span
                aria-hidden="true"
                className={`absolute top-3 right-3 flex size-5 items-center justify-center rounded-full text-xs font-black ${
                  selected
                    ? "bg-registry text-white"
                    : "border-boundary border text-transparent"
                }`}
              >
                ✓
              </span>
              {option.unavailableReason ? (
                <span
                  className="mt-2 block text-xs font-semibold"
                  id={unavailableId}
                >
                  Unavailable · {option.unavailableReason}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
