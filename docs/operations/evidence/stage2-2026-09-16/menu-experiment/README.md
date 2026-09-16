# Discarded menu rewrite

[Acceptance run 35157645808](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/35157645808), attempt 1, passed every job and aggregate on implementation `ad377ac1c1c0290a711e2c4387f0df29d96b5739`, tree `b4a7b4665e5a0047f2368a24535babdc90fccab7`. CI merge `82dd99fc666ce6d126c078c5f8e10add3482d1a9` had the identical tree. This is an experiment record, not the final release revision.

The candidate materialized pending eligibility and joined it to the menu slots. Exact output comparison passed for commissioner/member before/after kickoff. Alternating old/new full-menu executions used the same worker-created fixture and runner, separate PostgreSQL sessions, first observed plus five repeats. Inner plans used the exact slot projection in the security-definer owner role with caller claims. Both old and candidate plans evaluated the pending helper once; the repeated-evaluation hypothesis was not supported in either profile.

| Profile                            | Original median ms [range] | Candidate median ms [range] | Inner original → candidate ms | Pending helper loops original → candidate |
| ---------------------------------- | -------------------------: | --------------------------: | ----------------------------: | ----------------------------------------: |
| Complete, 96 published             |     17.426 [17.199–17.818] |      17.606 [17.021–18.156] |                 6.067 → 6.442 |                                     1 → 1 |
| Pending, 60 published / 36 pending |  242.626 [241.483–244.187] |   243.019 [241.730–245.175] |               34.221 → 34.306 |                                     1 → 1 |

The helper retained exactly 1,039 shared buffer hits complete / 3,636 pending. Candidate JSON output and all behavior checks passed, but no meaningful speed benefit justified shipping the rewrite. It was removed before final verification. No new participant menu RPC or cache was added. Remaining pending-menu work is deferred; these plans do not establish a new safe optimization in the deeper wrappers.

The two gzip files retain the original JSON reports byte for byte after decompression, including full/inner plans, first observations, all repeats and review-read sizes. The candidate and original SQL are retained here only as experimental evidence and are not applied migrations or executable test fixtures. Source complete artifact: ID `10472137758`, ZIP SHA-256 `9a06fc7ba83120578410135eac27185f0a4b626a19669a4283e56e42e4d43d26`. Pending: ID `10472275010`, SHA-256 `a574895a8fe0371ed822b816939ecb00cdb6b923fe5af9172fca76de4397f4a3`. Both ZIP digests were verified before extraction.
