"use client";

import { useEffect, useState } from "react";

// This countdown is guidance; Supabase remains the rate-limit authority.
export function useResendCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  const secondsRemaining = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (!secondsRemaining) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [secondsRemaining]);
  function start(seconds?: number) {
    if (!seconds) return;
    const requestedAt = Date.now();
    setNow(requestedAt);
    setUntil(requestedAt + seconds * 1000);
  }
  return { secondsRemaining, start };
}
