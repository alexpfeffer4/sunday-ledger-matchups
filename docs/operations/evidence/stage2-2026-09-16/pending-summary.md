# Stage 1 disposable baseline

Production build, substituted provider responses. Cold means a fresh authenticated browser context; app/database processes are already running. Mobile: Chromium 390×844, DPR 3, 150 ms latency, 1.6 Mbps down / 750 Kbps up, 4× CPU slowdown. Desktop: Chromium 1440×900, unthrottled. No physical-device or real-provider latency claim. Five samples support median/range, not percentiles. Bytes are per-request browser response sizes; RPC timings remain distinct from the database plans. LCP/layout shift/event/long-task observations in raw JSON are lab observations, not field Core Web Vitals.

Browser byte collection waits at most one second after the visible frame. Unavailable sizes remain null in raw data; known-byte sums are lower bounds when the unknown count is nonzero.

| Condition / action                                                          |   n | Median ms |  Range ms | Median RPCs | Median known browser bytes | Unknown sizes per run |
| --------------------------------------------------------------------------- | --: | --------: | --------: | ----------: | -------------------------: | --------------------- |
| 16g-96s-sun-mon-pending-desktop / cold-browser-matchup                      |   5 |       751 |   726–802 |           8 |                     412186 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / repeat-matchup                            |   5 |       744 |   707–784 |           8 |                      55812 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-slate                                 |   5 |        89 |    83–108 |           1 |                      17642 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-card                                  |   5 |       188 |   175–222 |           1 |                      14825 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-league                                |   5 |       128 |    90–168 |           2 |                       8418 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / nav-matchup                               |   5 |        99 |    73–111 |           2 |                      21928 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / props-filter                              |   5 |       400 |   336–498 |           0 |                       5127 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / game-filter                               |   5 |       281 |   222–312 |           1 |                      89662 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / selection-and-stake                       |   5 |       641 |   409–681 |           1 |                      95985 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / stake-edit                                |   5 |       286 |   275–316 |           1 |                      89662 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / paused-edit-focus                         |   5 |      1158 | 1157–1188 |           1 |                      89662 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / review-cache-miss-synthetic-500ms         |   5 |      1097 | 1076–1188 |           7 |                      90063 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / review-cache-hit                          |   5 |       308 |   289–343 |           6 |                      97957 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / review-changed-terms                      |   5 |      1099 | 1062–1104 |           7 |                      97954 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / expired-review-recovery                   |   1 |       976 |   976–976 |           9 |                        354 | 0                     |
| 16g-96s-sun-mon-pending-desktop / confirm-to-receipt                        |   5 |       893 |   870–894 |           7 |                     103052 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / standings                                 |   5 |       435 |   422–443 |           4 |                      35525 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-desktop / historical-matchup                        |   5 |       454 |   432–466 |           5 |                      37366 | 3, 4, 4, 4, 1         |
| 16g-96s-sun-mon-pending-desktop / refresh-while-reading                     |   5 |       932 |   911–950 |           8 |                      38846 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / cold-browser-matchup              |   5 |      2703 | 2675–2706 |           8 |                     406944 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / repeat-matchup                    |   5 |      1110 | 1095–1251 |           8 |                      58872 | 0, 1, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-slate                         |   5 |       309 |   236–371 |           3 |                       1160 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-card                          |   5 |       715 |   554–975 |           4 |                        661 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-league                        |   5 |       213 |   199–286 |           2 |                       6776 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / nav-matchup                       |   5 |       165 |   156–186 |           2 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / props-filter                      |   5 |      1054 | 1030–1195 |           1 |                     100100 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / game-filter                       |   5 |       648 |   610–662 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / selection-and-stake               |   5 |      1617 | 1496–1776 |           1 |                     100654 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / stake-edit                        |   5 |       810 |   796–954 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / paused-edit-focus                 |   5 |      1339 | 1329–1344 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / review-cache-miss-synthetic-500ms |   5 |      1649 | 1591–1691 |           7 |                      97924 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / review-cache-hit                  |   5 |       734 |   594–790 |           6 |                      97976 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / review-changed-terms              |   5 |      4719 | 1660–5420 |           7 |                      97970 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / expired-review-recovery           |   1 |      1438 | 1438–1438 |           9 |                       8403 | 0                     |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / confirm-to-receipt                |   5 |      1587 | 1306–2180 |           7 |                      31862 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / standings                         |   5 |       873 |   791–901 |           4 |                      28244 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / historical-matchup                |   5 |       811 |   802–824 |           5 |                      32038 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-pending-mobile-4x-150ms / refresh-while-reading             |   5 |       890 |   830–918 |           8 |                       5481 | 0, 0, 0, 0, 0         |
