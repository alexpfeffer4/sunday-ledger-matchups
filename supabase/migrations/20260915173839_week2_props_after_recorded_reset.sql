-- The owner may authorize the exact staged card reset independently of props
-- readiness. Reuse only that immutable audit if nobody has accepted a new bet.
-- This migration does not reset a card, activate offers, or change any binding.
create function private.week2_props_matching_reset(p_week_id uuid) returns uuid
language sql stable security invoker set search_path='' as $$
 select reset.id
 from private.week2_props_stages stage
 join private.season_weeks w on w.id=stage.week_id and w.league_id=stage.league_id and w.season_id=stage.season_id
 join private.weekly_cards c on c.id=stage.card_id and c.week_id=w.id and c.league_id=stage.league_id and c.season_id=stage.season_id
 join private.card_reset_events reset on reset.card_id=c.id and reset.week_id=w.id
   and reset.league_id=stage.league_id and reset.season_id=stage.season_id
 where stage.week_id=p_week_id
 and w.ruleset_snapshot_id=stage.original_ruleset_snapshot_id
 and c.card_generation=1 and c.granted_credits=1000 and c.locked_at is null
 and reset.previous_generation=0 and reset.new_generation=1
 and reset.created_at>=stage.created_at
 and reset.receipt_ids=stage.expected_receipt_ids
 and reset.receipt_fingerprint=stage.expected_receipt_fingerprint
 and stage.expected_receipt_fingerprint=private.card_receipt_fingerprint(c.id,0)
 and stage.expected_receipt_ids=(select array_agg(r.id order by r.id) from private.position_receipts r where r.week_id=w.id)
 and (select count(*) from private.card_reset_events other where other.week_id=w.id)=1
 and not exists(select 1 from private.effective_position_receipts r where r.week_id=w.id);
$$;
revoke all on function private.week2_props_matching_reset(uuid) from public,anon,authenticated,service_role;

create or replace function private.week2_props_stage_current(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select s.mode='LIVE' and s.nfl_year=2026 and s.lifecycle='REGULAR'
 and w.nfl_week=2 and w.state='OPEN' and w.ruleset_snapshot_id=stage.original_ruleset_snapshot_id
 and w.league_id=stage.league_id and w.season_id=stage.season_id and s.league_id=stage.league_id
 and s.id=(select current.id from private.seasons current where current.league_id=s.league_id order by current.created_at desc,current.id desc limit 1)
 and w.nfl_week=(select max(nfl_week) from private.season_weeks where season_id=s.id)
 and c.week_id=w.id and c.league_id=stage.league_id and c.season_id=stage.season_id
 and c.granted_credits=1000 and c.locked_at is null
 and ((c.card_generation=0 and not exists(select 1 from private.card_reset_events reset where reset.week_id=w.id))
   or (c.card_generation=1 and private.week2_props_matching_reset(w.id) is not null))
 and not exists(select 1 from private.position_receipts other where other.week_id=w.id and other.card_id<>c.id)
 and r.ruleset_version='1.3' and r.canonical_json=private.rolling_ruleset_package('LIVE')
 and stage.expected_receipt_ids=(select array_agg(receipt.id order by receipt.id) from private.position_receipts receipt where receipt.week_id=w.id)
 and stage.expected_receipt_fingerprint=private.card_receipt_fingerprint(c.id,0)
 and not exists(select 1 from private.week2_props_cutovers cutover where cutover.week_id=w.id)
 and exists(select 1 from private.sports_events e where e.week_id=w.id)
 and not exists(select 1 from private.sports_events e where e.week_id=w.id
   and (e.state<>'SCHEDULED' or e.actual_started_at is not null or e.scheduled_start_at<=clock_timestamp() or private.event_entry_closes_at(e.id)<=clock_timestamp()))
 and not exists(select 1 from private.event_result_versions result where result.week_id=w.id)
 and not exists(select 1 from private.settlement_versions result where result.week_id=w.id)
 and not exists(select 1 from private.weekly_score_versions score where score.week_id=w.id and (score.is_complete or score.status='FINAL' or score.score_centicredits<>0))
 and not exists(select 1 from private.matchup_result_versions result where result.week_id=w.id)
 from private.week2_props_stages stage join private.season_weeks w on w.id=stage.week_id
 join private.seasons s on s.id=w.season_id join private.weekly_cards c on c.id=stage.card_id
 join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where stage.week_id=p_week_id),false);
$$;

-- The new approval may have a different reference from the earlier props stage.
-- Both references remain immutable. Exact receipt/scope lineage links them;
-- matching reference text is neither necessary nor a substitute for that proof.
do $reuse_reset$
declare d text;old text;replacement text;
begin
 d:=pg_get_functiondef('private.cutover_open_week2_props(uuid,text,text,text,text,text)'::regprocedure);
 old:=$old$ reset:=private.reset_prestart_week2_card(stage.league_id,stage.season_id,stage.week_id,stage.card_id,
 stage.expected_receipt_ids,stage.expected_receipt_fingerprint,'props-reset:'||substr(p_idempotency_key,1,100),p_release_sha,stage.approval_reference,p_reason);$old$;
 replacement:=$new$ if private.week2_props_matching_reset(w.id) is not null then
 reset:=jsonb_build_object('resetId',private.week2_props_matching_reset(w.id));
 else
 reset:=private.reset_prestart_week2_card(stage.league_id,stage.season_id,stage.week_id,stage.card_id,
 stage.expected_receipt_ids,stage.expected_receipt_fingerprint,'props-reset:'||substr(p_idempotency_key,1,100),p_release_sha,stage.approval_reference,p_reason);
 end if;$new$;
 if strpos(d,old)=0 or length(d)-length(replace(d,old,''))<>length(old) then
 raise exception 'Week 2 cutover reset authority baseline changed';end if;
 execute replace(d,old,replacement);

 d:=pg_get_functiondef('private.pin_week_rules()'::regprocedure);
 old:=$old$      and reset.reset_transaction_id=pg_current_xact_id() and reset.card_id=stage.card_id
      and reset.receipt_fingerprint=stage.expected_receipt_fingerprint)$old$;
 replacement:=$new$      and stage.original_ruleset_snapshot_id=old.ruleset_snapshot_id
      and reset.id=private.week2_props_matching_reset(old.id)
      and reset.card_id=stage.card_id
      and reset.receipt_fingerprint=stage.expected_receipt_fingerprint)$new$;
 if strpos(d,old)=0 or length(d)-length(replace(d,old,''))<>length(old) then
 raise exception 'Week 2 opened binding reset authority baseline changed';end if;
 execute replace(d,old,replacement);

 foreach d in array array[
   pg_get_functiondef('private.stage_open_week2_props(uuid,uuid,uuid,uuid,uuid[],text,text)'::regprocedure),
   pg_get_functiondef('private.start_open_week2_props_catalog(uuid)'::regprocedure)
 ] loop
 old:=$old$'cardReset',false$old$;
 if strpos(d,old)=0 or length(d)-length(replace(d,old,''))<>length(old) then
 raise exception 'Week 2 preparation reset response baseline changed';end if;
 replacement:=case when strpos(d,'stage_open_week2_props')>0
   then $new$'cardReset',private.week2_props_matching_reset(w.id) is not null$new$
   else $new$'cardReset',private.week2_props_matching_reset(p_week_id) is not null$new$ end;
 execute replace(d,old,replacement);
 end loop;
end; $reuse_reset$;
