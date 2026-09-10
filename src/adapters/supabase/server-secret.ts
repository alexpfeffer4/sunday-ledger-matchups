import "server-only";

/** Keep the write-only Production key usable under its existing spelling. */
export function getSupabaseServerSecret(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_Secret_KEY;
}
