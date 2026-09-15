-- Approved fallback when source readiness fails: open the exact staged future
-- week under the current supported game-only rules, without enabling props.
-- Default dry run changes nothing. Never use after prospective props activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
do $abort_catalog_hold$
declare
 apply boolean:=coalesce(nullif(current_setting('sunday_ledger.props_catalog_abort_apply',true),'')::boolean,false);
 lid uuid:=nullif(current_setting('sunday_ledger.props_league_id',true),'')::uuid;
 sid uuid:=nullif(current_setting('sunday_ledger.props_season_id',true),'')::uuid;
 wid uuid:=nullif(current_setting('sunday_ledger.props_catalog_abort_week_id',true),'')::uuid;
 approval text:=coalesce(current_setting('sunday_ledger.props_approval_reference',true),'');
 reason text:=coalesce(current_setting('sunday_ledger.props_catalog_abort_reason',true),'');
begin
 if not apply then raise notice 'DRY_RUN: no catalog hold, week or rules settings changed.'; return; end if;
 if lid is null or sid is null or wid is null or char_length(btrim(approval)) not between 3 and 500
 or char_length(btrim(reason)) not between 3 and 500 then
 raise exception 'Exact league/season/staged week, release approval and source-readiness failure reason are required'; end if;
 perform private.abort_player_catalog_hold(lid,sid,wid);
 raise notice 'Released exact staged week % for ordinary game-only play under Ruleset1.3; offers and prospective props rules remain disabled. Reason: %',wid,reason;
end; $abort_catalog_hold$;
commit;
