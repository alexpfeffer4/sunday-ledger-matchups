# Retained Stage 1 evidence

Measured implementation: `b175c419bf2bae79e94cacc615b6a2b70d9647cf`, tree `5a2741f6b547e971e0e008dde29aad4867eb7cb1`. [Acceptance run, attempt 1](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/35145836752/attempts/1). Both baseline jobs passed: 182 observations each, 364 total. No baseline test retries or skips.

The two source ZIP digests were verified before extraction. The manifest records their IDs and SHA-256 values plus hashes of every retained file. Actions ZIPs expire September 23, 2026; this selected evidence remains with the repository. Full Playwright reports/traces and authentication state are not included.

The gzip JSONL files preserve the original timing observations byte for byte after decompression. The per-menu summary files retain the CI values with repository formatting. Preparation evidence retains operation/state/failure and cardinality checks while omitting disposable run IDs. Four screenshots show the actual scrolled matchup after acceptance; they are not screen designs or proofs of a live deployment.

## Timings and bytes

See [complete summary](complete-summary.md) and [pending summary](pending-summary.md) for all 19 actions per device, five samples for each core action and one natural-expiry recovery per device. Response-size totals are known bytes, with unknown sizes explicitly counted; they can include cached body sizes and are not identical to transferred bytes.

[Observed transfer summary](observed-transfer-summary.json) separately sums the browser Resource Timing `transferSize` values captured for each span, including navigation transfer only for the four timed hard navigations. Other actions retain an old navigation entry in raw data; do not add it again. Transfers finishing beyond the observation boundary can be absent, and cache hits can report zero. These are observed browser transfers, not packet captures.

Fresh browsers use warm app/database processes. Next.js prefetch remains active. RPC counts can include calls begun before the timed span. Mobile is Chromium 390×844, DPR 3, touch, 150 ms, 1.6 Mbps down/750 Kbps up and 4× CPU; desktop is Chromium 1440×900 unthrottled. Provider cache misses have a synthetic 500 ms delay. Complete/pending jobs ran on separate CI machines; direct differences are suggestive, not controlled causal attribution.

## Database execution

Authenticated commissioner/participant, `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)`, read-only transactions; first observed plus five repeats. These are PostgreSQL execution times, separate from HTTP/RPC timing. Earlier preparation calls already warmed the server. Opaque top-level function plans do not identify individual internal expressions.

| Menu     | RPC                    | First observed ms | Repeat median ms | Repeat range ms |
| -------- | ---------------------- | ----------------: | ---------------: | --------------: |
| complete | `get_live_quote_heads` |             7.654 |            7.727 |     7.644–7.901 |
| complete | `get_player_prop_menu` |            25.500 |           24.805 |   24.711–25.316 |
| complete | `get_stage1_state`     |            55.680 |           54.369 |   53.610–55.310 |
| pending  | `get_live_quote_heads` |             5.156 |            4.723 |     4.604–4.981 |
| pending  | `get_player_prop_menu` |           168.483 |          169.630 | 169.078–172.274 |
| pending  | `get_stage1_state`     |            35.232 |           34.769 |   34.588–35.044 |

## Preparation and interaction checks

Both real worker scenarios retained a valid 272-game source schedule, rejected incomplete selected markets without a resulting week/plan, retried successfully, processed catalog evidence, validated and automatically opened exactly one Week 3 with 16 games, 96 slots and ten cards. There was one standing consent, one SYSTEM validation and no human validation. Complete had 96 published identities; pending had 60 published and 36 pending. Completion replay and an idle worker caused no duplicate effects. Prior receipt fingerprints were unchanged.

Across the two scenarios, twenty real 50-credit submissions were accepted after explicit review; four natural-expiry recovery checks required acknowledgement of newly changed terms before acceptance. Paused-edit focus retained input without another quote HTTP request. All twenty refresh checks retained their recorded scroll position. These use disposable identities, provider responses and historical fixture results.

## Rendering observations

The raw browser observations retain supported long-task/LCP/layout-shift/event entries. They are lab spans, not field INP/LCP/CLS. The complete mobile stake-edit span had four long tasks per run (maximum 145 ms) and median 848 ms; pending had three (maximum 103 ms) and median 594 ms. This justifies targeted later rendering profiling, not a claim that one component or SQL expression is responsible. No rendering optimization was begun in Stage 1.
