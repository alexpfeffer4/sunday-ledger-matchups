import { z } from "zod";
import { stage1StateSchema } from "@/application/queries/stage1-dtos";
export const leagueMatchupCardsSchema = z.object({
  weekId: z.uuid(),
  cards: z.array(
    z.object({
      entryId: z.uuid(),
      readiness: z.enum(["PENDING", "COMPLIANT", "INCOMPLETE"]).nullable(),
      scoreCenticredits: z.number().int().nonnegative().nullable(),
      positions:
        stage1StateSchema.shape.matchup.unwrap().shape
          .opponentRevealedPositions,
    }),
  ),
});
export type LeagueMatchupCards = z.infer<typeof leagueMatchupCardsSchema>;
