"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** An exception link opens its containing controls and focuses the disclosure.
 * Disclosure alone never fetches data or invokes a command. */
export function CommissionerDisclosure({
  id,
  title,
  children,
  open = false,
}: {
  id: string;
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function reveal() {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!target || !ref.current?.contains(target)) return;
      ref.current.open = true;
      if (target === ref.current) {
        ref.current.querySelector("summary")?.focus({ preventScroll: true });
        ref.current.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    // Repeated links to the current hash must also reopen the controls.
    function clicked(event: MouseEvent) {
      const link =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (link?.getAttribute("href") === window.location.hash) reveal();
    }
    document.addEventListener("click", clicked);
    return () => {
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", clicked);
    };
  }, []);
  return (
    <details
      ref={ref}
      id={id}
      open={open}
      className="border-boundary bg-surface mt-5 scroll-mt-28 rounded-xl border p-5"
    >
      <summary className="min-h-11 cursor-pointer content-center font-bold">
        {title}
      </summary>
      <div className="mt-4 space-y-5">{children}</div>
    </details>
  );
}
