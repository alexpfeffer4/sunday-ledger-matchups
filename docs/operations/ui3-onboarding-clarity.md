# UI-3 — invitation continuity and practice scope

Scope: F08–F09 of the September 17 workflow/UI handoff, following UI-2 PR #75
at `c8dd31a3750d773a5ab0e62375614170ae048385`. The owner approved this scoped
implementation, merge after verification, and normal Production deployment.
The final status record and PR carry actual verification/release results.

## Changes

- Sign-in, signup, email confirmation, recovery and password/account setup show
  the intended league using only the existing token-scoped public invitation
  preview. The first-password detour unwraps only its existing safe `next`.
  Query-string labels cannot supply a league name. Missing, inactive or failed
  previews show generic copy without stale league facts or an admission promise.
- This is server-rendered presentation, not a new authorization layer. No invite
  facts enter browser storage or a persistent application cache. Existing safe
  redirects, authenticated re-entry, required setup, explicit Join, roster and
  invitation checks remain authoritative. The preview never accepts an invite.
- Email sign-in and request buttons describe email access without promising a
  numeric code. Guidance says to use a code **if included**, otherwise use the
  newest link in the requesting browser. Recovery success explains both paths.
  Existing challenges, expiry, resend guidance, replay protection and errors
  remain unchanged. No hosted template, sender, SMTP or Auth setting is changed.
- Account screens preserve room for 200% text on narrow displays. Method choices
  stack when their text no longer fits side by side, and password/recovery labels
  wrap. This fixes overflow reproduced by the new 320px real-Auth check; desktop
  spacing and all form actions remain unchanged.
- Public practice prominently identifies its older full-allocation, seal-once
  example. It briefly explains rolling submissions, immutable accepted bets,
  remaining eligible-game credits and expiry, and links to the existing Rules
  comparison. Historical week rules remain authoritative. The unsaved example's
  allocation, review, changed-price consent, sealing and settlement engine are
  untouched; no new rolling tutorial is introduced.

No migration, provider acquisition/budget change, live email, new member access,
UI-1 first-result-authority decision or UI-2 preference/storage change is included.
The existing UI-2 Schedule focus test now waits for its selector to be enabled
before focusing it, addressing the recorded hydration-order race without
removing the focus assertion or increasing timeouts.

## Verification contract

Retain the entire required Acceptance workflow. Focused units exercise safe
destinations, forged labels, the password detour, invalid tokens, expired/revoked
or unavailable previews, no stale fallback and the explicit join explanation.
The real disposable Auth lane checks invitation visibility throughout captured
email signup, profile retry, setup, returning-member access and first-password
access, and verifies that completing setup does not create membership.
Inactive invites remain generic across account routes. A long unbroken league
name is checked at 320px/200% text with keyboard recovery navigation and an
injected preview failure, only inside the loopback-guarded test stack.
Existing Chromium/WebKit practice checks cover the rules distinction while
retaining all full-card behavior assertions and accessibility checks.

Hosted Preview and Production are inspected read-only. They are not assumed to
use isolated data. Auth mutations/email delivery tests run only in the existing
disposable CI stack with captured `.test` mail, never against real recipients.
Automated emulation is not physical iPhone/Mail, Android, virtual keyboard,
screen-reader or human comprehension evidence; those remain manual gaps.

## Release and recovery

After the exact candidate passes required checks and Preview review, merge the
scoped PR through the normal workflow and verify Vercel Production READY at the
merge SHA with both public aliases. Inspect natural public navigation and runtime
errors without forced failures, league joins or bet submissions. No additional
Auth/configuration operation is part of this release. For an application
regression, roll back to UI-2 deployment `dpl_G5CBMbYiVe6f5Ye7DSThme1YANwF`
or issue a reviewed revert. No stored-data conversion is needed.
