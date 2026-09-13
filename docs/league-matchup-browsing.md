# League matchup browsing

September 13, 2026. The owner asked to open other league pairings and follow their picks, as in a fantasy league.

Matchup and League Overview now link each current-week pairing to a selected matchup. The spectator view names both members, shows their current returned-credit scores and revealed picks, preserves refresh, and provides Back to your matchup. Incomplete cards remain visible with their official zero; browsing does not require both members to have submitted.

The additive authenticated `api.get_league_matchup_cards` read verifies current league membership (including existing private-rehearsal containment) and the requested week's league. It returns only event-revealed positions and post-lock compliance. Scheduled events, future start evidence, receipt hashes, acceptance timestamps, hidden allocations and pick counts are absent. Authoritative voids remain visible. Current scores sum only latest visible settlements for compliant cards; incomplete cards score zero and missing/pending state stays unavailable. Official result versions take precedence on published results. Existing owner reads, receipts, scoring and provider cadence are unchanged.

Before reveal, a member can open another pairing's names and empty matchup shell. This does not extend the pre-lock submission-flag decision to the whole league. Future-pick messaging depends only on the public slate, not the presence/count of another member's hidden picks.

Verification includes projection/component tests, database authorization/reveal/settlement tests, and the disposable real-account browser journey for a third member viewing a partially revealed 20-pick card, navigating back, and checking phone reflow at 320px/200% text. These checks do not represent a physical iPhone test.

Release requires the additive migration and application release. With an older database, other-pairing links remain unavailable and the existing own-matchup flow continues. No production migration or merge is authorized by this note. Revert the application commit to roll back; the additive read can then be revoked/dropped separately without changing stored competition data.

## Verification and handoff status

Local checks passed: 477 unit/property/component tests across 78 files, identity verification, formatting, lint, strict TypeScript, and production build. The build initially rejected the cross-worktree dependency symlink; copying dependencies into this checkout resolved that environment issue, and the normal build passed.

The owner approved branch publication and PR creation after the local checks. The additive migration and disposable database/browser regressions are prepared; CI validation is next. Production migration, merge and deployment have not been performed.

The branch is based on main `bb5010209198b4825ce98d66cc922b3e032e193d`. Release requires clean migration, generated-type and full-stack CI, including the new spectator phone flow, followed by production rollout authorization.
