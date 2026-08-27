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
- Deterministic provider-fixture ports for healthy, stale, outlier, suspended,
  provider-degraded, live, final, void, and corrected states
- Vitest unit/property coverage and Playwright configuration

The simulation adapter is visibly labeled and never mixes with live data.
Hosted Supabase and Vercel resources are connected only at their documented
implementation checkpoints.

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
the complete lifecycle inside a rollback transaction, including all four
matchup-completion cases and correction immutability. The `api` schema is the
reviewed Data API boundary; base relations live in the non-exposed `private`
schema and remain protected by grants and Row Level Security.

After authorization, link the intended Supabase development project, apply the
migrations, expose only the `api` schema, generate project types, and run the
database tests. See `supabase/README.md` for the checkpoint sequence.

## Deployment

Vercel is the only application deployment target. Automatic deployment for the
`implementation` branch is intentionally disabled in `vercel.json` until the
full local and hosted security gates pass. The release plan permits one Preview
and one Production deployment.
