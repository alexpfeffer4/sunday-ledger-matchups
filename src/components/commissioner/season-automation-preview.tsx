"use client";

import { useState } from "react";
import type { SeasonAutomationStatus } from "@/application/automation/status";
import type { AppActionState } from "@/application/actions/action-state";
import { SeasonAutomationPanel } from "./season-automation-panel";

const initial: SeasonAutomationStatus = {
  seasonId: "00000000-0000-4000-8000-000000000001",
  eligible: true,
  minimumWeek: 3,
  enabled: false,
  revoked: false,
  enrolled: false,
  effectiveWeek: null,
  preset: null,
  policyRevision: "SEASON_AUTOMATION_V1",
  policyHash: "a".repeat(64),
  approvedAt: null,
  lastOutcome: null,
  blocker: null,
  workerReady: true,
  automaticMenuWeek: null,
  validatedWeek: null,
  next: { status: "NOT_ENROLLED" },
};

export function SeasonAutomationPreview() {
  const [status, setStatus] = useState(initial);
  async function action(
    _: AppActionState,
    form: FormData,
  ): Promise<AppActionState> {
    const command = form.get("command");
    setStatus((prior) => ({
      ...prior,
      enrolled: true,
      enabled: command !== "PAUSE" && command !== "REVOKE",
      revoked: command === "REVOKE",
      effectiveWeek: Number(
        form.get("effectiveWeek") ?? prior.effectiveWeek ?? 3,
      ),
      preset: (form.get("preset") ??
        prior.preset ??
        "ALL_NFL_GAMES") as SeasonAutomationStatus["preset"],
      approvedAt: "2026-09-16T14:00:00Z",
      next: { status: "WAITING", week: 3, blocker: "PREVIOUS_WEEK_RESULTS" },
    }));
    return {
      status: "success",
      message:
        "Preview updated. These fixture controls do not save season settings.",
    };
  }
  return (
    <main className="bg-paper min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Sunday Ledger · Commissioner
        </p>
        <h1 className="mt-3 text-3xl font-bold">
          Your season, ready each week.
        </h1>
        <p className="text-graphite mt-3 max-w-2xl text-sm leading-6">
          Fixture Preview. Try the one-time approval, pause and resume controls.
          No production backend is connected.
        </p>
        <SeasonAutomationPanel
          leagueSlug="fixture-preview"
          status={status}
          action={action}
        />
        <div className="flex flex-wrap gap-3">
          <button
            className="border-control min-h-11 rounded-lg border px-4 text-sm"
            onClick={() => setStatus(initial)}
          >
            Reset fixture
          </button>
          <button
            className="border-control min-h-11 rounded-lg border px-4 text-sm"
            onClick={() =>
              setStatus({
                ...initial,
                enrolled: true,
                enabled: true,
                effectiveWeek: 3,
                preset: "ALL_NFL_GAMES",
                approvedAt: "2026-09-16T14:00:00Z",
                validatedWeek: 3,
                automaticMenuWeek: 3,
                lastOutcome: "OPENED",
                next: {
                  status: "WAITING",
                  week: 4,
                  blocker: "PREVIOUS_WEEK_RESULTS",
                },
              })
            }
          >
            Show automatically opened week
          </button>
        </div>
      </div>
    </main>
  );
}
