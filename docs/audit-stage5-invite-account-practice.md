# Audit Stage 5 — invitation, account, practice, and season start

Baseline: main `f74ebc4bba0f7d8b5b14dde6a09085407377e860`, including Stage 4 PR #32 and its pre-merge review fixes. Scope: Prompt 5 / remaining A09 and account-recovery A13, plus the owner's explicit request for an easy commissioner roster-lock / season-start path.

## Confirmed findings and changes

- PR #28 already supplies token-scoped invitation metadata, the static 1200 × 630 invitation image, distinct account intent, PKCE flow ID forwarding, and session-cookie preservation after profile failure. Those paths remain. Inactive invitation metadata now says the invitation is unavailable and exposes no league facts.
- Roster lock existed only after importing and publishing the first slate. League Overview lost its formation action as soon as a planned week existed, and the final lock form was below invitation and quote controls. Forming Matchup/League now offer **Start season** for a valid roster; a planned Live slate offers **Lock roster & start season**. The Commissioner next-action panel contains the final lock form and its confirmation; completed invitation setup collapses when ready. Before publication, Start season leads to game selection and explains the remaining steps. No games are silently selected/published, and navigation performs no provider call.
- The existing commissioner action still checks identity, member count/entries, draft lifecycle, planned slate, quote freshness, and database authority. Its atomic roster/rules/schedule freeze and Week 1 opening remain unchanged. There is no new commissioner privilege or shortcut around the game deadline. Ordinary Simulation and owner rehearsal retain their existing engines.
- Password recovery had no resend countdown and retained an old invalid-link banner after a successful request. It now shares the signup countdown, preserves the email, replaces stale feedback, and retains a Create account escape route. The countdown is guidance; Auth still enforces its real limits. Network ambiguity no longer promises that no email was sent.
- Email callback GET immediately consumed credentials, so app-side prefetch could use a link. GET/HEAD now lead to a branded confirmation page without verification. Only an explicit same-origin POST exchanges the credential. Type validation, PKCE verifier checking, no-store responses, credential-free origin-only confirmation-page referrers, no-referrer callback responses, cookie forwarding and safe internal redirects remain. Auth outages are distinguished from invalid/expired links.
- Verified profile failure now has an inline retry that keeps the session and exact destination. A short-lived HttpOnly navigation hint, tied to the verified user ID and cleared after setup, resumes interrupted signup from Create account. Completed accounts continue straight to their requested destination. The hint never grants authentication or authorization. The chosen username survives recoverable action errors. A setup retry that receives Auth's `same_password` result may continue because the existing password already matches; other failures still block completion.
- Practice's active headings are **Build**, **Review**, **Card sealed**, **Your result**. Stake-entry total return already came from Stage 3's shared editor; review now includes the same return/profit breakdown and example kickoff. Final is neutral, outcome text says won/lost/tied, phase headings receive focus, and the finished example has one primary **Start a real league** action. Practice is still unsaved and uses the existing settlement arithmetic.

These are reproduced source/test findings, not a diagnosis of the original person's email. Expired/used tokens, missing PKCE verifier and delivery/verification outage remain distinct cases. The original error and physical iPhone Mail behavior are not established by this PR.

## Email template proposal — separate production approval required

The Auth dashboard redirected to sign-in during read-only inspection. Its current templates, expiry and rate-limit settings could not be verified. No hosted Auth setting was changed and no production authentication email was sent.

The exact proposed bodies are:

| Dashboard template | Proposed body                          |
| ------------------ | -------------------------------------- |
| Confirm signup     | `supabase/templates/confirmation.html` |
| Magic link         | `supabase/templates/magic_link.html`   |
| Reset password     | `supabase/templates/recovery.html`     |

For app-issued requests, each uses the already allowlisted `.RedirectTo` callback (which carries `flow` and safe `next`) plus `.TokenHash` and the matching verification type. Signup/magic link use `type=email`; recovery uses `type=recovery`. Requests without a redirect use `.SiteURL/auth/confirm`. Templates contain no email address, league token copy, external image, or tracking link. The recipient explicitly confirms on the app before the hash is consumed. Keep hosted link tracking disabled for authentication links.

This proposed configuration enables confirmation in another browser without the original PKCE cookie and protects direct token-hash links from ordinary GET/HEAD scanners. Existing `.ConfirmationURL` emails still work with the same-browser PKCE path, but their upstream Auth verification endpoint can consume the token before the app sees it. The app alone cannot protect that upstream hop or make a PKCE code portable. A scanner that actually submits the confirmation form is outside the GET/HEAD proof.

After approval: first deploy the reviewed app, save the exact current three hosted template bodies for rollback, apply the three proposed bodies, and keep existing email-confirmation enforcement, SMTP, expiry, rate limits, and narrow redirect allowlist. Verify Site URL and allowed production callback match the actual app domain; do not add wildcard third-party origins. Test one newly issued email for each flow with the owner's test address, in the requesting browser and another browser, through the original invitation. Do not use an old email as the acceptance test. Do not edit hosted templates before deploying the confirmation page.

Rollback: revert the app through the normal workflow; restore the saved template bodies if they were activated. No migration or receipt/history conversion is required. Existing token hashes retain Auth's ordinary expiry and one-time behavior.

## Verification and limits

The PR runs the existing quality/database/privacy gates plus:

- Component/action checks for all valid roster sizes, invalid counts, confirmation placement, preservation of input, countdowns, safe redirects, cookie retention, unsupported OTP type, cross-origin POST rejection and outage classification.
- Public Chromium/WebKit checks for auth intent, invalid invitations, practice return explanations, changed-quote confirmation, sealed privacy, result focus, accessibility and small-screen reflow.
- A disposable full-stack Auth lane using actual locally captured emails and the proposed templates: signup and invite join; same/another browser; safe GET/HEAD prefetch; repeated/expired links; original PKCE same-browser and missing-verifier recovery; profile failure after verification; interrupted setup; returning email sign-in; password reset; inactive invite metadata/image response.
- The existing real card-quotes lane now starts the four-member Live season through League → Commissioner → roster-lock form and checks authoritative open-week state.

The CI-only initializer enables email confirmations, sets a one-minute per-address email cooldown in the disposable stack, and configures the checked-in template proposal. A direct repeat request verifies Auth rejects sending during that cooldown; this is not a claim about the uninspected hosted limits. All Auth/database/mail endpoints must be loopback addresses. The full-stack lane runs one worker so injected profile failures and provider fixtures cannot overlap between scenarios. Synthetic email recipients use reserved test domains and Mailpit capture. Fault injection exists only in the existing test preload, never in production source. It intercepts only a chosen local profile RPC; all successful Auth/session/RPC steps remain real. Browser traces are off for email credentials.

Local Docker/Supabase are unavailable in this workspace, so the real email lane runs against GitHub CI's disposable local stack. The final completion note records exact test results and any failures; authoring a test alone is not a pass. Physical iPhone/Android, VoiceOver/TalkBack, hosted SMTP delivery and client preview caches need separate observations.

## Stage 6 handoff

Preserve all Stage 1–4 contracts and the prospective V1.2/frozen V1.1 distinction. Stage 6 owns governing-source reconciliation; this stage adds no gameplay decision or ruleset. Incorporate the explicit owner-requested season-start usability change as a presentation of existing authorized commands. Preserve the pending template activation and real-device checks. Stage 7 retains the historical owner-rehearsal Week 14 flake and earlier ordinary production quote/score observations; a green rerun does not diagnose that flake.

References: [Supabase email templates and prefetch](https://supabase.com/docs/guides/auth/auth-email-templates), [local email template configuration](https://supabase.com/docs/guides/local-development/customizing-email-templates), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
