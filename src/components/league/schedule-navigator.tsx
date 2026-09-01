"use client";

import { useMemo, useState } from "react";
import { formatCenticredits } from "@/domain/odds/american";

export type ScheduleMatchupRecord = {
  id: string;
  sideAName: string;
  sideBName: string;
  sideAScoreCenticredits: number | null;
  sideBScoreCenticredits: number | null;
  status: string;
  competition: string;
  currentMember: boolean;
  sideAWinner?: boolean;
  sideBWinner?: boolean;
};

export type ScheduleWeekRecord = {
  week: number;
  label: string;
  status: string;
  matchups: ScheduleMatchupRecord[];
};

function score(value: number | null): string {
  return value === null ? "—" : formatCenticredits(BigInt(value), true);
}

export function MatchupRow({ matchup }: { matchup: ScheduleMatchupRecord }) {
  return (
    <li
      aria-label={`${matchup.sideAName} ${score(matchup.sideAScoreCenticredits)}, ${matchup.sideBName} ${score(matchup.sideBScoreCenticredits)}, ${matchup.competition}, ${matchup.status}`}
      className={`grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
        matchup.currentMember
          ? "bg-registry/5 border-l-registry border-l-4"
          : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted text-xs font-bold tracking-[0.05em] uppercase">
            {matchup.competition}
          </p>
          {matchup.currentMember ? (
            <span className="border-registry/30 bg-registry/10 text-registry rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase">
              Your matchup
            </span>
          ) : null}
        </div>
        <dl className="mt-2 grid gap-2 text-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <dt
              className={`break-words ${matchup.sideAWinner ? "font-bold" : "font-semibold"}`}
            >
              {matchup.sideAName}
            </dt>
            <dd className="font-mono font-semibold">
              {score(matchup.sideAScoreCenticredits)}
            </dd>
          </div>
          <div className="border-boundary grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t pt-2">
            <dt
              className={`break-words ${matchup.sideBWinner ? "font-bold" : "font-semibold"}`}
            >
              {matchup.sideBName}
            </dt>
            <dd className="font-mono font-semibold">
              {score(matchup.sideBScoreCenticredits)}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-graphite text-xs font-bold sm:text-right">
        {matchup.status}
      </p>
    </li>
  );
}

export function ScheduleNavigator({
  initialWeek,
  weeks,
}: {
  initialWeek: number;
  weeks: ScheduleWeekRecord[];
}) {
  const availableWeeks = useMemo(
    () => [...weeks].sort((left, right) => left.week - right.week),
    [weeks],
  );
  const fallbackWeek = availableWeeks[0]?.week ?? initialWeek;
  const [selectedWeek, setSelectedWeek] = useState(
    availableWeeks.some((week) => week.week === initialWeek)
      ? initialWeek
      : fallbackWeek,
  );

  const selectedIndex = availableWeeks.findIndex(
    (week) => week.week === selectedWeek,
  );
  const selected = availableWeeks[selectedIndex];

  if (!selected) return null;

  return (
    <section aria-labelledby="selected-schedule-week" className="mt-6">
      <div className="border-boundary bg-surface flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <label className="min-w-[10rem] flex-1" htmlFor="schedule-week">
          <span className="text-muted block text-xs font-bold uppercase">
            Selected week
          </span>
          <select
            className="border-control bg-surface mt-1 min-h-12 w-full rounded-lg border px-3 text-sm font-semibold"
            id="schedule-week"
            onChange={(event) => setSelectedWeek(Number(event.target.value))}
            value={selectedWeek}
          >
            {availableWeeks.map((week) => (
              <option key={week.week} value={week.week}>
                {week.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="border-control hover:border-registry hover:text-registry min-h-12 rounded-lg border px-4 text-sm font-semibold disabled:opacity-40"
            disabled={selectedIndex <= 0}
            onClick={() =>
              setSelectedWeek(availableWeeks[selectedIndex - 1]!.week)
            }
            type="button"
          >
            Previous
          </button>
          <button
            className="border-control hover:border-registry hover:text-registry min-h-12 rounded-lg border px-4 text-sm font-semibold disabled:opacity-40"
            disabled={selectedIndex >= availableWeeks.length - 1}
            onClick={() =>
              setSelectedWeek(availableWeeks[selectedIndex + 1]!.week)
            }
            type="button"
          >
            Next
          </button>
        </div>
      </div>

      <div className="border-boundary bg-surface mt-3 overflow-hidden rounded-lg border">
        <div className="border-boundary bg-subtle flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-bold" id="selected-schedule-week">
            {selected.label}
          </h2>
          <span className="text-muted text-xs font-bold">
            {selected.status}
          </span>
        </div>
        <ol className="divide-boundary divide-y">
          {selected.matchups.map((matchup) => (
            <MatchupRow key={matchup.id} matchup={matchup} />
          ))}
        </ol>
      </div>
    </section>
  );
}
