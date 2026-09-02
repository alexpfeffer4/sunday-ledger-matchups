import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { InvitePreviewCard } from "@/components/league/invite-public-preview";
import { LeagueShell } from "@/components/league/league-shell";
import { PageFrame } from "@/components/league/page-frame";
import { BrandedRouteState } from "@/components/ui/branded-route-state";
import { ReceiptPanel } from "@/components/ui/receipt-panel";
import {
  BrandLockup,
  BrandWordmark,
  RegisterMark,
} from "@/components/ui/register-mark";

const navigationState = vi.hoisted(() => ({
  pathname: "/l/phase-11/matchup",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/app/(auth)/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

const outputPath = resolve("tests/e2e/generated/phase11-markup.json");
const longLeagueName =
  "The Extraordinarily Long Sunday Ledger Clubhouse Association";

function IdentityFixture() {
  return (
    <main
      className="bg-canvas min-h-screen p-6"
      aria-label="Phase 11 identity review"
    >
      <section aria-label="Approved product lockups" className="grid gap-6">
        <BrandLockup variant="horizontal" />
        <BrandLockup variant="compact" />
        <BrandWordmark />
        <div className="broadcast-dark text-ink rounded-lg p-6">
          <BrandLockup tone="currentColor" variant="horizontal" />
        </div>
        <div className="text-ink">
          <BrandLockup tone="monochrome" variant="horizontal" />
        </div>
        <div className="text-registry">
          <BrandLockup tone="registry" variant="horizontal" />
        </div>
      </section>
      <section
        aria-label="Approved optical sizes"
        className="mt-8 flex flex-wrap items-end gap-6"
      >
        <span data-test-size="16">
          <RegisterMark
            label="Sunday Ledger Register at 16 pixels"
            master="micro"
            style={{ height: 16, minHeight: 16, minWidth: 16, width: 16 }}
          />
        </span>
        <span data-test-size="20">
          <RegisterMark
            label="Sunday Ledger Register at 20 pixels"
            master="micro"
            style={{ height: 20, minHeight: 20, minWidth: 20, width: 20 }}
          />
        </span>
        <span data-test-size="24">
          <RegisterMark
            label="Sunday Ledger Register at 24 pixels"
            master="compact"
            style={{ height: 24, minHeight: 24, minWidth: 24, width: 24 }}
          />
        </span>
        <span data-test-size="32">
          <RegisterMark
            label="Sunday Ledger Register at 32 pixels"
            master="compact"
            style={{ height: 32, minHeight: 32, minWidth: 32, width: 32 }}
          />
        </span>
        <span data-test-size="48">
          <RegisterMark
            label="Sunday Ledger Register at 48 pixels"
            master="standard"
            style={{ height: 48, minHeight: 48, minWidth: 48, width: 48 }}
          />
        </span>
        <span data-test-size="64">
          <RegisterMark
            label="Sunday Ledger Register at 64 pixels"
            master="standard"
            style={{ height: 64, minHeight: 64, minWidth: 64, width: 64 }}
          />
        </span>
      </section>
      <section
        aria-label="Browser icon context"
        className="mt-8 flex items-center gap-3"
      >
        {/* The raw 16px ICO is intentional browser-tab verification evidence. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Sunday Ledger browser icon at 16 pixels"
          height="16"
          src="/favicon.ico"
          width="16"
        />
        <span>Sunday Ledger</span>
      </section>
    </main>
  );
}

function ReceiptFixture() {
  return (
    <main className="bg-canvas min-h-screen p-6">
      <ReceiptPanel
        audit={<p>Accepted line and correction history</p>}
        status={<span>Accepted</span>}
        summary="The accepted pick remains the authoritative record."
      >
        <p>Pick, line, price, and returned-credit facts</p>
      </ReceiptPanel>
    </main>
  );
}

function ShellFixture() {
  return (
    <LeagueShell
      cardStatusLabel="650 / 1,000 used"
      exampleMode
      isCommissioner
      leagueName={longLeagueName}
      leagueSlug="phase-11"
      memberName="Alexandra Ledger With A Long Member Name"
      memberRole="Commissioner"
      mode="SIMULATION"
      nflYear={2026}
      phaseLabel="Matchup live"
      week={18}
    >
      <PageFrame
        dark
        eyebrow="Current matchup"
        title="Matchup"
        description="Example and Simulation remain state labels."
      >
        <div className="text-ink mt-6">
          <BrandLockup tone="currentColor" variant="horizontal" />
        </div>
      </PageFrame>
    </LeagueShell>
  );
}

function InviteFixture() {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8">
      <BrandLockup variant="horizontal" />
      <InvitePreviewCard
        actions={<button type="button">Create account</button>}
        preview={{
          commissioner_name: "Commissioner Example",
          expires_at: "2026-09-08T17:00:00.000Z",
          league_name: longLeagueName,
          member_count: 6,
          mode: "SIMULATION",
          nfl_year: 2026,
        }}
      />
    </main>
  );
}

const identity = renderToStaticMarkup(<IdentityFixture />);
const receipt = renderToStaticMarkup(<ReceiptFixture />);
const shell = renderToStaticMarkup(<ShellFixture />);
const invitation = renderToStaticMarkup(<InviteFixture />);
const routeStates = renderToStaticMarkup(
  <>
    <BrandedRouteState
      description="Preparing the latest Sunday Ledger page."
      eyebrow="Loading"
      title="Opening the Ledger…"
    />
    <BrandedRouteState
      description="This page did not load."
      eyebrow="Page unavailable"
      title="We could not open this page"
    />
    <BrandedRouteState
      description="This page may have moved."
      eyebrow="Page not found"
      title="There is no Ledger page here"
    />
  </>,
);

test("writes deterministic Phase 11 identity review markup", () => {
  expect(identity).toContain('data-brand-lockup="horizontal"');
  expect(identity).toContain('data-brand-lockup="compact"');
  expect(identity).toContain('data-optical-master="micro"');
  expect(identity).toContain('data-optical-master="compact"');
  expect(identity).toContain('data-optical-master="standard"');
  expect(identity).not.toContain("M11 8V55H56M27 24H48M27 46H56");
  expect(identity).not.toContain("<text");

  const cue = receipt.indexOf("Sunday Ledger receipt");
  const authority = receipt.indexOf("Receipt summary");
  expect(cue).toBeGreaterThan(-1);
  expect(cue).toBeLessThan(authority);
  expect(receipt).toContain('data-optical-master="micro"');
  expect(receipt).not.toMatch(/ticket|bet slip|perforat/i);

  const shellLockupEnd = shell.indexOf("</aside>");
  expect(shell.slice(0, shellLockupEnd)).toContain("Sunday Ledger");
  expect(shell).toContain(longLeagueName);
  expect(shell).toContain("line-clamp-2");
  expect(shell).toContain("Example Season read-only");
  expect(shell).toContain("Simulation");
  expect(shell).toContain("broadcast-dark");

  expect(invitation).toContain('data-brand-lockup="horizontal"');
  expect(invitation).toContain('data-optical-master="compact"');
  expect(routeStates.match(/data-brand-lockup="horizontal"/g)).toHaveLength(3);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify({ identity, invitation, receipt, routeStates, shell }),
  );
});
