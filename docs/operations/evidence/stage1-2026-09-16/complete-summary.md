# Stage 1 disposable baseline

Production build, substituted provider responses. Cold means a fresh authenticated browser context; app/database processes are already running. Mobile: Chromium 390×844, DPR 3, 150 ms latency, 1.6 Mbps down / 750 Kbps up, 4× CPU slowdown. Desktop: Chromium 1440×900, unthrottled. No physical-device or real-provider latency claim. Five samples support median/range, not percentiles. Bytes are per-request browser response sizes; RPC timings remain distinct from the database plans. LCP/layout shift/event/long-task observations in raw JSON are lab observations, not field Core Web Vitals.

Browser byte collection waits at most one second after the visible frame. Unavailable sizes remain null in raw data; known-byte sums are lower bounds when the unknown count is nonzero.

| Condition / action                                                           |   n | Median ms |  Range ms | Median RPCs | Median known browser bytes | Unknown sizes per run |
| ---------------------------------------------------------------------------- | --: | --------: | --------: | ----------: | -------------------------: | --------------------- |
| 16g-96s-sun-mon-complete-desktop / cold-browser-matchup                      |   5 |       470 |   462–486 |           8 |                     410775 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / repeat-matchup                            |   5 |       476 |   456–515 |           8 |                      56884 | 4, 0, 0, 2, 0         |
| 16g-96s-sun-mon-complete-desktop / nav-slate                                 |   5 |        94 |    85–122 |           1 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / nav-card                                  |   5 |        82 |    58–123 |           1 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / nav-league                                |   5 |       104 |    92–123 |           2 |                       3500 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / nav-matchup                               |   5 |        80 |    63–104 |           2 |                      22796 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / props-filter                              |   5 |       448 |   424–493 |           1 |                     110108 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / game-filter                               |   5 |       201 |   190–256 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / selection-and-stake                       |   5 |       609 |   560–670 |           1 |                     109755 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / stake-edit                                |   5 |       262 |   232–299 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / paused-edit-focus                         |   5 |      1157 | 1150–1170 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / review-cache-miss-synthetic-500ms         |   5 |      1073 | 1055–1102 |           8 |                       8208 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / review-cache-hit                          |   5 |       390 |   351–393 |           7 |                       8185 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / review-changed-terms                      |   5 |      1057 | 1038–1069 |           8 |                       8152 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / expired-review-recovery                   |   1 |       965 |   965–965 |           9 |                       8381 | 0                     |
| 16g-96s-sun-mon-complete-desktop / confirm-to-receipt                        |   5 |       369 |   357–404 |           7 |                      26512 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / standings                                 |   5 |       447 |   442–487 |           6 |                      39924 | 4, 0, 0, 4, 0         |
| 16g-96s-sun-mon-complete-desktop / historical-matchup                        |   5 |       437 |   389–449 |           7 |                      38694 | 0, 0, 1, 0, 0         |
| 16g-96s-sun-mon-complete-desktop / refresh-while-reading                     |   5 |       304 |   291–327 |           8 |                      35018 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / cold-browser-matchup              |   5 |      2638 | 2621–2680 |           8 |                     408216 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / repeat-matchup                    |   5 |      1067 |  977–1233 |           8 |                      55756 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-slate                         |   5 |       307 |   241–418 |           2 |                       9514 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-card                          |   5 |       501 |   478–679 |           3 |                       2269 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-league                        |   5 |       178 |   156–240 |           2 |                        363 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / nav-matchup                       |   5 |       157 |   150–202 |           2 |                       5746 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / props-filter                      |   5 |      1002 |  983–1065 |           1 |                     105015 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / game-filter                       |   5 |       612 |   553–647 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / selection-and-stake               |   5 |      1414 | 1328–1469 |           2 |                     199006 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / stake-edit                        |   5 |       848 |   763–871 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / paused-edit-focus                 |   5 |      1323 | 1297–1350 |           0 |                          0 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / review-cache-miss-synthetic-500ms |   5 |      1739 | 1693–1799 |           8 |                       8215 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / review-cache-hit                  |   5 |       776 |   707–903 |           7 |                       8220 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / review-changed-terms              |   5 |      2712 | 2669–5003 |           8 |                       8172 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / expired-review-recovery           |   1 |      1388 | 1388–1388 |           9 |                       8391 | 0                     |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / confirm-to-receipt                |   5 |      1068 | 1064–1630 |           7 |                      33122 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / standings                         |   5 |       822 |   778–994 |           6 |                      28244 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / historical-matchup                |   5 |       797 |   791–830 |           7 |                      32009 | 0, 0, 0, 0, 0         |
| 16g-96s-sun-mon-complete-mobile-4x-150ms / refresh-while-reading             |   5 |       687 |   529–741 |           8 |                       6568 | 0, 0, 0, 0, 0         |
