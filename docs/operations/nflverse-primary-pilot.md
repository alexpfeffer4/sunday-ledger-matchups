# nflverse primary pilot: release and exception handling

Read with the [September 15 governing amendment](../governance/2026-09-15-nflverse-primary-pilot.md).
Use the explicit `NFLVERSE_PRIMARY` policy only for its approved scope. The
existing Odds API remains the source for the reviewed DraftKings lines and team
results. API-Sports and SportsGameOdds are not acquisition or settlement
dependencies of this mode.

## Readiness and release order

1. Start from current main and preserve the merged scheduled-day filters,
   historical matchups and completed reset support. Record the exact tested
   commit, required database/Auth/concurrency checks and isolated Preview.
2. Apply reviewed additive migrations and deploy compatible code with new offers
   disabled. Verify migration identity and content parity without rewriting the
   hosted migration journal or an already applied migration.
3. Verify current nflverse roster, schedule, player totals and PFR snaps. Bind the catalog to a truthful pregame snapshot and
   stable event/player/team mappings. Same-name, missing-ID, duplicate or
   wrong-team rows must fail closed. File-level success is not game-level
   completeness; retain the separate source timestamps and content revisions.
4. Record the verified evidence hash and retained approval reference through
   `private.configure_nflverse_primary_pilot(text,text)`. It selects
   `NFLVERSE_PRIMARY` with `FEATURED_HIGHEST_STANDARD_LINES` and an immutable
   validation audit; it does not enable processing, metadata, validation flags
   or offers. Verify `private.player_source_policy_validated()` after the
   nflverse contract flag is truthfully enabled. Never set the API-Sports flag
   to pass an nflverse-only readiness check.
   For each team, acquire the QB with the highest standard passing line, RB
   with the highest standard rushing line and WR/TE with the highest standard
   receiving line. Verify positions from roster mappings; a QB rushing market
   cannot fill an RB slot. Label these as featured players, not confirmed
   starters. Odds do not guarantee health, availability or participation.
   Depth acquisition is not required. Do not infer position from a market or
   use a silent usage/depth fallback when a standard line is missing.
   Missing lines, tied nominations and identity ambiguity must be visible.
   All three rankings use the latest coherent per-game snapshot within the
   twelve-hour discovery window; its bookmaker observation must be at most ten
   minutes old at acquisition, with no future times. Show the snapshot time in
   commissioner review. This nomination evidence does not relax executable
   member quote freshness or consent.
5. Reuse the verified Odds API key and 20K subscription. Check the current
   entitlement before guarded catalog/activation operations. Keep the approved
   1,000/day and 5,000/month application caps and protected core capacity of
   350/day and 2,000/month; preserve actual usage. No nflverse key or statistics
   purchase is required.
6. Configure and verify the existing five-minute dispatcher and player-result
   delivery against the tested application. Enable only the selected validated
   policy. Ensure missing data creates incidents, completed results stop
   unnecessary retries and duplicate delivery cannot duplicate settlement.
7. Obtain the actual commissioner's full-slate review through authenticated
   controls. Record the reviewed menu and readiness hashes. Local fixtures,
   retrospective usage leaders and successful downloads do not substitute for
   this review or current bookmaker identity/line coverage.
8. Activate only while the scope's authoritative guards pass. Ordinary future
   weeks use the unopened-week sequence. The already-open Week 2 uses its
   [dedicated runbook](week2-props-cutover.md), reuses the completed exact reset
   and freezes the complete reviewed menu in the cutover transaction. Do not
   reset again, expand the approved scope or cancel new accepted picks.
9. Verify member-visible availability, unchanged main markets, frozen players,
   current-price consent, privacy, pending results and budget protection. Record
   actual hosted timing when genuine accepted props finish; do not place test
   bets in the real league to manufacture evidence.

The pre-release real-data validation establishes usable current-season fields,
many correct player joins and conservative missing-data behavior. It does not
establish an actual approved future menu, complete DNP coverage or measured
hosted settlement latency. The [earlier readiness report](2026-09-15-nflverse-readiness.md)
records its own sample and limitations; later implementation tests and live
observations must be reported separately.

## Overnight results and verified exceptions

After reliable final detection, process the selected player's published yardage
and offensive participation only when the game/player evidence is complete.
Keep each source revision and its own timestamp; a new download is not a new
statistic. A player who has a verified offensive snap but no explicit total is
pending, even if a zero would appear plausible.

The operating expectation is overnight results, with later updates possible.
The [published schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
places player totals on nightly processing and PFR snaps on four daily runs,
subject to the upstream source. The separate postseason-only FTN participation
dataset is not the in-season participation source.

When a selected prop remains unresolved after its bounded automatic attempts:

1. Inspect the incident and exact accepted player/game/statistic. Verify the
   authoritative final event and stable identity; preserve the receipt and all
   prior evidence. Determine whether the gap is identity, explicit total,
   offensive participation, source completeness or a disagreement.
2. Check a newer published nflverse revision first. If it resolves the gap,
   import through the normal authenticated service authority with its actual
   source revision and timestamps. Never overwrite a prior observation.
3. If the gap persists, prepare a narrowly scoped verified-evidence correction
   with an identifiable official gamebook or equivalent published authoritative
   source. Record the exact fact supported, source URL, source/fetch times,
   identity mapping and reason. A gamebook's starting lineup or a player absent
   from a stat table alone does not prove zero offensive snaps. Require explicit
   offensive participation or an explicit zero-offense fact as applicable.
4. For an otherwise-unsettled accepted prop, use the service-only
   `api.resolve_verified_player_result_exception` with the exact event, subject
   and statistic; explicit offensive snaps and yardage for offensive
   participants (yardage may remain null for verified zero offense); statistic and
   participation source URLs; evidence hash; authorized actor; reason; and
   idempotency key. The resulting observation has separate
   `VERIFIED_EXCEPTION` provenance and retains the review/correction audit.
   It must not masquerade as an nflverse publication or override an existing
   settled result. Verify the proposed fact before committing. Technical access
   is not permission to directly edit a result, score or settlement.
5. Recompute only through the existing result authority. Check the member's
   result and pending state, derived score and correction audit. If evidence is
   still insufficient, retain the incident and pending prop; timeout never
   authorizes zero, DNP, a refund or fabricated finality.

This is exceptional handling, not routine commissioner statistic entry. Before
offers are enabled, the release check must establish that this authorized
verified-evidence path is executable, not merely described here.

The provider recommends another update Wednesday night into Thursday for NFL
stat corrections. Use the existing correction authority and its original review
boundaries for such evidence. Do not extend an automated retry horizon merely to
wait for Thursday, restart correction clocks, force a new waiting period or
silently recompute protected postseason/history. A late correction requiring
review remains a recorded candidate until that authority resolves it.

## Compatible recovery

Disable new prop offers through `scripts/player-props/disable.sql` when necessary.
Keep a compatible application and accepted-prop result processing, reveal,
corrections and history. A source outage does not erase accepted bets or justify
switching their evidence policy silently. Preserve the exact completed Week 2
reset and cancellation audit; recovery never reactivates canceled receipts.
