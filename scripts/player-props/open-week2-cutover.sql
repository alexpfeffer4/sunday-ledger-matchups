-- Exact approved Week 2 amendment. Default is a dry run. The owner never edits
-- SQL: the release operator supplies the securely inspected IDs/fingerprint,
-- approval, tested deployment SHA and completed readiness/menu evidence.
-- phase: stage | catalog | cutover. Staging never resets a card, holds entry,
-- enables acquisition or changes rules/offers. Catalog requires paid/source
-- readiness. Only cutover can reset the exact card, activate reviewed props
-- and freeze the complete reviewed menu inside that same atomic transaction.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $week2$
declare
 apply boolean:=coalesce(nullif(current_setting('sunday_ledger.week2_apply',true),'')::boolean,false);
 phase text:=coalesce(current_setting('sunday_ledger.week2_phase',true),'');
 lid uuid:=nullif(current_setting('sunday_ledger.props_league_id',true),'')::uuid;
 sid uuid:=nullif(current_setting('sunday_ledger.props_season_id',true),'')::uuid;
 wid uuid:=nullif(current_setting('sunday_ledger.props_week_id',true),'')::uuid;
 cid uuid:=nullif(current_setting('sunday_ledger.week2_card_id',true),'')::uuid;
 ids uuid[]:=nullif(current_setting('sunday_ledger.week2_receipt_ids',true),'')::uuid[];
 fingerprint text:=coalesce(current_setting('sunday_ledger.week2_receipt_fingerprint',true),'');
 approval text:=coalesce(current_setting('sunday_ledger.props_approval_reference',true),'');
 menu_hash text:=coalesce(current_setting('sunday_ledger.week2_menu_hash',true),'');
 readiness text:=coalesce(current_setting('sunday_ledger.props_readiness_sha',true),'');
 release_sha text:=coalesce(current_setting('sunday_ledger.props_release_sha',true),'');
 operation text:=coalesce(current_setting('sunday_ledger.week2_operation_key',true),'');
 reason text:=coalesce(current_setting('sunday_ledger.week2_reason',true),'');
 result jsonb;
begin
 if not apply then raise notice 'DRY_RUN: Week 2 receipts, credits, rules, offers and jobs remain unchanged.';return;end if;
 if phase='stage' then
 result:=private.stage_open_week2_props(lid,sid,wid,cid,ids,fingerprint,approval);
 elsif phase='catalog' then
 result:=private.start_open_week2_props_catalog(wid);
 elsif phase='cutover' then
 result:=private.cutover_open_week2_props(wid,menu_hash,readiness,release_sha,operation,reason);
 else raise exception 'Choose the explicit stage, catalog or cutover phase.';
 end if;
 raise notice '%',result;
end; $week2$;
commit;
