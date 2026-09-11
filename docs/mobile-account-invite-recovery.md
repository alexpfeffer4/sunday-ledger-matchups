# Mobile account and invitation recovery

Baseline: main `ac7c660ceac70638d67b4b204756731b4fcf86f5`, after PR #33 was merged and its Production deployment verified. Scope: the owner's report that a mobile member can sign in by email but cannot find password setup, and opening the invitation appears signed out.

## Findings and changes

Email sign-in deliberately returns existing accounts directly to their destination. A legacy passwordless member can therefore miss the signup-only password screen. The Account page already had a password form, but its “Change password” wording and the absence of a sign-in escape made first-password setup difficult to discover. Password sign-in now includes **Never made a password? Set one by email**, preserving the original destination through verified email access, `/account/set-password`, and saving the password. Account says **Set or change password**. Ordinary email sign-in also offers password setup explicitly. The same-password retry is idempotent; any other Auth rejection still blocks continuation.

Sessions belong to the browser that receives their cookies. Opening an invitation in another mobile browser does not carry the first browser's session. Existing PKCE emails additionally need the requesting browser's verifier. This is consistent with the reported symptoms; the original friend's exact browser/email sequence has not been observed.

Three complementary recovery paths are implemented:

1. **Email code entry:** signup, sign-in and recovery can verify an email code directly on the requesting page. Supabase verifies the code and issues the session in that browser. The server validates input, uses the provider's returned identity, keeps recovery separate, preserves safe destinations and retains a successfully verified session through profile failure. Code state is bound to the requested email/destination; a successful resend resets stale code errors. Inputs support numeric keyboards and one-time-code autofill. Codes are never stored in localStorage or included in application logs.
2. **First-password access:** a verified member can save a password and return to the invitation, then use ordinary password sign-in for future visits. No password or verification requirement is bypassed.
3. **Paste invitation:** **Your leagues → Join a league** accepts either the full invitation link or its existing private code. Commissioners can copy either from invitation feedback. The code is the existing high-entropy invitation token, not a new short/public league identifier. Parsing never fetches the supplied URL. The existing `join_league` RPC remains authoritative for authentication, expiration, revocation, capacity, locked rosters and repeat acceptance. No schema change is needed.

Email links remain available. Until hosted templates are activated, the UI explicitly says to enter a code **if included**, otherwise copy the newest email link into the requesting browser. The password and pasted-invitation changes work with the existing link flow. Code delivery requires the template activation below.

## Hosted email activation proposal

The hosted dashboard remains on its sign-in screen. Current template bodies, SMTP, rate limits and expiration settings were not accessible; no hosted setting was changed and no real-person email was sent. This proposal updates only the three email bodies, using the checked-in files as exact reviewable content:

| Auth email     | Body file                              | Verification type |
| -------------- | -------------------------------------- | ----------------- |
| Confirm signup | `supabase/templates/confirmation.html` | `email`           |
| Magic link     | `supabase/templates/magic_link.html`   | `email`           |
| Reset password | `supabase/templates/recovery.html`     | `recovery`        |

These files add `{{ .Token }}` for code entry alongside PR #33's proposed direct `{{ .TokenHash }}` confirmation links. Both representations follow Auth's existing expiration and one-time-use behavior. They preserve the app-issued `.RedirectTo` callback and its flow/destination. They add no tracking, external resources, email-address disclosure, or broader redirect allowlist.

Prompt 5 requires separate approval for merge and Production Auth settings. The prior merge authorization covered PR #33. After approval:

1. Merge this tested follow-up and verify its normal Production deployment before editing templates.
2. Sign in to the hosted project's Authentication → Email templates. Save the existing three bodies for rollback, then apply the three complete checked-in bodies above. Preserve existing subjects, SMTP, confirmation enforcement, expiry, rate limits and the narrow production redirect allowlist; confirm the Site URL/callback uses the actual canonical production domain.
3. With an explicitly approved owner test address, request fresh signup/sign-in/recovery emails. In each flow, stay in the requesting browser and enter the code. Separately verify the direct confirmation link in an independent browser. Do not reuse an already-consumed code/link for a success test.
4. On a physical iPhone and Android phone, test passwordless-member setup, later password sign-in and pasting the invitation into Your leagues. Confirm the intended league, session after reload, invalid-code recovery and resend focus. An invitation opened in an unrelated browser must still require authentication; no session-sharing promise is made.

Rollback: revert the follow-up through the normal PR/deployment process; restore the saved email bodies if activated. PR #33 already supports the direct hash links, so no database conversion or receipt/history repair is needed.

## Verification contract

The updated full-stack lane uses a disposable local Supabase Auth/Postgres service and captured Mailpit emails to reserved `.test` recipients. The new scenarios exercise signup code verification, invalid/replayed code rejection, an independent signed-out browser context, legacy passwordless access, first-password saving, invite-link/code acceptance, repeated acceptance, code-based recovery, subsequent password sign-in, session on reload and denial of expired pasted invitations. Existing email/link/profile/season-start/privacy regressions remain.

CI runs the full email suite on desktop Chromium and WebKit with an iPhone device profile. The latter is browser/device emulation, not physical Safari/Mail or hosted SMTP evidence. Credentials are excluded from traces, screenshots and videos. All Auth/database/mail targets are guarded to loopback addresses. Production receives no synthetic users or leagues.

Unit/component checks cover authenticated password updates, safe redirects, idempotent retry versus Auth rejection, provider verification and failure classification, code-request state, and invitation parsing. The completion handoff records actual final-head results; this document does not treat authored tests as passed tests.

## Handoff

Carry this follow-up and the pending hosted-template/physical-device checks into the Stage 6 handoff. Preserve PR #33's season-start controls and every earlier Ruleset, privacy, immutable receipt, correction and season-lifecycle contract. The mobile request authorizes this bounded account/invitation repair; it introduces no gameplay decision or short-code database engine.

References: [Supabase email templates and prefetch](https://supabase.com/docs/guides/auth/auth-email-templates), [passwordless email verification](https://supabase.com/docs/guides/auth/auth-email-passwordless), [PKCE browser constraints](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
