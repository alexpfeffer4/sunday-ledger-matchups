import { hashRuleset } from "@/rulesets/canonicalize";

/** Called by the authoritative server query before validation or serialization. */
export async function withVerifiedRulesetHash(
  snapshot: unknown,
): Promise<unknown> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return snapshot;
  }
  const stored = snapshot as Record<string, unknown>;
  try {
    return {
      ...stored,
      canonicalSha256Hash: await hashRuleset(stored.canonicalJson),
    };
  } catch {
    return { ...stored, canonicalSha256Hash: null };
  }
}
