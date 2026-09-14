# Automatic weekly results and matchup cleanup

The owner approved this change on September 14, 2026: show a final weekly result
when all games finish, remove the routine provisional-result wait, and simplify
the matchup display. This explicitly amends the former Ruleset §12 requirement
to wait 24 hours before finalizing a week. No new decision-register identifier
is assigned here.

## Weekly close

- A week closes automatically in the settlement transaction once every game in
  its published slate has a recorded final or void result, every card has a
  complete score, and every effective matchup has a result.
- An unpicked game still counts toward slate completion. A matchup that settles
  earlier says “Picks settled.” It does not imply the entire week is final.
- Final scores, matchup results, and regular-season standings are appended
  together. Repeating the close does not create more versions. The guarded
  commissioner RPC remains a compatibility acknowledgement for an already final
  week; automatic weeks do not display a Finalize Week button.
- This policy applies to currently unfinished and future weeks, including
  Simulation. Previously final weeks retain their historical close policy.
  Frozen card terms, numerical rules, accepted receipts, schedules, and prior
  ledger versions are unchanged.

## Verified corrections

The existing 24-hour score-review period remains available after automatic
finalization. A verified provider update or authorized objective correction
appends the corrected result, score, matchup, standings, and visible history.
The new terminal versions remain final. Repeating the same correction remains
idempotent after its review period closes.

Background checks keep their existing cadence and budget, including checks for
the finished week when a later week is open. Eligibility ends at the review
deadline. This introduces no new timer, job, subscription, or increased budget.

The existing integrity boundary for downstream playoff qualification, pairings,
champion publication, and the complete archive is preserved: these publications
wait for score review, so a permitted correction cannot strand frozen dependent
records. The authorized late Week 17 correction path remains intact.

## Matchup presentation

- Normal updates show the last successful check time and refresh control.
  Consumers do not need the polling interval. A short amber message appears only
  for an actual delay or required review affecting an unsettled matchup.
- Remove “correction deadline unavailable.” Before the slate finishes there is
  no review deadline to display.
- Align remaining-return metrics despite wrapped labels, shorten the labels,
  and hide that panel when both cards have settled.
- Won and Lost badges retain text and color without redundant checkmarks or
  exclamation points. Text supplies the non-color distinction.

## Verification and release

New database acceptance covers the default policy, an unpicked unfinished game,
final/void completion, atomic final versions, retries, permissions, corrections,
receipt preservation, review expiry, and downstream publication gating.
Historical-policy fixtures remain explicit compatibility tests. Authoritative
full-season and browser suites exercise the automatic default, including
Simulation corrections and the owner rehearsal. Record completed release
evidence in the pull request.
