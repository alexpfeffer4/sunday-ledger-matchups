# Sunday Ledger Matchups

A conventional Next.js App Router application for private, head-to-head NFL
pick-em leagues. The deployment target is Vercel. Authentication and relational
data use Supabase Auth and Supabase Postgres. This repository does not use
ChatGPT Sites, Sites hosting, Sites storage, or a Sites-managed application.

## Current implementation

- Typed POC Season 1 and Simulation ruleset snapshots
- Pure TypeScript odds, card-completion, settlement, matchup, schedule,
  standings, reveal, and playoff modules
- Deterministic Week 6 simulation across the participant and commissioner UI
- Supabase SSR magic-link Auth boundary
- Reproducible profile, league, membership, invite, season, and RLS migration
- Production-shaped Stage 1 Week 1 lifecycle backed by Supabase Postgres:
  eight-entry formation, four stored matchups, 1,000-credit grants, sealed
  receipts, reliable event reveal, centicredit settlement, standings,
  correction replay, and finalization
- Stage 2 full-season Simulation path for every approved even roster from 4–16:
  a balanced 14-week schedule, immutable weekly cards and receipts, cumulative
  standings, third-miss playoff ineligibility, the roster-size-specific playoff
  bracket, champion and placement results, and exhibition-only Week 18 history
- Commissioner-only, idempotent season publication into an append-only,
  member-scoped Supabase archive with per-viewer history projection
- Stage 3 Live-mode foundation: mode-aware league creation, a server-only The
  Odds API client, strict DraftKings main-market normalization, and an
  append-only commissioner review ledger protected from regular members by RLS
- Commissioner-selected Live Week 1 publication with rules-aware default event
  selection, an immutable eligible-event set, six stored main-market outcomes
  per event, and a derived five-minute common lock; solo publication creates no
  cards, schedule, matchups, or credit grants
- Deterministic provider-fixture ports for healthy, stale, outlier, suspended,
  provider-degraded, live, final, void, and corrected states
- Vitest unit/property coverage and Playwright configuration

The simulation adapter is visibly labeled and never mixes with live data.
Stages 1 and 2 are the Production baseline. Stage 3 begins on the isolated
`stage-3-live-season` branch with a server-only The Odds API boundary and
private import review; no live provider request is made unless the environment
has an authorized API key. Imports remain noncompetitive until the commissioner
publishes selected events, and that publication keeps cards closed until a
valid even roster is locked.

## Local development

Requirements: Node.js 24 and npm 11.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without Supabase variables, the deterministic simulation remains available and
Auth forms fail safely without sending a request. After an authorized project
connection, set the browser-safe URL and publishable key in `.env.local`. Never
commit `.env.local` or expose the server-only Supabase secret key.

The hosted build uses the committed `.env.production`, which contains only the
browser-safe Supabase project URL and publishable key. Server-only provider
credentials remain untracked and must be configured through Vercel.

## Quality gate

```bash
npm run verify
```

The gate checks formatting, lint, strict TypeScript, unit/property tests, and a
production Next.js build. Browser tests run separately with:

```bash
npm run test:e2e
```

## Supabase

Migrations and pgTAP assertions live in `supabase/`. The Stage 1 suite executes
the complete interactive lifecycle; the Stage 2 suite publishes, reads, and
rejects mutation of a full-season archive; the Stage 3 suite verifies guarded
live imports, immutable event selection, noncompetitive solo publication,
idempotency, append-only storage, and commissioner-only RLS. All run inside
rollback transactions. The `api` schema is the reviewed Data API
boundary; base relations live in the non-exposed `private` schema and remain
protected by grants and Row Level Security.

After authorization, link the intended Supabase development project, apply the
migrations, expose only the `api` schema, generate project types, and run the
database tests. See `supabase/README.md` for the checkpoint sequence.

## Deployment

Vercel is the only application deployment target. `main` is Production.
Feature branches such as `stage-3-live-season` create Preview deployments
through the connected Git integration; the obsolete `implementation` branch
remains disabled. A Preview never promotes itself to Production.
