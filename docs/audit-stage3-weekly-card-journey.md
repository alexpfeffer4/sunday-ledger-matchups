# Stage 3: weekly action and card review

Implements Prompt 3, audit A03–A05 and related participant copy. Started from freshly fetched main `db3210003590c3254895a50318cdb3c2169a451c` after Stage 2 PR #30.

## What changed

Matchup leads with the opponent, exact Eastern deadline, owner allocation and one weekly action. Matchup, My Card and the builder share Not started / Draft / Ready to review / Sealed. Incomplete requires the authoritative missed-deadline consequence. During play the contest and Stage 2 freshness remain primary; final results lead with the outcome and season consequence.

A single owner-scoped browser store restores existing v1 drafts without hydration erasure, supports route/tab updates, and reports storage failure. Authoritative acceptance overrides stale drafts. A second device can recover an already-sealed card without accepting different picks or replacing its receipts. Drafts remain device-local.

Stake entry and review identify the game and Eastern kickoff, selection/line, odds, stake, profit and total returned using existing integer arithmetic. Identical totals stay distinguishable. Changed terms remain beside their pick and require explicit approval. Direct navigation to review never calls a provider; members explicitly check current odds. Irreversible confirmation and receipt creation are explained at the point of action.

## Existing work preserved

Stage 1 already supplied game identity and kickoff on review rows, quote freshness, changed-term confirmation, and immutable receipts. Stage 2 supplied event-confirmed reveal, bounded kickoff-relative checkpoints and truthful stored-score freshness. Those mechanisms remain authoritative. No scoring, frozen Ruleset, qualification, playoff tie, archive, database schema, provider budget or scheduler setting changes.

## Evidence

These images use the actual shared components with deterministic owner/public fixtures, at a 390px viewport. The baseline was rendered from starting main. The baseline card is sealed; compare it with the sealed after-image, and use the ready image to inspect the new draft action. Synthetic previews are distinct from real Auth/submission evidence and their temporary route is not shipped.

| Before                                                     | After                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| [Pregame on starting main](evidence/stage3/before-390.png) | [Sealed card](evidence/stage3/sealed-390.png)                        |
|                                                            | [Ready to review](evidence/stage3/ready-390.png)                     |
|                                                            | [Final review with identical totals](evidence/stage3/review-390.png) |

Additional evidence: [empty](evidence/stage3/empty-390.png), [partial draft](evidence/stage3/draft-390.png), [final result](evidence/stage3/final-390.png), [20 picks with long game names at 320px](evidence/stage3/long-320.png), [the same review at 200% text](evidence/stage3/long-320-large-text.png).

The verification record is in the PR and standalone completion note. The extended real full-stack lane covers Auth → Matchup → partial draft → route/reload → My Card → complete review → authoritative seal, separate-device draft absence, a second device confirming an already-sealed card, original receipts, changed quotes, provider failure, lock and recovery. Existing privacy, scoring, database and Chromium/WebKit acceptance gates remain required.

## Rollout and rollback

After approval, merge through the normal protected PR/deployment workflow. No migration or configuration activation is needed. Smoke-check a pre-lock owner card, device-local draft restoration, review initiation and sealed receipt access. Do not create or seal picks in a real member's league merely to smoke-test deployment. Revert the PR and deploy the revert to roll back UI/action changes; existing accepted receipts and v1 device drafts remain compatible.

## Stage 4 handoff

Start from current main after this stage merges. Continue A06–A08: remaining result duplication/copy, compact standings, current playoff priority, unavailable-data and exhibition-label paths, and Eastern-time labels. Preserve the new owner-only draft contract, explicit quote review, event-confirmed privacy and the Stage 2 checkpoint policy. Physical iPhone/Safari, assistive-technology use and ordinary Production member/provider observations remain follow-up work; emulation is not proof of those journeys.
