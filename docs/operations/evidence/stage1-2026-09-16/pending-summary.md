# Stage 1 disposable baseline

Production build, substituted provider responses. Cold means a fresh authenticated browser context; app/database processes are already running. Mobile: Chromium 390×844, DPR 3, 150 ms latency, 1.6 Mbps down / 750 Kbps up, 4× CPU slowdown. Desktop: Chromium 1440×900, unthrottled. No physical-device or real-provider latency claim. Five samples support median/range, not percentiles. Bytes are per-request browser response sizes; RPC timings remain distinct from the database plans. LCP/layout shift/event/long-task observations in raw JSON are lab observations, not field Core Web Vitals.

Browser byte collection waits at most one second after the visible frame. Unavailable sizes remain null in raw data; known-byte sums are lower bounds when the unknown count is nonzero.

| Condition / action                                                          |   n | Median ms |  Range ms | Median RPCs | Median known browser bytes | Unknown sizes per run |
| --------------------------------------------------------------------------- | --: | --------: | --------: | ----------: | -------------------------: | --------------------- |
| 16g-96s-sun-mon-pending-desktop / cold-browser-matchup                      |   5 |       751 |   455–777 |           8 |                     413439 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / repeat-matchup                            |   5 |       426 |   367–721 |           8 |                      52397 | 0, 4, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-slate                                 |   5 |        88 |    60–121 |           1 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-card                                  |   5 |       142 |    99–153 |           1 |                      16432 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-league                                |   5 |       104 |    73–122 |           2 |                       5332 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-matchup                               |   5 |        88 |    62–121 |           2 |                      21814 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / props-filter                              |   5 |       281 |   150–315 |           0 |                      19335 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / game-filter                               |   5 |       177 |   160–206 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / selection-and-stake                       |   5 |       385 |   335–482 |           1 |                     100903 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / stake-edit                                |   5 |       239 |   223–264 |           1 |                      89548 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / paused-edit-focus                         |   5 |      1151 | 1147–1171 |           1 |                      89549 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / review-cache-miss-synthetic-500ms         |   5 |      1064 |  984–1559 |           9 |                      97807 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / review-cache-hit                          |   5 |       983 |  496–1011 |           8 |                      97945 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / review-changed-terms                      |   5 |      1559 | 1013–1582 |           9 |                      97930 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / expired-review-recovery                   |   1 |       891 |   891–891 |           9 |                        354 | 0                     |
| 16g-96s-sun-mon-pending-desktop / confirm-to-receipt                        |   5 |       855 |   849–864 |           8 |                     122757 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / standings                                 |   5 |       400 |   372–411 |           6 |                      36583 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / historical-matchup                        |   5 |       420 |   369–726 |           7 |                      37070 | 4, 4, 4, 4, 0         |
| 16g-96s-sun-mon-pending-desktop / refresh-while-reading                     |   5 |       422 |   374–904 |           8 |                      35690 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / cold-browser-matchup              |   5 |      2662 | 2640–2680 |           8 |                     407378 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / repeat-matchup                    |   5 |       993 |  963–1063 |           8 |                      61676 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-slate                         |   5 |       220 |   209–238 |           2 |                       2821 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-card                          |   5 |       396 |   379–475 |           2 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-league                        |   5 |       184 |   149–225 |           2 |                       1617 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-matchup                       |   5 |       169 |   141–209 |           2 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / props-filter                      |   5 |       744 |   649–840 |           1 |                      96398 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / game-filter                       |   5 |       530 |   471–538 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / selection-and-stake               |   5 |      1166 | 1078–1229 |           1 |                     100194 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / stake-edit                        |   5 |       594 |   579–641 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / paused-edit-focus                 |   5 |      1260 | 1253–1272 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / review-cache-miss-synthetic-500ms |   5 |      2018 | 2006–2054 |           9 |                      97911 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / review-cache-hit                  |   5 |       869 |   792–967 |           8 |                      97958 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / review-changed-terms              |   5 |      5503 | 5023–5586 |           9 |                      90146 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / expired-review-recovery           |   1 |      1266 | 1266–1266 |           9 |                       8403 | 0                     |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / confirm-to-receipt                |   5 |      1601 | 1050–1958 |           7 |                       9698 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / standings                         |   5 |       739 |   693–934 |           6 |                      30983 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / historical-matchup                |   5 |       774 |   702–999 |           7 |                      32035 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / refresh-while-reading             |   5 |       726 |   712–806 |           8 |                       6776 | 0, 0, 0, 0, 0         |
