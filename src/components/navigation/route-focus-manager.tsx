"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function RouteFocusManager() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const previousTarget = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.routeFocusReady = "true";
    return () => {
      delete document.documentElement.dataset.routeFocusReady;
    };
  }, []);

  useEffect(() => {
    const findTarget = () =>
      document.querySelector<HTMLElement>(
        "[data-route-heading], main h1, main",
      );

    if (pathname === previousPathname.current) {
      previousTarget.current = findTarget();
      return;
    }

    const departingTarget = previousTarget.current;
    let frame: number | undefined;
    let timeout: number | undefined;

    const focusDestination = () => {
      const target = findTarget();
      if (!target || target === departingTarget) return false;

      previousPathname.current = pathname;
      previousTarget.current = target;
      if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus();
      return true;
    };

    const observer = new MutationObserver(() => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        if (focusDestination()) observer.disconnect();
      });
    });

    if (!focusDestination()) {
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(() => observer.disconnect(), 3_000);
    }

    return () => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [pathname]);

  return null;
}
