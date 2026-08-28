import { z } from "zod";
import { persistedSeasonRulesetSchema } from "@/rulesets/schema";

export const seasonRulesetSnapshotSchema = z
  .object({
    rulesetId: z.string().min(1),
    rulesetVersion: z.string().min(1),
    productBibleId: z.string().min(1),
    productBibleVersion: z.string().min(1),
    mode: z.enum(["LIVE", "SIMULATION"]),
    canonicalJson: persistedSeasonRulesetSchema,
    sha256Hash: z.string().regex(/^[0-9a-f]{64}$/),
    publishedAt: z.iso.datetime({ offset: true }),
    frozenAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .superRefine((snapshot, context) => {
    const identityPairs = [
      [snapshot.rulesetId, snapshot.canonicalJson.id, "rulesetId"],
      [
        snapshot.rulesetVersion,
        snapshot.canonicalJson.version,
        "rulesetVersion",
      ],
      [
        snapshot.productBibleId,
        snapshot.canonicalJson.productBibleId,
        "productBibleId",
      ],
      [
        snapshot.productBibleVersion,
        snapshot.canonicalJson.productBibleVersion,
        "productBibleVersion",
      ],
      [snapshot.mode, snapshot.canonicalJson.mode, "mode"],
    ] as const;
    for (const [stored, canonical, field] of identityPairs) {
      if (stored !== canonical) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Stored Ruleset identity does not match canonical JSON.",
        });
      }
    }
  });

export type SeasonRulesetSnapshotDto = z.infer<
  typeof seasonRulesetSnapshotSchema
>;
