-- Compatible offer disable. Keep the deployed prop-aware application, accepted
-- result workers, evidence imports, correction processing, reveal and history.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $disable$
declare
 apply boolean:=coalesce(nullif(current_setting('sunday_ledger.props_disable_apply',true),'')::boolean,false);
 lid uuid:=nullif(current_setting('sunday_ledger.props_league_id',true),'')::uuid;
 reason text:=coalesce(current_setting('sunday_ledger.props_disable_reason',true),'');
 sid uuid;
begin
 if not apply then raise notice 'DRY_RUN: no offer settings changed.'; return; end if;
 if lid is null or char_length(btrim(reason)) not between 3 and 500 then raise exception 'Configured league and recorded disable reason required'; end if;
 select season_id into strict sid from private.player_prop_leagues where league_id=lid;
 perform 1 from private.seasons where id=sid for update;
 update private.player_prop_leagues set enabled=false where league_id=lid;
 -- rules_enabled intentionally remains true: no downgrade, week repinning,
 -- refund, credit redeployment or deletion of already accepted props.
 raise notice 'New pilot prop offers disabled. Accepted prop processing and future supported rules remain operational.';
end; $disable$;
commit;
