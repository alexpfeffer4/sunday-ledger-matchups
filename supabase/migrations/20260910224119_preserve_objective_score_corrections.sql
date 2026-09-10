-- A02 release review: unchanged provider evidence must not reverse an objective
-- correction after commissioner transfer. Preserve successful fetch timing while
-- retaining the original source timestamp; equal evidence is not a new result.
do $migration$
declare d text; old_guard text; new_guard text;
begin
  d:=pg_get_functiondef('private.import_live_scores_as(uuid,uuid,jsonb,text)'::regprocedure);
  old_guard:=$old$and (c.source_updated_at>v_last_update or (c.source_updated_at is not null and v_last_update is null))) then
      v_unchanged_count:=v_unchanged_count+1;$old$;
  new_guard:=$new$and (c.source_updated_at>=v_last_update or (c.source_updated_at is not null and v_last_update is null))) then
      -- A repeated source value is still a successful fetch, not an outage.
      update private.live_score_checks set fetched_at=v_fetched_at,
        state='CHECKED',failure_count=0
      where event_id=v_event.id and source_updated_at=v_last_update;
      v_unchanged_count:=v_unchanged_count+1;$new$;
  if strpos(d,old_guard)=0 then raise exception 'Unexpected score evidence guard baseline'; end if;
  execute replace(d,old_guard,new_guard);
end;
$migration$;
