import { z } from "zod";

export const leagueInvitePreviewSchema = z.object({
  commissioner_name: z.string().min(1),
  expires_at: z.string(),
  league_name: z.string().min(1),
  member_count: z.number().int().nonnegative(),
  mode: z.enum(["LIVE", "SIMULATION"]),
  nfl_year: z.number().int(),
});

export const leagueInviteSummarySchema = z.object({
  active: z.boolean(),
  created_at: z.string(),
  expires_at: z.string(),
  id: z.uuid(),
  max_uses: z.number().int().positive(),
  revoked_at: z.string().nullable(),
  status: z.enum(["Active", "Expired", "Fully used", "Revoked"]),
  uses: z.number().int().nonnegative(),
});

export type LeagueInvitePreview = z.infer<typeof leagueInvitePreviewSchema>;
export type LeagueInviteSummary = z.infer<typeof leagueInviteSummarySchema>;
