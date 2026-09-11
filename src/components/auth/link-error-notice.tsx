"use client";

import { useEffect, useRef } from "react";

export function LinkErrorNotice({ reason }: { reason?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="border-negative/25 bg-negative/10 text-negative mt-5 rounded-lg border px-4 py-3 text-sm leading-6"
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      {reason === "temporarily_unavailable"
        ? "Email verification is temporarily unavailable. Wait a minute, then reopen the same link. If it still fails, request a new email below."
        : reason === "browser_mismatch"
          ? "This email link could not find the browser session that requested it. Open the link in that same browser. If you cannot, request a new link below and open it in this browser."
          : "This email link could not be verified. It may have expired or already been used. Request a new link below, then open only the newest email in the same browser."}
    </div>
  );
}
