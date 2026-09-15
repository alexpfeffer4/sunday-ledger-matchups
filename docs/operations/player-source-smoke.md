# Private API-Sports release diagnostic

This bounded diagnostic checks actual 2026 NFL access before source approval or
Live player-result processing. It runs only after an explicit operator invocation
against the reviewed deployed release. Installing the migration makes no provider
request and enables no scheduler, offers, catalog, processing or source flag.

## Scope and accounting

`POST /api/operations/player-source-smoke` requires the existing `SCORE_JOB_SECRET`
bearer authorization and an opaque `X-Operation-Key`, such as
`player-source-smoke-2026-01`. Obtain authorization through the existing Vault
dispatcher path; never copy either provider key into a request or chat. The
server reads `API_SPORTS_NFL_KEY`. The request body cannot choose a season, game,
provider URL, roster, or key.

One sample makes a quota-free account-status check followed by at most five
charged API-Sports requests:

1. NFL league coverage for 2026.
2. The 2026 NFL schedule; select the latest already-started regular-season game
   carrying the provider's `FT` or `AOT` final status.
3. That game's away-team roster.
4. That game's home-team roster.
5. Its individual-player box score.

Every data call reserves a `METADATA` request before HTTP. Normal catalog work
and this diagnostic share the existing **20 metadata/day**, **80 results/day**,
**at most eight total requests/minute**, observed lower rate limits, account
headroom, backoff and result-priority controls. Diagnostic reservations also have
a fixed **20-request aggregate ceiling for this rollout**, across operation keys
and UTC days, and a five-request ceiling per sample. Failed/expired reservations
remain counted. Neither retries nor UTC rollover reset that aggregate ceiling.

Repeated operation keys return the recorded result or `BUSY`, without another
sample. An unavailable or partially deferred sample requires a new explicit
operation key for another attempt; the same aggregate ceiling still applies.
Lower observed limits may defer a sample. No timer or scheduled job retries it.
The worker stops starting requests after its bounded execution window.

## Evidence and limits

The protected response contains booleans/counts, the diagnostic identifier and
check time. The private diagnostic row can retain only the selected game/team
IDs, safe counts/booleans and a fixed failure stage/code. Raw roster responses,
player names, yardage values, box scores, account details and keys are discarded.
Provider redirects are rejected to prevent forwarding the custom key header.

`CHECKED` means the expected wire shape and sampled roster identities matched.
The report explicitly keeps `completenessValidated`, `dnpValidated` and
`correctionValidated` false. Final team status does not prove every individual
statistic is complete. Zero yards does not prove no offensive participation, and
an absent roster player or box-score row does not prove DNP.

This is a private release diagnostic with separate sample records. Its quota
facts and reservation records share the actual account's operational ledger; it
is not a disposable hosted test environment. It never creates result jobs,
competitive observations, mappings, quotes, menus, receipts or settlements.
Publication/retention permission, full source semantics, offered-player mapping,
future coverage and hosted settlement timing remain separate readiness gates.
