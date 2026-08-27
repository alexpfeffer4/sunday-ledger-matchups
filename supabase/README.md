# Supabase checkpoint

This directory contains reproducible Postgres migrations and pgTAP policy
tests. It does not contain credentials or a linked project identifier.

After an authorized Supabase project is connected:

1. Apply migrations to the linked development project. The migration exposes
   only the `api` schema through the Data API.
2. Generate TypeScript types from that project into
   `src/adapters/supabase/database.types.ts`.
3. Run `supabase test db` against a local or isolated test database.
4. Configure the Auth Site URL, allowed redirect URLs, and PKCE magic-link
   template for `/auth/confirm`.

`tests/stage1_vertical_slice.test.sql` contains 58 assertions covering the
eight-member roster cap, deterministic fixture publication, four Week 1
pairings, owner-only sealed receipts, common lock, reliable reveal, all matchup
completion cases, win/loss/push/void settlement, half-up rounding, correction
supersession, finalization, and append-only/RLS boundaries. The test rolls back
all fixture identities and competitive records.

The server-only Supabase secret key is intentionally absent from general Auth
and participant data helpers.

The Supabase connector currently generates only `public`. For this project,
regenerate the exposed API contract with the CLI when its access token is
available:

```bash
supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema api,public > src/adapters/supabase/database.types.ts
```
