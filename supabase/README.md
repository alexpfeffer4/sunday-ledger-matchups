# Supabase checkpoint

This directory contains reproducible Postgres migrations and pgTAP policy
tests. It does not contain credentials or a linked project identifier.

After an authorized Supabase project is connected:

1. Expose only the `api` schema through the Data API.
2. Apply migrations to the linked development project.
3. Generate TypeScript types from that project into
   `src/adapters/supabase/database.types.ts`.
4. Run `supabase test db` against a local or isolated test database.
5. Configure the Auth Site URL, allowed redirect URLs, and PKCE magic-link
   template for `/auth/confirm`.

The server-only Supabase secret key is intentionally absent from general Auth
and participant data helpers.
