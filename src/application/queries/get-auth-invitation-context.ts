import "server-only";

import { safeInternalPath } from "@/adapters/supabase/redirect";
import { getLeagueInvitePreview } from "@/application/queries/get-league-invite-preview";

// Presentation only: never authorizes membership or changes the action's next.
// Only the existing first-password detour may wrap an invitation destination.
export async function getAuthInvitationContext(next: string) {
  let destination = new URL(safeInternalPath(next), "https://ledger.invalid");
  if (destination.pathname === "/account/set-password") {
    destination = new URL(
      safeInternalPath(destination.searchParams.get("next")),
      "https://ledger.invalid",
    );
  }
  if (!destination.pathname.startsWith("/join/")) return null;

  const token = destination.pathname.match(
    /^\/join\/([a-zA-Z0-9_-]{16,120})\/?$/,
  )?.[1];
  const preview = token
    ? await getLeagueInvitePreview(token).catch(() => null)
    : null;
  // No browser storage, query-string league name, or stale cached fallback.
  return preview ? { leagueName: preview.league_name } : { leagueName: null };
}
