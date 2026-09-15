-- Acquisition-only setup for an authorized isolated environment or, after the
-- owner's combined release approval, the exact configured Production scope.
-- Does not enable offers, prospective rules, result processing or a scheduler.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $catalog_setup$
declare
 apply boolean:=coalesce(nullif(current_setting('sunday_ledger.props_catalog_apply',true),'')::boolean,false);
 lid uuid:=nullif(current_setting('sunday_ledger.props_league_id',true),'')::uuid;
 sid uuid:=nullif(current_setting('sunday_ledger.props_season_id',true),'')::uuid;
 reference text:=coalesce(current_setting('sunday_ledger.props_catalog_setup_reference',true),'');
 s private.seasons%rowtype;
begin
 if not apply then raise notice 'DRY_RUN: catalog acquisition remains unchanged; no offers or rules enabled.'; return; end if;
 if lid is null or sid is null or char_length(btrim(reference)) not between 3 and 500 then
 raise exception 'Exact league/season and recorded isolated-build or release authorization reference required'; end if;
 select * into strict s from private.seasons where id=sid and league_id=lid for update;
 if s.mode not in('LIVE','SIMULATION') or s.lifecycle='FINAL' then raise exception 'An active configured season is required'; end if;
 if exists(select 1 from private.player_prop_leagues where league_id=lid and season_id is not null and season_id<>sid) then
 raise exception 'A different existing catalog/rules season scope requires explicit review'; end if;
 insert into private.player_prop_leagues(league_id,enabled,rules_enabled,season_id,catalog_enabled)
 values(lid,false,false,sid,true)
 on conflict(league_id) do update set catalog_enabled=true,season_id=excluded.season_id;
 update private.player_result_policy set metadata_enabled=true where singleton;
 raise notice 'Configured published-event catalog acquisition only; original offers, rules, result processing and usage retained.';
end; $catalog_setup$;
commit;
