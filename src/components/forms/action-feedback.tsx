import Link from "next/link";
import type { AppActionState } from "@/application/actions/action-state";

export function ActionFeedback({ state }: { state: AppActionState }) {
  if (state.status === "idle") return null;
  return (
    <div
      className={`mt-3 rounded-lg border px-4 py-3 text-sm leading-6 ${
        state.status === "success"
          ? "border-positive/25 bg-positive/10 text-positive"
          : "border-negative/25 bg-negative/10 text-negative"
      }`}
      role={state.status === "error" ? "alert" : "status"}
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
    </div>
  );
}
