"use client";

import { useId, useState, type ReactNode } from "react";

export function CompletedGame({
  title,
  summary,
  children,
}: {
  title: ReactNode;
  summary: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="lineup-game-toggle"
        aria-expanded={!collapsed}
        aria-controls={id}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span>
          {title}
          <span className="text-muted mt-1 block text-xs font-normal">
            {summary}
          </span>
        </span>
        <span className="text-action text-xs">
          {collapsed ? "Show bets +" : "Hide bets −"}
        </span>
      </button>
      <div id={id} hidden={collapsed}>
        {children}
      </div>
    </>
  );
}
