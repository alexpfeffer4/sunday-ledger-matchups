"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { InterfaceIcon } from "@/components/ui/interface-icon";

export function Dialog({
  children,
  description,
  footer,
  onClose,
  open,
  returnFocusRef,
  title,
  variant = "dialog",
}: {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title: string;
  variant?: "dialog" | "sheet";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      titleRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) return;
    const focusTarget = returnFocusRef?.current ?? previousFocus.current;
    focusTarget?.focus();
  }, [open, returnFocusRef]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={`phase5-dialog ${variant === "sheet" ? "phase5-dialog-sheet" : ""} m-0 max-h-none max-w-none p-0`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
    >
      <div className="flex max-h-[inherit] min-h-0 flex-col">
        <header className="border-boundary flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              className="text-xl leading-7 font-bold break-words outline-none"
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
            >
              {title}
            </h2>
            {description ? (
              <p
                className="text-graphite mt-2 text-sm leading-6"
                id={descriptionId}
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button
            aria-label="Close dialog"
            className="size-11 shrink-0 rounded-full p-0"
            intent="quiet"
            onClick={onClose}
            type="button"
          >
            <InterfaceIcon name="close" />
          </Button>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer ? (
          <footer className="phase5-dialog-footer border-boundary bg-surface shrink-0 border-t px-5 pt-4 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

export function ConfirmDialog({
  action,
  confirmLabel,
  consequence,
  description,
  destination,
  errorMessage,
  hiddenFields,
  intent = "destructive",
  onClose,
  open,
  pending,
  returnFocusRef,
  reversibility,
  target,
  title,
}: {
  action: (formData: FormData) => void;
  confirmLabel: string;
  consequence: string;
  description: string;
  destination: string;
  errorMessage?: string;
  hiddenFields: Record<string, string>;
  intent?: "primary" | "destructive";
  onClose: () => void;
  open: boolean;
  pending: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  reversibility: string;
  target: string;
  title: string;
}) {
  const formId = useId();

  return (
    <Dialog
      description={description}
      onClose={onClose}
      open={open}
      returnFocusRef={returnFocusRef}
      title={title}
      footer={
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            disabled={pending}
            intent="secondary"
            onClick={onClose}
            type="button"
          >
            Keep things as they are
          </Button>
          <Button
            disabled={pending}
            form={formId}
            intent={intent}
            type="submit"
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <form action={action} id={formId}>
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} name={name} type="hidden" value={value} />
        ))}
        <dl className="space-y-4 text-sm leading-6">
          {[
            ["Target", target],
            ["What changes", consequence],
            ["Can it be reversed?", reversibility],
            ["Where you go next", destination],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-bold">{label}</dt>
              <dd className="text-graphite mt-1">{value}</dd>
            </div>
          ))}
        </dl>
        {errorMessage ? (
          <p
            className="border-negative/30 bg-negative/10 text-negative mt-5 rounded-lg border px-4 py-3 text-sm leading-6"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
