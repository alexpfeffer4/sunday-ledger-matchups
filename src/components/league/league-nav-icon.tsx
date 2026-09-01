import type { ReactNode } from "react";

export type LeagueNavIconName =
  | "account"
  | "card"
  | "commissioner"
  | "history"
  | "league"
  | "live"
  | "matchup"
  | "more"
  | "playoffs"
  | "rules"
  | "schedule"
  | "slate"
  | "standings";

const iconPaths: Record<LeagueNavIconName, ReactNode> = {
  account: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  card: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M7.5 9h9M7.5 13h5" />
    </>
  ),
  commissioner: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  history: (
    <>
      <path d="M4.5 9A8 8 0 1 1 4 14" />
      <path d="M4.5 4.5V9H9M12 8v4l2.5 1.5" />
    </>
  ),
  league: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 16a4 4 0 0 1 6.5 3" />
    </>
  ),
  live: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  matchup: (
    <>
      <circle cx="7" cy="12" r="3" />
      <circle cx="17" cy="12" r="3" />
      <path d="M10 12h4" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  playoffs: (
    <>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4ZM9 19h6M12 11v8" />
      <path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4" />
    </>
  ),
  rules: (
    <>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H11v16H7.5A2.5 2.5 0 0 0 5 21.5v-16ZM19 5.5A2.5 2.5 0 0 0 16.5 3H13v16h3.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
    </>
  ),
  schedule: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 9h16M8 13h2M14 13h2M8 17h2" />
    </>
  ),
  slate: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </>
  ),
  standings: (
    <>
      <path d="M5 20V11h4v9M10 20V4h4v16M15 20v-6h4v6M3 20h18" />
    </>
  ),
};

export function LeagueNavIcon({
  name,
  className = "size-5",
}: {
  name: LeagueNavIconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
    >
      {iconPaths[name]}
    </svg>
  );
}
