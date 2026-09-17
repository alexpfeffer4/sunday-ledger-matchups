"use client";

export const kickoffFilterLabels = {
  ALL: "All games",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN_EARLY: "Sun early",
  SUN_LATE: "Sun late",
  SUN_NIGHT: "Sun night",
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
} as const;

export type KickoffFilter = keyof typeof kickoffFilterLabels;

export function PickFilters({
  availableFilters,
  activeKickoffFilter,
  marketView,
  propsEnabled,
  invalid,
  select,
}: {
  availableFilters: KickoffFilter[];
  activeKickoffFilter: string;
  marketView: string;
  propsEnabled: boolean;
  invalid: boolean;
  select: (name: string, value: string) => void;
}) {
  return (
    <>
      {" "}
      {invalid ? (
        <p role="status" className="text-muted text-sm">
          A saved or linked filter is unavailable for this week. Showing the
          available default.
        </p>
      ) : null}
      <nav
        aria-label="Filter games by kickoff"
        className="flex flex-wrap gap-2"
      >
        {availableFilters.map((filter) => (
          <button
            aria-pressed={activeKickoffFilter === filter}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
              activeKickoffFilter === filter
                ? "border-registry bg-registry text-white"
                : "border-control bg-surface hover:border-registry"
            }`}
            key={filter}
            onClick={() => select("day", filter)}
            type="button"
          >
            {kickoffFilterLabels[filter]}
          </button>
        ))}
      </nav>
      {propsEnabled ? (
        <div
          aria-label="Bet type"
          className="border-boundary bg-surface grid grid-cols-2 rounded-lg border p-1"
        >
          {(["GAME", "PLAYER"] as const).map((view) => (
            <button
              type="button"
              key={view}
              aria-pressed={marketView === view}
              className={`min-h-11 rounded-md px-3 text-sm font-semibold ${marketView === view ? "bg-registry text-white" : "text-graphite hover:bg-subtle"}`}
              onClick={() => select("type", view)}
            >
              {view === "GAME" ? "Game lines" : "Player props"}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
