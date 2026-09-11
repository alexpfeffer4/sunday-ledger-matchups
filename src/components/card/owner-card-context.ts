import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { RestoredCardDraft } from "@/components/card/card-draft-storage";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { resolveSeasonCardRules, type CardRules } from "@/rulesets/card-rules";

// Only the authenticated owner's card and published markets cross this boundary.
// Never add opponent draft/readiness data to this client-side progress contract.
export type OwnerCardContext = Pick<
  Stage1StateDto,
  "ownerCard" | "slate" | "week"
> & {
  leagueId: string;
  leagueSlug: string;
  mode: Stage1StateDto["league"]["mode"];
  simulatedNow: string | null;
  rules: CardRules | null;
};

export function ownerCardContext(state: Stage1StateDto): OwnerCardContext {
  const resolved = resolveSeasonCardRules(
    state.season?.rulesetSnapshot,
    state.league.mode,
  );
  return {
    rules: resolved.supported ? resolved.rules : null,
    leagueId: state.league.id,
    leagueSlug: state.league.slug,
    mode: state.league.mode,
    simulatedNow: state.season?.simulatedNow ?? null,
    ownerCard: state.ownerCard,
    slate: state.slate,
    week: state.week,
  };
}

export function cardDraftStorageKey(context: OwnerCardContext): string | null {
  return context.ownerCard && context.week
    ? `sunday-ledger:card-draft:v1:${context.leagueId}:${context.week.id}:${context.ownerCard.id}`
    : null;
}

export function cardIsSealed(context: OwnerCardContext): boolean {
  const card = context.ownerCard;
  return Boolean(
    card &&
    (card.compliance === "COMPLIANT" ||
      (card.allocatedCredits === card.grantedCredits &&
        card.remainingCredits === 0)),
  );
}

export function ownerDraftState(
  context: OwnerCardContext,
  drafts: RestoredCardDraft[],
) {
  if (cardIsSealed(context)) return "Sealed";
  if (context.ownerCard?.compliance === "INCOMPLETE") return "Incomplete";
  if (!drafts.length) return "Not started";
  if (!context.rules) return "Draft";
  const validation = validateDraftCard({
    acceptedPositions: context.ownerCard?.positions ?? [],
    draftPositions: drafts,
    eligibleOpportunities: context.slate.flatMap((event) =>
      event.markets
        .filter((market) => market.qualityStatus === "HEALTHY")
        .map((market) => ({ ...market, eventId: event.id })),
    ),
    ruleset: context.rules,
  });
  return validation.accepted ? "Ready to review" : "Draft";
}
