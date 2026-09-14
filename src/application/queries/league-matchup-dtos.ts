import { z } from "zod";
import {
  selectedGameSchema,
  stage1StateSchema,
} from "@/application/queries/stage1-dtos";
export const leagueMatchupCardsSchema = z.object({
  weekId: z.uuid(),
  cards: z.array(
    z.object({
      entryId: z.uuid(),
      readiness: z.enum(["PENDING", "COMPLIANT", "INCOMPLETE"]).nullable(),
      scoreCenticredits: z.number().int().nonnegative().nullable(),
      selectedGames: z.array(selectedGameSchema).optional(),
      submitted: z.boolean().nullable().optional(),
      availableCredits: z.number().int().nonnegative().nullable().optional(),
      expiredCredits: z.number().int().nonnegative().nullable().optional(),
      canSubmit: z.boolean().nullable().optional(),
      // Only card-wide unsettled totals are authorized after common lock.
      // Optional during staggered application/database rollout; never assume zero.
      outstanding: z
        .object({
          picks: z.number().int().nonnegative(),
          credits: z.number().int().nonnegative(),
        })
        .nullable()
        .optional(),
      positions:
        stage1StateSchema.shape.matchup.unwrap().shape
          .opponentRevealedPositions,
    }),
  ),
});
export type LeagueMatchupCards = z.infer<typeof leagueMatchupCardsSchema>;
