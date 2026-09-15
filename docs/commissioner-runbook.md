# Sunday Ledger Live commissioner runbook

September 14 policy note: read this runbook with the
[automatic-weekly-results amendment](governance/2026-09-14-automatic-weekly-finalization.md)
and [rolling-submission amendment](governance/2026-09-14-rolling-submissions.md).
Ruleset 1.3 is prepared for a separate future-week activation; it is not active
merely because its implementation is present. Check the week's actual rule
identity before using the version-specific instructions below.
The later owner-approved visibility exception also shows accepted game
identities in the current legacy week. It does not reopen its submission window
or change its credit, scoring or attendance rules.

This is the bounded operating sequence for one Live NFL season. The
Commissioner console is the only intended control surface. It never grants
access to sealed card terms and never permits direct edits to scores, records,
standings, schedules, seeds, or bracket winners.

The [Stage 1 quote policy](audit-stage1-quote-reliability.md) is active as of
September 10, 2026 (PR #29). Members explicitly review current quotes; commissioner
refresh shares its lease and quota. [Stage 2 checkpoint score updates](audit-stage2-live-operations.md)
were activated in the approved Stage 2 rollout. A read-only Stage 7 check on
September 12 confirmed quote and score policies enabled. Check the console's
automation status for the current week; configuration can change. Publication
remains an explicit operating action. Current automatic-policy weeks finalize
through the guarded settlement path once their published slate and competitive
results are complete; a commissioner does not need to wait 24 hours to make
those weekly results final. Downstream playoff/archive publication still waits
for its applicable score-review gate.

## Before roster lock

1. Create the Live league and privately share a seven-day invitation code.
2. Confirm an even roster of 4–16 members.
3. Import the current NFL markets for private review.
4. Select the eligible Week 1 events. The standard set is Sunday games beginning
   at 1:00 p.m. Eastern or later plus Monday night; include Thursday or early
   international games only by affirmative selection.
5. Make the week available once. This fixes the event set and published timing.
   Legacy weeks use common submission lock five minutes before the first event.
   A week that later adopts 1.3 uses each game's scheduled kickoff for submission;
   the former common-lock time remains only for the approved aggregate display.
6. Lock the roster and open Week 1. This freezes the ruleset, publishes the
   14-week opponent schedule, and creates equal 1,000-credit cards.

Do not reuse a test league whose Live slate has already been published. A
published event set is intentionally immutable.

## Each regular-season week

1. Confirm the prior week is FINAL.
2. Import the next NFL market set and review every selected event.
3. Make the next week available. For Weeks 2–14, the frozen schedule supplies the
   opponents; the NFL slate supplies only eligible events and markets. Opening
   the next week adopts the latest supported, approved rules package. An already
   opened week retains its rules for every member; earlier receipts, results,
   published standings and brackets are preserved.
4. Refresh current odds before members submit. A 1.3 week supports later reviews
   for remaining eligible games through their own cutoffs, using the same
   bounded quote policy. Neither refresh nor a delayed kickoff report changes
   the published event set or reopens a closed game.
5. For a legacy week, database time enforces its common submission deadline even
   if the operating lock runs late. For 1.3, later games remain open until their
   individual cutoffs; no commissioner action may close all submissions at the
   former common lock. Unused allocation expires at the last published cutoff,
   and only zero accepted bets then creates a missed week. A partial card counts
   as participation.
6. Confirm each game start near kickoff. With Stage 2 enabled, the server checks
   at kickoff +2, +7, and +17 minutes until play is confirmed, with up to five
   minutes of scheduler delay. Scheduled time alone never reveals picks. After
   confirmation, no continuous score fetch runs: the first result check is at
   kickoff +4 hours. Only a provider-confirmed final settles a game. Check again
   for overtime/unfinished games at +4h30, +5h, +6h, +12h, +24h, +48h, and +60h
   as needed. An unavailable response gets two short retries, then returns to
   remaining checkpoints. If automatic checks are off, use **Refresh NFL scores
   & settle completed games** at these times; the same budget and lease apply.
7. Review settled bets, applicable participation consequences, corrections and
   derived standings. Selected game identities appear immediately after a
   successful submission, including a legacy whole-card seal in the current
   week. Actual selections retain their existing start/void reveal boundary.
8. Current automatic-policy weeks finalize when every published-slate game has
   a final/void result, complete scores and matchup results exist, and no later
   valid submission remains possible. An early settled card alone does not close
   the week. Preserve the score-review period for verified corrections and
   downstream publication. Historical weeks retain their attached close policy.

## Enabled player-props pilot

For a week that has actually adopted the supported props package, use the
[approved nflverse pilot](governance/2026-09-15-nflverse-primary-pilot.md).
Review the full slate once: each team's QB with the highest standard passing
line, RB with the highest standard rushing line and WR/TE with the highest
standard receiving line in the pregame nomination snapshot. Verify flagged
identity/position issues; QB rushing markets cannot fill RB slots. These are
featured players, not confirmed starters, and odds do not guarantee participation
or availability. No player may replace a frozen identity after acceptance.
The approved already-open Week 2 exception has a separate guarded cutover and
must preserve its completed reset audit.

Player results are expected overnight, with later updates possible. Pending
player results are not a loss or a void and may hold up the required weekly
finality. Missing rows do not prove zero yardage or no offensive participation.
After bounded retries, follow the [verified-exception runbook](operations/nflverse-primary-pilot.md)
with identifiable published evidence and an authorized operator. Routine manual
stat entry is not required, and commissioners cannot assign arbitrary results.
Later source corrections retain the existing review windows and protected
postseason/history process; the source schedule creates no new deadline.

## Backup operator and retention deadline

Choose a backup member before Week 1. Naming someone is **not** authorization.
While still available, the current commissioner uses **League settings → Transfer
commissioner**, selects that member, and confirms the named impact. The existing
`api.transfer_league_commissioner` changes the roles atomically. The new operator
can run score/correction/finalization controls; the old commissioner immediately
loses those rights. Neither gains access to unstarted opponent receipts. The new
commissioner must transfer the role back later. Test this in the disposable lane.

If the current commissioner is already unavailable, the backup cannot self-promote.
Restore that commissioner's account through normal account recovery first; otherwise
leave the week pending and escalate to the owner for a separately authorized access
recovery. Never share passwords or provide service credentials to a league member.

Completed-score retrieval covers up to three days. Capture **each selected game's**
final within 48 hours of its original scheduled kickoff. This is a conservative
operating target; do not wait until the last game of the entire slate finishes.
Automatic retries stop at kickoff +60 hours. A previously captured final remains
stored when that event disappears from the provider; other dates continue importing.
If a game has never been captured, use the existing objective result/correction path
with an identifiable official source, or the frozen 48-hour void policy when its
conditions genuinely apply. Never fabricate a score or finalize an unresolved week.

## Corrections, retry recovery, and safe failures

- A provider correction or audited manual objective result appends a new result
  version. Never attempt to replace an accepted receipt or earlier result.
- If an event remains unresolved, leave it pending.
- After the frozen 48-hour postponement window, use the documented void action
  only when the event has no on-field official result.
- A quote refresh that omits any published event fails closed. Review the
  provider response; do not change the published set.
- If a page fails after a command, reload first. A completed card appears in My
  Card; a completed commissioner step appears as the current state. Repeating
  the unchanged action uses the same logical operation key and reports
  **Already completed**. Changed games, quotes, scores, or correction text
  require a fresh review and cannot reuse the ambiguous operation.
- A failed odds import saves no partial provider batch. An earlier reviewed week and
  accepted cards remain unchanged.
- A failed quote refresh keeps the published game set, cutoffs, current quote
  heads, and accepted receipts unchanged. Do not seal against an unreviewed
  changed quote.
- A failed lock leaves cards open unless database time has already made them
  unavailable. Reload to confirm; it never reveals future opponent terms.
- A partial provider response can capture the available selected games. Missing
  games remain pending and are retried separately. Each league/week import is
  transactional; one failed week cannot discard another league's captured finals.
  A failed game update never invents a final or erases a prior result.
- A failed settlement, correction, finalization, playoff, champion, Week 18, or
  archive command is atomic. Reload before retrying; prior versions remain
  intact, and a committed unchanged retry returns the original outcome.

## Playoffs and season final

1. Finalize Week 14.
2. Confirm the immutable qualification snapshot. Eligibility, standings order,
   and the top-four or top-six bracket come from Week 14's rules. A later
   rules release cannot reseed the published bracket.
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
8. Finalize the complete archive only after Week 18 is FINAL, then verify Weeks
   1–18, qualification, postseason roles, champion history, accepted receipts,
   and corrections from a member view. Technical hashes remain under Audit
   details.

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

## D-009 evidence and Stage 2 status

The original deterministic provider rehearsal covered a complete week plus a
simulated network loss followed by a successful explicit retry. Stage 2 implements
the owner's selected game checkpoints, partial score capture, shared budget,
and existing authorized backup transfer. Its migrations and scheduler activation
were approved in Stage 2; Stage 7 rechecked the enabled policies. The console
must report whether automatic checks are enabled; while off, follow the manual cadence above. There is no second
provider or unattended finalization. Real-world operator effort and ordinary
Production result capture remain pilot evidence to collect.

## Release security and device checks

See the [Stage 7 release-readiness report](audit-stage7-release-readiness.md) for
repository visibility, password-protection decisions, personal-data handling,
backup/restore procedure, measured evidence and the exact physical-device script.
A real two-week invited pilot is still required; synthetic tests do not replace it.
