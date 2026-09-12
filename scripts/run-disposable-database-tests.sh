#!/usr/bin/env bash
set -euo pipefail

# This diagnostic runner must never inspect a hosted database.
node -e 'const u = new URL(process.env.TEST_SUPABASE_DB_URL); if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("Database acceptance requires loopback");'
mkdir -p acceptance-reports

# Ordinary full-suite runs take about 16 seconds. At 90 seconds retain the
# actual wait state; at five minutes fail the gate instead of waiting an hour.
# No assertion, selected suite, or retry policy is changed.
(
  set -o pipefail
  timeout --signal=TERM --kill-after=15s 300s supabase test db 2>&1 |
    tee acceptance-reports/pgtap.log
) &
suite_pid=$!

(
  if ! timeout 90s tail --pid="$suite_pid" -f /dev/null; then
    PGOPTIONS='-c statement_timeout=10000' psql "$TEST_SUPABASE_DB_URL" -X \
      -c "select clock_timestamp() as observed_at, pid, application_name,
                 state, wait_event_type, wait_event,
                 clock_timestamp()-query_start as query_age,
                 pg_blocking_pids(pid) as blocking_pids,
                 left(query, 300) as disposable_test_query
          from pg_stat_activity
          where datname=current_database() and pid<>pg_backend_pid()
          order by query_start nulls last;" \
      > acceptance-reports/database-waits.log 2>&1 || true
  fi
) &
watchdog_pid=$!

if wait "$suite_pid"; then
  suite_status=0
else
  suite_status=$?
fi
wait "$watchdog_pid" || true
if [[ "$suite_status" -eq 124 || "$suite_status" -eq 137 ]]; then
  echo 'Database acceptance exceeded five minutes; inspect retained pgTAP and wait diagnostics.' >&2
fi
exit "$suite_status"
