-- The provider replaces advertised kickoff with a more precise observed time.
-- Keep the published slate, deadline, checkpoints and receipt terms immutable.
-- Accept only the same event/teams, with a forward time inside the existing
-- 48-hour postponement window and independent score evidence after both times.
do $migration$
declare
  d text;
  old_guard text := $old$    if v_payload_event ->> 'awayTeam' <> v_event.away_team
      or v_payload_event ->> 'homeTeam' <> v_event.home_team
      or (v_payload_event ->> 'scheduledStartAt')::timestamptz <> v_event.scheduled_start_at then$old$;
begin
  d := pg_get_functiondef('private.import_live_scores_as(uuid,uuid,jsonb,text)'::regprocedure);
  if strpos(d, old_guard) = 0
    or strpos(d, '  v_last_update timestamptz;') = 0
    or strpos(d, 'v_last_update < v_event.scheduled_start_at') = 0 then
    raise exception 'Unexpected score importer baseline; kickoff evidence migration refused';
  end if;
  d := replace(d, '  v_last_update timestamptz;', '  v_last_update timestamptz; v_reported_start timestamptz;');
  d := replace(d, old_guard, $new$    v_reported_start := (v_payload_event ->> 'scheduledStartAt')::timestamptz;
    if (v_payload_event ->> 'awayTeam') is distinct from v_event.away_team
      or (v_payload_event ->> 'homeTeam') is distinct from v_event.home_team
      or v_reported_start is null
      or not isfinite(v_reported_start)
      or v_reported_start < v_event.scheduled_start_at
      or v_reported_start >= v_event.scheduled_start_at + interval '48 hours' then$new$);
  d := replace(d, 'v_last_update < v_event.scheduled_start_at',
    'v_last_update < greatest(v_event.scheduled_start_at, v_reported_start)');
  execute d;
end;
$migration$;
