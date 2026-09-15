-- Acquisition-only setup for an authorized isolated environment or, after the
-- owner's combined release approval, the exact configured Production scope.
-- Does not enable offers, prospective rules, result processing or a scheduler.
-- This release helper targets the already-open active LIVE pilot. Draft/initial
-- roster opening is outside this approved hold/abort preparation scope.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $catalog_setup$
declare
 apply boolean:=coalesce(nullif(current_setting('sunday_ledger.props_catalog_apply',true),'')::boolean,false);
 lid uuid:=nullif(current_setting('sunday_ledger.props_league_id',true),'')::uuid;
 sid uuid:=nullif(current_setting('sunday_ledger.props_season_id',true),'')::uuid;
 reference text:=coalesce(current_setting('sunday_ledger.props_catalog_setup_reference',true),'');
 boundary integer;
begin
 if not apply then raise notice 'DRY_RUN: catalog acquisition remains unchanged; no offers or rules enabled.'; return; end if;
 if lid is null or sid is null or char_length(btrim(reference)) not between 3 and 500 then
 raise exception 'Exact league/season and recorded isolated-build or release authorization reference required'; end if;
 boundary:=private.configure_player_catalog_hold(lid,sid);
 raise notice 'Configured acquisition hold from unopened week %; future publication stays PLANNED and queues metadata. Original offers, rules, opened weeks, result processing and usage retained.',boundary;
end; $catalog_setup$;
commit;
