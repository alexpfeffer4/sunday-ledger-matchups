"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function StickyMatchupScore({ children }: { children: ReactNode }) {
  const marker = useRef<HTMLDivElement>(null);
  const score = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-league-header]");
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      const offset = header?.getBoundingClientRect().height ?? 0;
      score.current?.style.setProperty(
        "--matchup-header-offset",
        `${offset}px`,
      );
      observer?.disconnect();
      if (!marker.current || typeof IntersectionObserver === "undefined")
        return;
      observer = new IntersectionObserver(
        ([entry]) =>
          setCompact(
            !entry!.isIntersecting && entry!.boundingClientRect.top < offset,
          ),
        { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(marker.current);
    };
    observe();
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(observe);
    if (header) resize?.observe(header);
    return () => {
      observer?.disconnect();
      resize?.disconnect();
    };
  }, []);
  return (
    <>
      <div ref={marker} aria-hidden="true" className="h-px" />
      <div ref={score} className="matchup-sticky" data-compact={compact}>
        {children}
      </div>
    </>
  );
}
