"use client";
import { useState } from "react";
import { PageFrame } from "@/components/league/page-frame";
import { CommissionerOperatingSummary } from "./operating-summary";
import { CommissionerDisclosure } from "./commissioner-disclosure";
import { SeasonAutomationPanel } from "./season-automation-panel";
import {
  PlayerPropMenuReview,
  type PlayerPropMenuSlot,
} from "./player-prop-menu-review";
import {
  commissionerFixtureControls as controls,
  commissionerFixtureLeague as league,
  commissionerFixtureScenarios,
} from "@/adapters/example/commissioner-preview";
import type { AppActionState } from "@/application/actions/action-state";
const slots: PlayerPropMenuSlot[] = Array.from({ length: 54 }, (_, index) => ({
  eventId: `fixture-game-${Math.floor(index / 6)}`,
  eventLabel: `Away team ${Math.floor(index / 6) + 1} at Home team ${Math.floor(index / 6) + 1}`,
  team: index % 6 < 3 ? "Away team" : "Home team",
  slot: (["QB_PASS", "RB_RUSH", "RECEIVER"] as const)[index % 3],
  statistic: (["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS"] as const)[
    index % 3
  ],
  subjectId: null,
  subjectLabel: null,
  lateFillEligible: true,
  candidates: [],
}));
async function noSave(): Promise<AppActionState> {
  return {
    status: "success",
    message:
      "Fixture only — no settings, results or provider requests were saved.",
  };
}
export function Ui1Preview() {
  const [scenario, setScenario] = useState("Healthy waiting");
  const status = commissionerFixtureScenarios[scenario];
  return (
    <PageFrame
      eyebrow="Isolated presentation fixture"
      title="Commissioner"
      description="UI-1 presentation preview · synthetic data · controls do not save changes. Authenticated control verification runs separately against disposable test data."
    >
      <label className="mt-4 block text-sm font-semibold">
        Preview state
        <select
          className="border-control mt-2 min-h-11 w-full max-w-sm rounded-lg border px-3"
          value={scenario}
          onChange={(event) => setScenario(event.target.value)}
        >
          {Object.keys(commissionerFixtureScenarios).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <CommissionerOperatingSummary
        state={{ league, week: controls.week }}
        controls={controls}
        automation={status}
        operations={{
          weekState: "OPEN",
          correctionWindowClosesAt: null,
          latestImportAt: null,
          automationEnabled: true,
          events: [],
        }}
        hasLiveImport={false}
        providerConfigured
        now={new Date("2026-09-17T12:00:00Z")}
      />
      <section className="border-boundary mt-5 rounded-xl border p-5">
        <h2 className="font-bold">This week</h2>
        <p className="mt-2 text-sm">10 members · Week 2 · Betting open</p>
        <p className="mt-2 text-sm">
          0 players published · 54 pending slots · 0 unavailable slots
        </p>
        <p className="mt-2 text-sm">
          Individual empty slots do not require weekly approval. The complete
          structural slate and source readiness remain required.
        </p>
        <a
          href="#player-menu"
          className="text-action mt-2 inline-flex min-h-11 items-center text-sm font-semibold"
        >
          View player details
        </a>
      </section>
      <CommissionerDisclosure id="commissioner-recovery" title="Recovery">
        {status ? (
          <SeasonAutomationPanel
            leagueSlug="fixture-preview"
            status={status}
            action={noSave}
            section="recovery"
          />
        ) : (
          <p>Operating status could not be confirmed.</p>
        )}
        <CommissionerDisclosure
          id="player-menu"
          title="Player menu and props recovery"
        >
          <PlayerPropMenuReview
            leagueSlug="fixture-preview"
            leagueId={league.id}
            slots={slots}
            frozen
            automaticValidation
            progressiveAvailability
            progressiveActivated
            prepareAction={noSave}
            confirmAction={noSave}
            refreshAction={noSave}
          />
        </CommissionerDisclosure>
        <p className="text-sm">
          If the first final is missing, a correction cannot create it. No
          manual first-result process is established. Keep it unresolved if a
          bounded score check fails.
        </p>
      </CommissionerDisclosure>
      <CommissionerDisclosure
        id="commissioner-settings"
        title="Season settings"
      >
        {status ? (
          <SeasonAutomationPanel
            leagueSlug="fixture-preview"
            status={status}
            action={noSave}
          />
        ) : (
          <p>Refresh to confirm settings before changing automation.</p>
        )}
      </CommissionerDisclosure>
      {status ? (
        <SeasonAutomationPanel
          leagueSlug="fixture-preview"
          status={status}
          action={noSave}
          section="audit"
        />
      ) : null}
    </PageFrame>
  );
}
