import Link from "next/link";
import type { AppActionState } from "@/application/actions/action-state";
import { Alert } from "@/components/ui/alert";

export function ActionFeedback({ state }: { state: AppActionState }) {
  if (state.status === "idle") return null;
  return (
    <Alert
      announce
      className="mt-3"
      tone={state.status === "success" ? "success" : "error"}
    >
      <p>{state.message}</p>
      {state.value ? (
        <p className="mt-2 font-mono text-xs break-all text-[var(--ink)]">
          {state.value}
        </p>
      ) : null}
      {state.href && state.hrefLabel ? (
        <Link
          className="mt-2 inline-flex font-semibold underline"
          href={state.href}
        >
          {state.hrefLabel}
        </Link>
      ) : null}
    </Alert>
  );
}
