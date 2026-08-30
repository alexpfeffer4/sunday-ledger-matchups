-- Phase 6: make the generic future-sealed signal depend only on the public
-- event reveal boundary. Hidden receipt existence must not affect an
-- authenticated response, even after common lock.

do $migration$
declare
  v_definition text;
  v_old constant text := $old$'futureSealed', case
        when v_week.state = 'OPEN' then true
        else exists (
          select 1
          from private.position_receipts as receipt
          join private.sports_events as event on event.id = receipt.event_id
          where receipt.card_id = v_opponent_card_id
            and event.state not in ('LIVE', 'FINAL', 'VOID', 'CORRECTED')
        )
      end,$old$;
  v_new constant text := $new$'futureSealed', exists (
        select 1
        from private.sports_events as event
        where event.week_id = v_week.id
          and event.state not in ('LIVE', 'FINAL', 'VOID', 'CORRECTED')
      ),$new$;
  v_occurrences integer;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure)
  into strict v_definition;

  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);

  if v_occurrences <> 1 then
    raise exception
      'get_stage1_state expected one hidden-receipt futureSealed projection, found %',
      v_occurrences;
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$migration$;
