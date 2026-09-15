-- Approved progressive Week 2 continuation. Operator-owned private inputs;
-- never ask the owner to paste keys, card IDs or a receipt manifest into chat.
-- Default is a no-change dry run. The exact recorded reset is reused.
-- Phases: authorize (offers remain disabled) | cutover (actual reviewed scope).
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $progressive_week2$
declare
 apply boolean:=coalesce(nullif(current_setting('sunday_ledger.progressive_apply',true),'')::boolean,false);
 phase text:=coalesce(current_setting('sunday_ledger.progressive_phase',true),'');
 wid uuid:=nullif(current_setting('sunday_ledger.props_week_id',true),'')::uuid;
 release_sha text:=coalesce(current_setting('sunday_ledger.props_release_sha',true),'');
 approval text:=coalesce(current_setting('sunday_ledger.props_approval_reference',true),'');
 menu_hash text:=coalesce(current_setting('sunday_ledger.week2_menu_hash',true),'');
 readiness text:=coalesce(current_setting('sunday_ledger.props_readiness_sha',true),'');
 operation text:=coalesce(current_setting('sunday_ledger.week2_operation_key',true),'');
 reason text:=coalesce(current_setting('sunday_ledger.week2_reason',true),'');
 result jsonb;
begin
 if not apply then
  raise notice 'DRY_RUN: progressive authorization, review, rules, offers, credits and jobs remain unchanged.';
  return;
 end if;
 if phase='authorize' then
  result:=to_jsonb(private.authorize_progressive_player_props(wid,release_sha,approval));
 elsif phase='cutover' then
  result:=private.cutover_open_week2_progressive_props(wid,menu_hash,readiness,release_sha,operation,reason);
 else
  raise exception 'Choose the explicit progressive authorize or cutover phase.';
 end if;
 raise notice '%',result;
end; $progressive_week2$;
commit;
