"use client";

import { useState } from "react";
import type { AppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";

export function InviteLinkFeedback({ state }: { state: AppActionState }) {
  const [copied, setCopied] = useState(false);

  if (!state.value) return <ActionFeedback state={state} />;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(state.value ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="border-positive/25 bg-positive/10 text-positive mt-4 rounded-lg border p-4 text-sm"
      role="status"
    >
      <p>{state.message}</p>
      <label
        className="text-ink mt-3 block text-xs font-semibold"
        htmlFor="new-invite-link"
      >
        Private invitation link
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          className="border-control bg-surface text-ink min-h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-xs"
          id="new-invite-link"
          readOnly
          value={state.value}
        />
        <button
          className="border-registry text-registry hover:bg-subtle min-h-11 rounded-lg border px-4 text-sm font-semibold"
          onClick={copyLink}
          type="button"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="text-graphite mt-2 text-xs leading-5">
        If the response is interrupted, reload and repeat the unchanged action
        to recover this same link. A later new action creates a new link.
      </p>
    </div>
  );
}
