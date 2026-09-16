#!/usr/bin/env bash
set -euo pipefail

# This diagnostic runner must never inspect a hosted database.
node -e 'const u = new URL(process.env.TEST_SUPABASE_DB_URL); if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("Database acceptance requires loopback");'
mkdir -p acceptance-reports

# Include nested SQL in the existing disposable-only diagnostics. A busy
# PL/pgSQL fixture otherwise appears as one opaque lives_ok() call. This does
# not change query planning, the five-minute limit or any acceptance assertion.
PGOPTIONS='-c statement_timeout=10000' psql "$TEST_SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -c 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;' \
  -c "ALTER DATABASE postgres SET pg_stat_statements.track = 'all';" \
  -c 'SELECT extensions.pg_stat_statements_reset();' \
  > acceptance-reports/database-query-timing-setup.log 2>&1

# At 90 seconds retain the actual wait state, then sample every 30 seconds
# while the suite runs so a later stall is captured as well. At five minutes
# fail the gate instead of waiting an hour.
# No assertion, selected suite, or retry policy is changed.
(
  set -o pipefail
  timeout --signal=TERM --kill-after=15s 300s supabase test db 2>&1 |
    tee acceptance-reports/pgtap.log
) &
suite_pid=$!

(
  diagnostic_interval=90
  while ! timeout "${diagnostic_interval}s" tail --pid="$suite_pid" -f /dev/null; do
    {
      date -u '+%Y-%m-%dT%H:%M:%SZ'
      free -m
      timeout 10s docker stats --no-stream \
        --format '{{.Name}} CPU={{.CPUPerc}} Memory={{.MemUsage}} PIDs={{.PIDs}}'
    } >> acceptance-reports/database-resources.log 2>&1 || true
    PGOPTIONS='-c statement_timeout=10000' psql "$TEST_SUPABASE_DB_URL" -X \
      -c "select clock_timestamp() as observed_at, pid, application_name,
                 state, wait_event_type, wait_event,
                 clock_timestamp()-query_start as query_age,
                 pg_blocking_pids(pid) as blocking_pids,
                 left(query, 300) as disposable_test_query
          from pg_stat_activity
          where datname=current_database() and pid<>pg_backend_pid()
          order by query_start nulls last;" \
      >> acceptance-reports/database-waits.log 2>&1 || true
    PGOPTIONS='-c statement_timeout=10000' psql "$TEST_SUPABASE_DB_URL" -X \
      -c "select clock_timestamp() as observed_at, calls,
                 round(total_exec_time::numeric,1) as total_ms,
                 round(mean_exec_time::numeric,1) as mean_ms,
                 round((jit_generation_time+jit_inlining_time+jit_optimization_time+jit_emission_time)::numeric,1) as jit_ms,
                 left(query,800) as disposable_test_query
          from extensions.pg_stat_statements where not toplevel
          order by total_exec_time desc limit 12;" \
      > acceptance-reports/database-query-timings.log 2>&1 || true
    diagnostic_interval=30
  done
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
if [[ "$suite_status" -ne 0 && -f acceptance-reports/database-waits.log ]]; then
  # Keep the last observed query/wait state readable in the supported job logs
  # even when the artifact download is temporarily unavailable.
  tail -n 80 acceptance-reports/database-waits.log >&2
fi
if [[ "$suite_status" -ne 0 && -f acceptance-reports/database-resources.log ]]; then
  tail -n 40 acceptance-reports/database-resources.log >&2
fi
if [[ "$suite_status" -ne 0 && -f acceptance-reports/database-query-timings.log ]]; then
  cat acceptance-reports/database-query-timings.log >&2
fi
PGOPTIONS='-c statement_timeout=10000' psql "$TEST_SUPABASE_DB_URL" -X \
  -c 'ALTER DATABASE postgres RESET pg_stat_statements.track;' >/dev/null
exit "$suite_status"
