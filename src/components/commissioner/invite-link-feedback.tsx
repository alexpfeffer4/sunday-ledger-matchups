"use client";

import { useState } from "react";
import type { AppActionState } from "@/application/actions/action-state";
import { invitationToken } from "@/domain/leagues/invitation-token";
import { ActionFeedback } from "@/components/forms/action-feedback";

export function InviteLinkFeedback({ state }: { state: AppActionState }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const code = invitationToken(state.value);

  if (!state.value) return <ActionFeedback state={state} />;

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setCopyFailed(false);
    } catch {
      setCopied(null);
      setCopyFailed(true);
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
          onClick={() => copy(state.value ?? "")}
          type="button"
        >
          {copied === state.value ? "Link copied" : "Copy link"}
        </button>
      </div>
      {code ? (
        <>
          <label
            htmlFor="new-invite-code"
            className="text-ink mt-4 block text-xs font-semibold"
          >
            Private invitation code
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="new-invite-code"
              value={code}
              readOnly
              onFocus={(event) => event.target.select()}
              className="border-control bg-surface text-ink min-h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-base"
            />
            <button
              type="button"
              onClick={() => copy(code)}
              className="border-registry text-registry hover:bg-subtle min-h-11 rounded-lg border px-4 text-sm font-semibold"
            >
              {copied === code ? "Code copied" : "Copy invite code"}
            </button>
          </div>
          <p className="text-graphite mt-2 text-xs leading-5">
            Members can sign in, open Your leagues → Join a league, and paste
            this code or the full link. Both use the same expiration and member
            limit.
          </p>
        </>
      ) : null}
      {copyFailed ? (
        <p className="text-ink mt-2 text-xs">
          Copy was unavailable. Select the link or code above and copy it
          manually.
        </p>
      ) : null}
      <p className="text-graphite mt-2 text-xs leading-5">
        If the response is interrupted, reload and repeat the unchanged action
        to recover this same link. A later new action creates a new link.
      </p>
    </div>
  );
}
