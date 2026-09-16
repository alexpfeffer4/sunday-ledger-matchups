# Stage 1 disposable baseline

Production build, substituted provider responses. Cold means a fresh authenticated browser context; app/database processes are already running. Mobile: Chromium 390×844, DPR 3, 150 ms latency, 1.6 Mbps down / 750 Kbps up, 4× CPU slowdown. Desktop: Chromium 1440×900, unthrottled. No physical-device or real-provider latency claim. Five samples support median/range, not percentiles. Bytes are per-request browser response sizes; RPC timings remain distinct from the database plans. LCP/layout shift/event/long-task observations in raw JSON are lab observations, not field Core Web Vitals.

Browser byte collection waits at most one second after the visible frame. Unavailable sizes remain null in raw data; known-byte sums are lower bounds when the unknown count is nonzero.

| Condition / action                                                           |   n | Median ms |  Range ms | Median RPCs | Median known browser bytes | Unknown sizes per run |
| ---------------------------------------------------------------------------- | --: | --------: | --------: | ----------: | -------------------------: | --------------------- |
| 16g-96s-sun-mon-complete-desktop / cold-browser-matchup                      |   5 |       464 |   405–487 |           8 |                     410135 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / repeat-matchup                            |   5 |       447 |   407–483 |           8 |                      58498 | 4, 0, 0, 0, 4         |
| 16g-96s-sun-mon-complete-desktop / nav-slate                                 |   5 |       132 |    72–138 |           1 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / nav-card                                  |   5 |        99 |    87–113 |           1 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / nav-league                                |   5 |       102 |    81–125 |           2 |                       3497 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / nav-matchup                               |   5 |        83 |    66–101 |           2 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / props-filter                              |   5 |       493 |   467–538 |           1 |                     108312 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / game-filter                               |   5 |       196 |   187–203 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / selection-and-stake                       |   5 |       627 |   596–648 |           1 |                     111332 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / stake-edit                                |   5 |       249 |   217–324 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / paused-edit-focus                         |   5 |      1152 | 1148–1167 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / review-cache-miss-synthetic-500ms         |   5 |      1061 | 1054–1098 |           6 |                       8211 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / review-cache-hit                          |   5 |       278 |   250–305 |           5 |                        354 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / review-changed-terms                      |   5 |      1055 | 1024–1077 |           6 |                        354 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / expired-review-recovery                   |   1 |       985 |   985–985 |           9 |                       8404 | 0                     |
| 16g-96s-sun-mon-complete-desktop / confirm-to-receipt                        |   5 |       380 |   353–450 |           7 |                      26609 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / standings                                 |   5 |       429 |   427–446 |           4 |                      36870 | 4, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / historical-matchup                        |   5 |       436 |   405–467 |           5 |                      38465 | 0, 3, 4, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / refresh-while-reading                     |   5 |       305 |   293–346 |           8 |                      37153 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / cold-browser-matchup              |   5 |      2627 | 2608–2691 |           8 |                     408353 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / repeat-matchup                    |   5 |      1093 |  994–1172 |           8 |                      53989 | 0, 0, 0, 0, 1         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-slate                         |   5 |       287 |   274–312 |           1 |                       5128 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-card                          |   5 |       470 |   450–820 |           4 |                       1024 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-league                        |   5 |       175 |   148–203 |           2 |                       1619 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-matchup                       |   5 |       178 |   143–200 |           2 |                       5733 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / props-filter                      |   5 |      1047 |  915–1211 |           1 |                     103698 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / game-filter                       |   5 |       605 |   565–617 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / selection-and-stake               |   5 |      1428 | 1392–1492 |           2 |                     197714 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / stake-edit                        |   5 |       790 |   756–798 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / paused-edit-focus                 |   5 |      1309 | 1301–1315 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / review-cache-miss-synthetic-500ms |   5 |      1619 | 1605–1672 |           6 |                       8188 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / review-cache-hit                  |   5 |       606 |   585–684 |           5 |                       8222 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / review-changed-terms              |   5 |      4619 | 1578–4656 |           6 |                       8179 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / expired-review-recovery           |   1 |      1365 | 1365–1365 |           9 |                       8391 | 0                     |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / confirm-to-receipt                |   5 |      1061 | 1056–1587 |           7 |                      31906 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / standings                         |   5 |       790 |   757–987 |           4 |                      29154 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / historical-matchup                |   5 |       796 |   756–799 |           5 |                      32090 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / refresh-while-reading             |   5 |       581 |   539–656 |           8 |                       5282 | 0, 0, 0, 0, 0         |
