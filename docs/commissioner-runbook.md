# Sunday Ledger Live commissioner runbook

This is the bounded operating sequence for one Live NFL season. The
Commissioner console is the only intended control surface. It never grants
access to sealed card terms and never permits direct edits to scores, records,
standings, schedules, seeds, or bracket winners.

## Before roster lock

1. Create the Live league and privately share a seven-day invitation code.
2. Confirm an even roster of 4–16 members.
3. Import the current NFL markets for private review.
4. Select the eligible Week 1 events. The standard set is Sunday games beginning
   at 1:00 p.m. Eastern or later plus Monday night; include Thursday or early
   international games only by affirmative selection.
5. Publish the slate once. Publication fixes the event set and common lock at
   five minutes before the first selected event.
6. Lock the roster and open Week 1. This freezes the ruleset, publishes the
   14-week opponent schedule, and creates equal 1,000-credit cards.

Do not reuse a test league whose Live slate has already been published. A
published event set is intentionally immutable.

## Each regular-season week

1. Confirm the prior week is FINAL.
2. Import the next NFL market set and review every selected event.
3. Publish the next slate. For Weeks 2–14, the frozen schedule supplies the
   opponents; the NFL slate supplies only eligible events and markets.
4. Refresh current odds before members build cards. The refresh must return the
   exact published event set.
5. At common lock, lock the week. Database time enforces the deadline even if
   the button is pressed late.
6. Refresh scores while games are in progress and promptly after completion.
7. Review provisional settlements, incomplete-card consequences, corrections,
   and the derived standings.
8. Finalize only after the 24-hour correction window closes and no correction is
   unresolved.

## Corrections and provider gaps

- A provider correction or audited manual objective result appends a new result
  version. Never attempt to replace an accepted receipt or earlier result.
- If an event remains unresolved, leave it pending.
- After the frozen 48-hour postponement window, use the documented void action
  only when the event has no on-field official result.
- A quote refresh that omits any published event fails closed. Review the
  provider response; do not change the published set.
- If a page fails to load, retry the page before repeating a command. All
  lifecycle commands are idempotent, but accepted entries should first be
  checked in My Card.

## Playoffs and season final

1. Finalize Week 14.
2. Publish the immutable qualification snapshot. Eligibility, standings order,
   and the top-four or top-six bracket come from the frozen rules.
3. Operate Weeks 15–17 with the same import, publish, lock, results, correction,
   and finalize sequence.
4. Confirm Week 16 reseeding in a top-six league before publishing its slate.
5. After Week 17 is FINAL and its correction window closes, finalize the
   champion and bracket. This makes the champion visible but does not create the
   complete archive.
6. Import and select the Week 18 provider slate, then publish the derived
   adjacent final-placement exhibitions. Placement and pairings are never
   commissioner inputs.
7. Operate Week 18 through the same card, lock, receipt, result, correction, and
   finalization controls as every other week.
8. Publish the complete archive only after Week 18 is FINAL, then verify Weeks
   1–18, qualification evidence, postseason roles, champion lineage, accepted
   receipts, corrections, and the archive hash from a member view.

Week 18 is exhibition/history only and cannot change the champion, regular
season record, or playoff seed.

Before the first successful Week 18 card seal, the console identifies the
pairing as replaceable. A documented authorized Week 17 correction may append a
replacement round only while Week 18 is planned or open and has no receipt,
score, or result. After the first seal, lock, score, or result, the pairing is
frozen. A later correction still appends champion and archive truth while
retaining the prior Week 18 pairings and results.

## Acceptance evidence for every operation

- The console reports the new lifecycle state.
- The participant route shows the same state without sealed opponent terms.
- A repeated command returns the same outcome instead of duplicating data.
- Vercel reports no current-deployment runtime errors.
- Supabase retains append-only receipts and version history.
