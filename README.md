# Sunday Ledger Matchups

A conventional Next.js App Router application for private, head-to-head NFL
pick-em leagues. The deployment target is Vercel. Authentication and relational
data use Supabase Auth and Supabase Postgres. This repository does not use
ChatGPT Sites, Sites hosting, Sites storage, or a Sites-managed application.

## Current implementation

- Member and commissioner journeys use immutable, versioned season/week rules,
  event-timed disclosure, append-only receipts and auditable corrections.
- Live and isolated Simulation modes share the authoritative season lifecycle;
  owner rehearsal and the read-only Example Season retain their access boundaries.
- Current approved Live rules support rolling submissions, shared weekly credits,
  main markets and progressive player props. Open and historical weeks keep their
  bound rules; see the [current governing source index](docs/governance/current-source-index.md).
- Enrolled future weeks prepare, validate and open under genuine standing season
  consent. Manual/unenrolled scopes retain their applicable review requirements.
- Public odds are acquired by final card review, explicit commissioner actions,
  authorized catalog/preparation work and scheduled shared background refresh.
  Database claims, freshness, pacing, leases and credit reserves bound every path.
  Browsing reads stored quotes and never buys provider data. Changed economic
  terms still require explicit acceptance before authoritative submission.
- Real Auth/RSC/RPC acceptance, complete clean-migration/pgTAP coverage, native
  concurrency tests and desktop/mobile journeys protect these boundaries.

Use [change navigation](docs/change-navigation.md) to map a behavior to its
current governing source, application entry, database authority and verification.
It also explains the derived effective-function artifact and safe query diagnostics.
Release status and limits remain in dated operations records; a Preview does not
establish Production activation.

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

This local gate checks identity source/export consistency, formatting, lint with
zero warnings, strict TypeScript, unit/property/component tests, and a
production Next.js build. It does not start Postgres or a browser.

The required pull-request workflow additionally performs a clean migration
rebuild, the complete pgTAP/RLS suite, generated Supabase type comparison, the
real local Auth → server action → RSC → RPC acceptance lane, and Chromium/WebKit
browser, accessibility, and Phase 11 identity checks. A local browser run is:

```bash
npm run test:e2e
```

## Supabase

Migrations and pgTAP assertions live in `supabase/`. The Stage 1 suite executes
the complete interactive lifecycle; the Stage 2 suite publishes, reads, and
rejects mutation of a full-season archive; the Stage 3 suite verifies guarded
live imports, immutable event selection, noncompetitive solo publication,
current-quote refresh, idempotency, append-only storage, and commissioner-only
RLS; the result suite verifies official-score provenance, correction replay,
postponement voids, and final competitive snapshots; the progression suite
verifies the Week 2–14 operational boundary and cumulative ledger; the playoff
suites verify final qualification, eligibility, bracket immutability, real
postseason card settlement, higher-seed advancement, Week 16 reseeding,
champion finality, Week 18, and complete archive finality. The controlled-league
suite verifies caller-scoped retry recovery and explicit private-helper ACLs.
All suites run inside rollback transactions. The `api` schema is the reviewed
Data API boundary; base relations live in the non-exposed `private` schema and
remain protected by grants and Row Level Security.

After authorization, link the intended Supabase development project, apply the
migrations, expose only the `api` schema, generate project types, and run the
database tests. See `supabase/README.md` for the checkpoint sequence.

## Commissioner operations

Use [`docs/commissioner-runbook.md`](docs/commissioner-runbook.md) for the
formation, weekly Live operation, playoff, correction, and archival sequence.

## Deployment

Vercel is the only application deployment target. `main` is Production.
Feature branches create isolated Preview deployments through the connected Git
integration; the obsolete `implementation` branch remains disabled. A Preview
never promotes itself to Production.
