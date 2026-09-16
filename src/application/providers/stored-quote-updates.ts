import { z } from "zod";
import { liveQuoteHeadsSchema } from "@/application/queries/stage1-dtos";
import { playerPropSlotSchema } from "@/application/queries/player-prop-dtos";
export const quoteFreshnessSchema = z.array(
  z.object({
    family: z.enum([
      "MAIN",
      "player_pass_yds",
      "player_rush_yds",
      "player_reception_yds",
    ]),
    readAt: z.string(),
    checkedAt: z.string().nullable(),
    observedAt: z.string().nullable(),
    delayed: z.boolean(),
  }),
);
export type QuoteFreshnessData = z.infer<typeof quoteFreshnessSchema>;
export const storedQuoteUpdatesSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("STOP") }),
  z.object({
    status: z.literal("READY"),
    weekId: z.uuid(),
    pollingEnabled: z.boolean(),
    hasOpenEvents: z.boolean(),
    quotes: liveQuoteHeadsSchema,
    slots: z.array(playerPropSlotSchema.omit({ candidates: true })),
    events: z.array(
      z.object({
        eventId: z.uuid(),
        entryOpen: z.boolean(),
        entryClosesAt: z.string(),
        freshness: quoteFreshnessSchema,
      }),
    ),
  }),
]);
export type StoredQuoteUpdate = Extract<
  z.infer<typeof storedQuoteUpdatesSchema>,
  { status: "READY" }
>;
