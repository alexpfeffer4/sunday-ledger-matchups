"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function RouteFocusManager() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (pathname === previousPathname.current) return;

    const frame = window.requestAnimationFrame(() => {
      previousPathname.current = pathname;
      const target = document.querySelector<HTMLElement>(
        "[data-route-heading], main h1, main",
      );
      if (!target) return;
      if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
