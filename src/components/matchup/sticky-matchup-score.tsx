"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function StickyMatchupScore({
  children,
  summary,
}: {
  children: ReactNode;
  summary: ReactNode;
}) {
  const expanded = useRef<HTMLDivElement>(null);
  const score = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-league-header]");
    const summaryCard = score.current?.firstElementChild;
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      const scores =
        expanded.current?.querySelector(".matchup-score") ??
        expanded.current?.querySelector(".paired-scores");
      const offset = header?.getBoundingClientRect().height ?? 0;
      score.current?.style.setProperty(
        "--matchup-header-offset",
        `${offset}px`,
      );
      observer?.disconnect();
      if (!scores || typeof IntersectionObserver === "undefined") return;
      // A very tall summary would obscure the page at large text sizes.
      const fits =
        window.innerHeight > 480 &&
        (summaryCard?.getBoundingClientRect().height ?? 0) <
          (window.innerHeight - offset) * 0.4;
      observer = new IntersectionObserver(
        ([entry]) =>
          setCompact(
            fits &&
              !entry!.isIntersecting &&
              entry!.boundingClientRect.bottom <= offset,
          ),
        { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(scores);
    };
    observe();
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(observe);
    if (header) resize?.observe(header);
    if (summaryCard) resize?.observe(summaryCard);
    if (expanded.current) resize?.observe(expanded.current);
    window.addEventListener("resize", observe);
    return () => {
      observer?.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, []);
  return (
    <>
      <div
        ref={score}
        className="matchup-sticky"
        data-compact={compact}
        aria-hidden="true"
      >
        {summary}
      </div>
      <div ref={expanded} className="matchup-expanded">
        {children}
      </div>
    </>
  );
}
