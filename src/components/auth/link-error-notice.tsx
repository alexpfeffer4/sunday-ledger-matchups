"use client";

import { useEffect, useRef } from "react";

export function LinkErrorNotice() {
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
      That email link is invalid or expired. Request a fresh link below.
    </div>
  );
}
