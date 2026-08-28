-- Keep raw provider responses behind security-definer commands. The explicit
-- deny policy makes the fail-closed participant boundary visible to audits.
create policy live_score_imports_no_direct_access
on private.live_score_imports for select to authenticated
using (false);
