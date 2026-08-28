import "server-only";

import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  leagueInvitePreviewSchema,
  type LeagueInvitePreview,
} from "@/application/queries/league-invite-dtos";

export async function getLeagueInvitePreview(
  token: string,
): Promise<LeagueInvitePreview | null> {
  if (token.length < 16 || token.length > 120) return null;

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("api")
    .rpc("get_league_invite_preview", { p_token: token })
    .maybeSingle();

  if (result.error || !result.data) return null;
  return leagueInvitePreviewSchema.parse(result.data);
}
