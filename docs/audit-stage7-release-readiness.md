# Sunday Ledger — Stage 7 release readiness and Stage 8 handoff

Prepared September 12, 2026. Audit coverage: A13–A15. PRs #37 and #38 are in review;
Stage 7 is not merged or deployed. Final CI results are recorded in the PR and
the standalone handoff. This report does not certify security, accessibility,
Production performance, or a completed invited pilot.

## Baseline and authority

- Repository: `alexpfeffer4/sunday-ledger-matchups`; clean new branch
  `codex/audit-stage7-release-readiness` from main
  `d998312ca7e6dac1bf2456bbbe5987d74f3086ac`.
- Production: `www.ledgerleagues.com`, deployment
  `dpl_7FuaKuQDJZLSG6PEZd8m22iFcghU`, READY at that main commit; both canonical
  domains assigned without alias error, rechecked September 12.
- Supabase `nxikkhtaercmbuyrlyio`: ACTIVE_HEALTHY; 45 applied migrations, ending
  `20260911211958_prospective_week_rules`. PR #38 proposes a separate
  `20260912054000_fix_draft_deletion_archive_guard` forward migration; it is
  **not applied**. See [the migration note](audit-stage7-draft-deletion.md).
- Read the supplied audit, Prompt 7, six historical governing sources,
  [current source index](governance/current-source-index.md), revision-2
  [governing addendum](governance/2026-09-11-governing-addendum.md), and Stage 5/6
  completion evidence together. The owner's supplied post-release handoffs
  supersede stale pending-release language in earlier implementation notes.
- Keep the owner's **future-week updates within existing seasons** decision.
  Opened weeks, accepted receipts, completed results, published standings and
  playoff evidence retain their rules; the next week adopts only an explicitly
  supported approved upgrade. Nothing here changes that boundary.

## A13 — Security and operating posture

| Item                       | Classification                                                               | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository audience        | Decision-dependent                                                           | GitHub metadata currently says **public**. Historical references to a private repository are not current facts. Visibility has not been changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Secrets and source history | Verified already complete for bounded scan                                   | Scanned all 281 reachable commits / 1,640 unique blobs at baseline for private-key blocks, GitHub token forms, AWS access-key IDs, Supabase secret keys and decoded service-role JWTs; zero pattern matches. This does not cover unreachable objects, every secret format, external logs or attachments. The tracked Supabase URL/publishable key is public client configuration. Existing server-secret/client-boundary tests remain required. A current npm production-dependency audit also reported zero known vulnerabilities; this is advisory-feed coverage, not proof of no vulnerabilities. |
| RLS and grants             | Verified already complete for sampled boundary                               | All 44 private tables have RLS. Receipt SELECT is owner-scoped. Membership and week/season rule snapshot SELECT is member-scoped. Private actor-card-acceptance and week-pinning helpers are not executable by anon/authenticated. Sampled security-definer APIs have an empty search path and internal authorization. No broad policy added.                                                                                                                                                                                                                                                        |
| Advisor results            | Verified already complete / decision-dependent                               | Fifteen existing informational RLS-without-policy private tables remain compatible with the RPC-only boundary; leaked-password protection is the remaining warning. No new policy was introduced to suppress an advisor.                                                                                                                                                                                                                                                                                                                                                                             |
| Invite revocation          | Implemented verification                                                     | Disposable real-Auth tests reject an unauthorized revocation, revoke through the commissioner RPC, remove anonymous preview and reject subsequent join, then join through a fresh invite. This is stronger than checking function existence/grants alone.                                                                                                                                                                                                                                                                                                                                            |
| Account recovery           | Verified already complete in isolated tests; awaiting named real-world check | Retain desktop/mobile-WebKit local Auth and captured-mail cases: signup/invite destination, retry, expired/used links, interrupted profile/password setup, repeat verification and session persistence. Owner-reported physical-iPhone recovery-link success from Stage 5 is retained. Physical-iPhone **numeric-code recovery after #35** remains unverified. No real mail was sent in Stage 7.                                                                                                                                                                                                     |
| League deletion            | Implemented verification                                                     | The real-Auth check exposed a stale archive-table reference causing `42P01` in deletion eligibility and the commissioner league-list view. PR #38 repairs that reference with all existing guards preserved. Database checks execute untouched-draft deletion, outsider/name rejection and joined-draft preservation; the UI lane checks clean rejection after sealing and unchanged 20 receipts. Archive is reversible and is not personal-data erasure.                                                                                                                                            |
| Personal account erasure   | Decision-dependent                                                           | There is no self-service account-erasure workflow or approved retention/anonymization policy. Profiles are referenced by immutable commands, corrections, results, schedule/playoff/archive publications and rehearsal ownership with NO ACTION foreign keys. Do not delete an Auth user or cascade around these references as an improvised erasure procedure.                                                                                                                                                                                                                                      |
| Backup/restore             | Awaiting named real-world check                                              | Organization is on **Free**. No owner-controlled recent backup artifact or isolated restore result was available to verify. The procedure below is prepared; documenting it is not a successful backup or restore.                                                                                                                                                                                                                                                                                                                                                                                   |
| Release controls           | Awaiting named owner/admin check                                             | Repository ruleset collection returned empty; classic branch-protection read returned 403 for the integration. Do not equate that permission limit with absence of branch protection. No release setting changed.                                                                                                                                                                                                                                                                                                                                                                                    |

### Concrete owner decisions

1. **Repository:** explicitly retain public source, or authorize changing this
   repository to private. Private is the recommended audience while the product
   is an invited POC; public is viable if deliberate. Neither choice makes the
   application data public or replaces RLS. Making it private cannot recall
   existing copies and may affect collaborators/integrations and private CI usage;
   check those before any change. This PR changes no visibility.
2. **Leaked-password protection:** retain the existing bounded-pilot deferral on
   Free, or separately approve the paid plan and the Email provider's leaked
   password setting. Supabase currently requires Pro or above for this feature.
   It rejects passwords known to be compromised; current password users may need
   a recovery path under strengthened requirements. Do not emulate the feature
   with SQL or disable password login as an incidental workaround.
   [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
   and [current plan pricing](https://supabase.com/pricing) are the decision sources;
   obtain the actual account checkout total before approving spending.
3. **Personal-data handling:** if an erasure request arrives, verify the requester,
   inventory their Auth/profile and competitive references, and prepare a narrowly
   reviewed identity/anonymization proposal. The owner must choose the retention
   treatment before implementation. Do not promise a retention period that has
   not been adopted. Account deletion alone also does not immediately invalidate
   an already issued JWT; revoke sessions and verify authorization separately.
   [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data)

The repository owner/admin must also inspect GitHub Settings → Rules / Branches
for `main`, record the effective protection and required status checks, and verify
that the authoritative Phase 8C lane is required before merging. The integration's
403 cannot settle that check. No setting change is included in this PR.

### Backup and recovery procedure to approve and verify

- Name the operator and an access-recovery backup. Naming a backup does not grant
  dashboard access or commissioner rights. The existing commissioner-transfer
  procedure is in the [runbook](commissioner-runbook.md).
- On Free, take a controlled logical export using the supported Supabase CLI
  dump workflow and maintain an owner-controlled encrypted off-site copy.
  Inspect `supabase db dump --help` for the installed CLI first. Include roles,
  application schema/data, Auth data, migration ledger and any separately required
  Storage objects/configuration. Keep credentials and exports out of this public
  repository, PR artifacts and participant-accessible storage. No export of real
  user data was created by Stage 7.
- Record creation time, covered schemas, checksum, location and who can retrieve
  it. The owner chooses the cadence and acceptable data-loss interval before
  the pilot; no retention policy is silently adopted here.
- Verify restoration into an **isolated disposable target** with provider jobs
  and outbound email disabled. Compare counts and hashes for rules snapshots,
  receipts, results, standings, qualification, corrections and archives; run the
  existing authorization and lifecycle checks. Do not reset, replay migrations
  onto, or restore over Production to obtain evidence.
- A real incident requires a separately approved restore target/time and downtime
  decision. Restoring old data can lose accepted cards; record that risk and
  reconcile competitive evidence before resuming play.

Supabase's current guidance recommends exports for Free projects; Pro provides
access to seven daily backups. Database backups exclude Storage file contents.
An upgrade alone is not evidence that a usable restore point exists.
[Supabase backup/restore guidance](https://supabase.com/docs/guides/platform/backups)

## A14 — Focused maintenance

- **Implemented:** the identical database-only Phase 8A/8B setup now shares one
  composite action. Both workflow names, job names, full migration/pgTAP commands,
  permissions, time limits and unconditional cleanup remain. Changes to the
  shared action trigger both callers. The full Auth stack in Phase 8C remains
  separate because it needs additional services and configuration.
- **Implemented:** PR #37 is stacked on the focused deletion-guard PR #38.
  The three relevant workflows also accept that exact base branch so the stack
  receives the same required checks. After #38 is separately approved and merged,
  retarget #37 to `main` and recheck the resulting merge candidate. Neither PR
  is merged by this implementation task; the migration requires separate approval.
- **Implemented:** retain disposable full-stack JSON reports, screenshots and
  failure traces, plus pgTAP output. Report checks require selected full-stack
  tests to execute with zero skips. A test passing on an existing retry is stated
  explicitly; it is not silently counted as a first-attempt pass.
- **Implemented:** record each real rehearsal checkpoint's elapsed time,
  including the batched Week 14 step, without changing its 30-second assertion.
- **Verified already complete:** earlier stages already separated card persistence
  (`card-draft-storage.ts` / `use-card-draft.ts`), quote review
  (`application/providers/card-quote-review.ts`), result presentation
  (`project-paired-matchup.ts` / `paired-matchup-header.tsx`) and commissioner
  next-action projection (`commissioner-next-action.ts`). The new fix stays in
  their shared position editor. No general rewrite of the remaining large
  action/operations modules is justified by line count alone.
- **Implemented:** run 34675531261 captured a Week 14 timeout recurrence. The
  trace shows no confirmation-checkbox check after the streamed navigation, no
  subsequent action POST, and native validation focusing the unchecked required
  checkbox. The harness counted before the form arrived. It now waits for the
  actual action to be visible before discovering/checking its confirmation. The
  30-second completion assertion and existing retry policy are unchanged. This
  identifies this captured recurrence; it does not independently establish the
  cause of older runs without equivalent traces.
- **Awaiting named recurrence evidence:** the previously canceled database stall
  and historical rules-heading focus flake remain unobserved causes. Retain logs
  and traces if either recurs; do not weaken assertions or add arbitrary retries.
- **Implemented diagnostics, cause still unresolved:** the combined run
  34676439755 stopped producing suite output when the authoritative lifecycle
  test began at 05:49:34 UTC and was canceled by the superseding commit at
  05:57:56 UTC. Both independent database lanes and PR #38's full stack passed.
  This canceled run is not a pass, and its cause remains unobserved. The loopback-only runner now captures `pg_stat_activity` wait/blocking
  information after 90 seconds and fails after five minutes, preserving the full
  selected suite and its exit status. This bounds future stalls and collects
  evidence; a later fast pass does not identify this stall's cause.

## A15 — Accessibility and measured performance

### Implemented checks and focused fix

The deployed public practice editor reproduced a below-minimum stake with browser
validation active but `aria-invalid="false"`. Both shared-editor consumers already
validate the full stake/rules contract. The form now uses that validation to show
the linked error, mark the field invalid, keep its value and focus it even on a
repeated failed submission. The database acceptance rules are unchanged.

The new full-stack case also reproduced the mobile card tray collapsing its
remaining-credit text into a vertical column at 320px/200% text, covering the
20-pick review button. The shared tray now wraps its summary/action and reserves
its measured height with a cleaned-up ResizeObserver. Fixed builder padding is
replaced by that measured space in the signed-in builder and public Practice.
The regression retains a real unobstructed click on the covered review button;
it does not force-click through the overlay or substitute another control.
The populated card also exposed 398px of document width in a 320px viewport:
each long pick summary shared a rigid row with Remove. Those rows now wrap based
on their available space, preserving both the full description and the action.

Reviewing the retained axe **incomplete** entries and viewport trace also found
that long event text crowded the editor heading/close control beyond the viewport,
and the return summary used a label on a generic div. The event description now
scrolls with the editor body while heading/close remain visible; the summary is
a named group. The stake label and available balance also wrap onto separate
lines when needed instead of compressing the word “available”. The journey verifies the close target's bounds, actual click and
returned keyboard focus. Zero automated violations alone would not have closed
these manual-review findings.

The new disposable journey uses ten real local Auth identities, seven synthetic
events with long names and a 20-pick, 1,000-credit card constructed through actual
controls. It exercises 390px navigation, 320px/200% text entry and review, keyboard
activation, modal focus/close, invalid stake recovery, sealing, all 20 receipts,
the prepublication Standings page and prequalification Playoffs. Existing canonical rehearsal/markup
lanes continue to cover actual playoff rounds, changed odds, dark/live,
provisional/final/corrected and archive states. The Stage 4 presentation suite
retains long standings and playoff identity/numeric checks at 320px/200% text.
Markup-only checks are not
represented as signed-in full-stack checks.

Actual timer refresh is exercised in the real Live fixture using a virtual browser
clock; server time, Auth, RSC and RPCs remain real. Manual/automatic refresh must
retain focus and add no provider call. Only the compact existing score status
region announces score/phase changes; the entire scoreboard is not a live region.

**Measured desktop public-practice targets:** 1363×936 Chrome viewport, close
44×44px, outcome 251×80px, stake field 48px high, submit 510×48px. This is browser
evidence, not physical-device evidence. Product targets are 44–48px;
[WCAG 2.2 AA target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
uses 24px with stated exceptions.
The builder's kickoff filters also move from a 40px minimum to the product's
44px target, with rendered dimensions checked at 390px before text enlargement.
The 320px checks set the root font to 200% (32px); that is distinct from actual
browser zoom and does not enlarge text declared in fixed pixel units.

Representative token contrast calculations use sRGB relative luminance. They
supplement rendered axe scans and do not certify every possible background.

| Foreground / surface              |   Ratio |
| --------------------------------- | ------: |
| Primary text / white              | 16.62:1 |
| Muted text / subtle light surface |  4.88:1 |
| Registry button / white label     |  9.44:1 |
| Negative / white                  |  6.28:1 |
| Pending / white                   |  6.37:1 |
| Corrected / white                 |  7.63:1 |
| Dark muted / dark surface         |  8.09:1 |
| Dark pending / dark surface       |  9.12:1 |
| Dark negative / dark surface      |  6.66:1 |
| Control boundary / white          |  3.26:1 |
| Focus ring / white                |  7.08:1 |

### Performance conditions and results

Measurements are generated by `release-readiness-full-stack.spec.ts` and
`card-quotes-full-stack.spec.ts`. Conditions: GitHub Ubuntu runner, production
Next.js build, local Supabase Auth/Postgres, one browser worker, synthetic provider
responses, ten-member league, seven events, twenty picks. Browser widths/text
settings are recorded above; there is no mobile-network or CPU throttling.

Navigation ends only when an outcome is usable and its editor opens; seal ends
when the committed receipt-success screen is visible; refresh waits for the RSC
response and completed UI state. Query measurements count actual server PostgREST
HTTP requests by endpoint and duration, **not** internal SQL statements. No headers,
arguments, bodies, identities or receipt values are recorded in query diagnostics.
Provider counts come from the isolated adapter boundary. These measurements do
not establish hosted provider latency, internet p95 or production load capacity.

The completed desktop journey at head `52ce7709b413b657ae89e54aad5b28809b78d0db`
([run 34677458531](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/34677458531))
provides this initial baseline. All 13 desktop and eight mobile Auth tests passed
without retries in that run; its new mobile member test failed separately as
explained below. Final-head results, including the complete mobile member
measurements, are recorded in the PR release record and standalone handoff.

| Action                                     | Observed Chromium latency | PostgREST requests | Added provider calls | Initial investigation budget |
| ------------------------------------------ | ------------------------: | -----------------: | -------------------: | ---------------------------- |
| Navigation to usable Slate, 390px          |                     465ms |                  3 |                    0 | 1,500ms; at most 4 requests  |
| Twenty-pick seal to receipt                |                     358ms |                 13 |                    0 | 2,000ms; at most 14 requests |
| Ten-member pregame Matchup read, 390px     |                     471ms |                  6 |                    0 | 1,500ms; at most 7 requests  |
| Ten-member saved-state refresh after lock  |                     177ms |                  6 |                    0 | 1,500ms; at most 7 requests  |
| Stored score to visible provisional result |                     499ms |                  6 |                    0 | 1,500ms; at most 7 requests  |

The authoritative acceptance RPC took 39ms inside the 358ms seal journey.
The 13-request seal measurement includes completion of the legitimate fresh
quote check. The fixture starts with current stored quotes; zero added provider
calls does not mean a season needs no imports or score requests. The separate
score fixture had made seven synthetic provider calls since its reset before
the measured saved-state read; that read added zero.

These are explicit **investigation thresholds for this disposable CI fixture**,
with headroom over observed sub-second actions, not statistically established
p95 values, performance assertions with arbitrary retries, or hosted SLOs.
Investigate repeated over-budget latency under the same conditions, any increase
past the stated request budget, or any provider call on these saved-state reads.
First compare endpoint timings and preceding work; do not remove authorization,
quote review or freshness checks to reduce the count. No demonstrated latency
bottleneck justifies a production caching or broad analytics change here.

Run 34676898268 passed 945 database assertions and the 12 existing desktop
full-stack cases on their first attempt, including the repaired rehearsal harness.
The new journey reached sealing and receipt preservation, but its final refresh
measurement incorrectly looked for a Live-only control while still pregame. The
fixture now advances only its disposable event times and calls the real lock RPC
before measuring saved-state refresh after lock. No captured live score is
claimed for that ten-member fixture; the separate quote/score journey measures
a stored score becoming visibly provisional. Reviewing axe's incomplete entries also showed
that Standings/Playoffs scans had begun on “Opening the Ledger…”; they now await
the actual page heading before scanning. Earlier transient-page scans are not
counted as completed-surface accessibility evidence.

Run 34677458531 then completed the corrected desktop journey. Its mobile WebKit
trace showed a requested `50` fill leaving the default `250` in the field before
one submission, eventually exhausting the allocation early. The editor deferred
focus with animation frames even though native `showModal()` had already focused
the heading. Focus is now applied synchronously on open, close and validation,
removing pending focus work that could interrupt immediate entry. The regression
checks the field value and exact accumulated allocation after every one of the
20 picks; it does not retry the fill or relax the allocation rule. Final mobile
confirmation is recorded with the final tested PR head.

### Classification of remaining A15 evidence

| Audit task                                                           | Classification                                            | Evidence or named next check                                                                                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Narrow member journey, long names, 20 picks and error/modal recovery | Implemented                                               | Real disposable Auth → server action → RSC → RPC journey on Chromium and mobile WebKit; exact final results below/in the PR record.                                                           |
| Changed odds, event privacy, actual playoff rounds and result states | Verified already complete                                 | Retained quote/rehearsal full-stack cases and the separate shared UI acceptance suite. The new long-card case scans prequalification Playoffs; it does not itself create a published bracket. |
| Labels, focus and refresh announcements                              | Implemented verification; awaiting named real-world check | Keyboard assertions and DOM/axe checks are automated; VoiceOver, TalkBack and NVDA behavior requires the owner script below.                                                                  |
| Contrast and target sizes                                            | Implemented verification                                  | Token calculations and rendered scans/dimensions cover stated surfaces; no whole-product certification.                                                                                       |
| Navigation, seal and Matchup measurement                             | Implemented                                               | Measured local baseline and investigation budgets; no production SLO claim.                                                                                                                   |
| Physical device, software keyboard, actual zoom and recovery         | Awaiting named real-world check                           | Owner performs the six-step device script and records actual combinations/results.                                                                                                            |
| Provider latency and competitive weekly operation                    | Awaiting named real-world check                           | Owner observes ordinary authorized play during the two-week Stage 8 pilot.                                                                                                                    |

### Ordinary live operations

Read-only September 12 observations found quote/score policies enabled, daily and
monthly provider caps of 90/450, and provider-reported remaining credits of 458.
The stored seven-day request history contained one successful ODDS import at
04:21:13 UTC; one current successful quote refresh was recorded at 04:21:31 UTC.
There were no score-check rows. These are stored observations from ordinary use,
not calls made to produce this report. Do not infer a measured fetch duration
from the interval between different operations. Live score capture, quota usage
over a competitive week, and operator effort remain named Stage 8 observations.

## Exact owner device and assistive-technology script

Record device/OS, browser, assistive technology/version, zoom/text setting, step,
expected/actual result and a screenshot without email codes or personal data.

1. **Physical iPhone + Safari + Mail numeric recovery:** use your own authorized
   account. In a fresh Safari tab choose password recovery; request one code,
   switch to Mail and return to Safari. Enter the numeric code (not the fallback
   link), continue to password setup and finish it. Verify the intended destination,
   reload persistence and subsequent password sign-in. Record whether the original
   interruption recurs. Do not request multiple emails during a cooldown.
2. **iPhone VoiceOver:** enable VoiceOver in Settings → Accessibility. In public
   Practice, swipe through an outcome, its event/market/odds, the modal heading,
   stake field and submit action. Enter 49, submit and hear the linked error;
   correct it, add a valid pick, close/reopen and confirm focus returns correctly.
   Complete/review the unsaved practice card, approve the demonstrated changed
   odds and seal it. Confirm receipt and total-return explanation are understandable.
3. **Physical Android + Chrome + TalkBack:** repeat Practice and an authorized
   account recovery using Gmail/your normal mail app. Record the actual combination;
   WebKit emulation is not Android or TalkBack evidence.
4. **Windows + Chrome/Firefox + NVDA:** keyboard-only Tab/Shift+Tab/Enter/Escape
   through the same tasks. Confirm modal containment, visible focus, error recovery
   and returned focus. In a signed-in own league, visit Standings and Playoffs and
   confirm identity/record/seed and round labels remain understandable.
5. **Text/reflow and maximum card:** at 200% text and a narrow portrait viewport,
   verify the final pick, updated-odds action, seal action and bottom navigation
   remain reachable with the software keyboard open and closed. Use the isolated
   seven-event release fixture for a disposable 20-pick card, or your genuinely
   intended card during normal play. Do not seal a real experimental card solely
   to make this checklist pass. Test actual 400% browser zoom separately from a
   320px CSS-width simulation.
6. **Live updates:** during normal authorized play, leave keyboard/screen-reader
   focus on Refresh matchup or a receipt link. A saved-state refresh should keep
   focus/scroll position. Hear a concise changed score/phase announcement, not the
   entire screen or repeated unchanged values. A background tab should not poll.

Hardware and screen-reader observations above remain **awaiting named real-world
checks** until the owner records results. Stage 5 physical recovery-link success
does not close step 1. Do not contact participants on the owner's behalf.

## Pilot recommendation and release boundary

Proceed to the bounded two-week invited pilot only after the tested Stage 7 PRs
are separately approved/merged/deployed and the reviewed guard migration is applied, the owner explicitly settles repository
audience/password deferral, an operator and a usable backup/isolated-restore
record are in place, and the
primary physical-device/recovery and screen-reader spot checks are completed or
their specific limits explicitly accepted for the invited group. No broad launch
or accessibility certification follows from synthetic tests.

Stage 8 must observe two real weekly cycles: invitation → draft → quote review →
seal → authoritative event reveal → captured finals → correction/finalization →
standings consequence → voluntary return. Record member friction and operator
minutes manually. Keep social features, broad analytics, reminders, new markets,
paid services and gameplay changes outside scope. Rehearsal cannot certify this.

No Stage 7 production mutation, security/visibility setting, plan purchase,
provider request, participant message, hosted migration, merge or Production
deployment was performed.
