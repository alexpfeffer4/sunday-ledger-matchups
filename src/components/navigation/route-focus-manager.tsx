"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function findRouteTarget() {
  return (
    document.querySelector<HTMLElement>("[data-route-heading]") ??
    document.querySelector<HTMLElement>("main h1") ??
    document.querySelector<HTMLElement>("main")
  );
}

function focusRouteTarget(target: HTMLElement) {
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus();
}

export function RouteFocusManager() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const previousTarget = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let navigationFrame: number | undefined;
    document.documentElement.dataset.routeFocusReady = "true";

    const waitForDestination = (
      destinationPathname: string,
      departingTarget: HTMLElement | null,
      departingText: string | null | undefined,
    ) => {
      if (navigationFrame !== undefined)
        window.cancelAnimationFrame(navigationFrame);
      const deadline = window.performance.now() + 3_000;

      const check = () => {
        navigationFrame = undefined;
        const target = findRouteTarget();
        const destinationReady =
          window.location.pathname === destinationPathname &&
          target &&
          (target !== departingTarget || target.textContent !== departingText);

        if (destinationReady) {
          previousPathname.current = destinationPathname;
          previousTarget.current = target;
          focusRouteTarget(target);
          return;
        }
        if (window.performance.now() < deadline)
          navigationFrame = window.requestAnimationFrame(check);
      };

      navigationFrame = window.requestAnimationFrame(check);
    };

    const handleClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.download || anchor.target === "_blank") return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      )
        return;

      const departingTarget = findRouteTarget();
      waitForDestination(
        destination.pathname,
        departingTarget,
        departingTarget?.textContent,
      );
    };

    const handlePopState = () => {
      const departingTarget = findRouteTarget();
      waitForDestination(
        window.location.pathname,
        departingTarget,
        departingTarget?.textContent,
      );
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      if (navigationFrame !== undefined)
        window.cancelAnimationFrame(navigationFrame);
      delete document.documentElement.dataset.routeFocusReady;
    };
  }, []);

  useEffect(() => {
    if (pathname === previousPathname.current) {
      previousTarget.current = findRouteTarget();
      return;
    }

    const departingTarget = previousTarget.current;
    const departingText = departingTarget?.textContent;
    let frame: number | undefined;
    let timeout: number | undefined;

    const focusDestination = () => {
      const target = findRouteTarget();
      if (
        !target ||
        (target === departingTarget && target.textContent === departingText)
      )
        return false;

      previousPathname.current = pathname;
      previousTarget.current = target;
      focusRouteTarget(target);
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
