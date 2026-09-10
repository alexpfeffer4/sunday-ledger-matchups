# Invitation previews and account email recovery

The owner requested invitation-specific iMessage previews and then reported an
iPhone account-creation screen displaying both an invalid-email-link error and
an email-request rate limit.

## Invitation preview

The join page previously inherited the root social title and neutral matchup
image. It now supplies `Join [league name]`, invitation copy, and a static
1200 × 630 invitation image. The league name comes only from the existing
token-scoped public preview; invalid links and preview errors use generic copy.
The page and metadata share that lookup within a single request using React
`cache`, with no persistent cache of invite facts.

The image contains no league, member, invite-token, pick, or score data. Its
content-hashed static URL is identical for every invitation. The root image and
approved identity geometry are unchanged. Regenerate the invitation export with
`node scripts/generate-invite-preview.mjs`.

## Account email findings

The screenshot establishes a failed callback and an email-send cooldown. It
does not identify the underlying Auth error. The previous callback discarded
all errors, reported every one as an invalid link, and always redirected to
existing-account sign-in, including when creating an account or recovering a
password. A failure after successful verification could therefore be mistaken
for an expired email. The form also allowed immediate repeated requests and
lost its uncontrolled email value after submission.

The deployed SDK uses PKCE for email links. Such links can fail if opened in a
different browser or after verifier storage is lost. Email scanners and reused
or expired links are other possible causes; none is confirmed for this person's
attempt. Hosted Auth templates were not accessible in the connected browser
without a dashboard sign-in, so their current contents were not verified.

This change:

- Accepts the supported `signup` token type and routes it through account setup.
- Forwards an optional SDK `sb_flow_id` when exchanging a PKCE code.
- Keeps failed signup and recovery links in their original flow and preserves
  the league destination.
- Gives missing/mismatched browser verifiers specific recovery instructions.
- Preserves a successfully verified session when profile creation fails;
  account setup retries the same idempotent profile function.
- Retains the entered email and shows a 60-second resend cooldown after a sent
  email or provider rate-limit response. The provider remains the authority on
  whether another email may be sent.
- Replaces an old link-error notice after an email request and tells mobile
  users to open the newest link in the browser that requested it.

No production email was sent, user account was modified, authentication
protection was relaxed, or hosted Auth setting was changed.

## Validation

`npm run verify` passed: identity exports, formatting, lint, types, all 291 tests,
and the production build. Callback regression cases cover signup hashes,
each failed flow, both verifier-error codes, flow-id forwarding, and profile
failure after verification. The form test covers email retention, removal of
the stale error, and a disabled resend countdown.

A production-build HTTP check using a link-preview crawler user agent verified
one invitation title/description/image in the initial document head, matching
Twitter metadata, `noindex, nofollow`, and an unauthenticated 200 PNG response
(1200 × 630, 45,378 bytes). The image was visually inspected. This is not a
claim of testing Apple's Messages app on a physical iPhone.

## Remaining hosted verification

After deployment, verify a newly issued signup email in the requesting mobile
browser through username/password setup and the original league destination.
Previously consumed or expired emails cannot be repaired by this change.

If cross-browser email confirmation is desired, inspect both the **Confirm
signup** and **Magic link** templates before changing them. Supabase documents
token-hash verification for server-rendered applications and an explicit
confirmation step or email OTP to protect against email-link prefetching.
That template/confirmation-flow change is not silently included in this patch.

References:

- [Apple rich-link metadata](https://developer.apple.com/videos/play/tech-talks/205/)
- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Supabase email templates and prefetching](https://supabase.com/docs/guides/auth/auth-email-templates)
