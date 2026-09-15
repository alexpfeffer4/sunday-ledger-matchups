begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select private.configure_nflverse_primary_pilot(repeat('a',64),'Approved current nomination generation fixture');
update private.player_result_policy set metadata_enabled=true,nflverse_contract_validated=true;
insert into auth.users(id,email) select ('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'catalog-quote-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select id,'Catalog Member '||right(id::text,1) from auth.users where id::text like 'ac100000-%';
create function pg_temp.as_rolling_member(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','ac100000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true); end; $$;
select pg_temp.as_rolling_member(1);
-- Create a real Live draft through the ordinary league authority.
create temporary table catalog_fixture_context as select league_id,season_id from api.create_league(
 p_name=>'Catalog Quotes',p_slug=>'catalog-quotes',p_mode=>'LIVE',p_nfl_year=>2026);
alter table catalog_fixture_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table catalog_fixture_context add column lease_id uuid;
alter table catalog_fixture_context add column review jsonb;
alter table catalog_fixture_context add column positions jsonb;
alter table catalog_fixture_context add column first_response jsonb;
alter table catalog_fixture_context add column first_week uuid;
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from catalog_fixture_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from catalog_fixture_context q,generate_series(2,4) n;
create function pg_temp.catalog_fixture_import(p_only_late boolean default false,p_price integer default 140)
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_agg(
 jsonb_build_object('source','THE_ODDS_API','externalEventId','catalog-game-'||n,'sportKey','americanfootball_nfl',
 'awayTeam','Away '||n,'homeTeam','Home '||n,'scheduledStartAt',q.kickoff,'markets',(
 select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType',market,'outcomeKey',side,
 'proposition',proposition,'lineMilli',line,'americanOdds',odds,'observedAt',clock_timestamp()-interval '5 minutes'))
 from (values ('MONEYLINE','AWAY','Away to win',null::integer,-160),('MONEYLINE','HOME','Home to win',null::integer,p_price),
 ('SPREAD','AWAY','Away -3.5',-3500,-110),('SPREAD','HOME','Home +3.5',3500,-110),
 ('TOTAL','OVER','Over44.5',44500,-110),('TOTAL','UNDER','Under44.5',44500,-110)) m(market,side,proposition,line,odds)
 )) order by n)) from catalog_fixture_context q,generate_series(1,16) n where not p_only_late or n=2;
$$;
select api.publish_live_week_slate(q.league_id,
 (api.store_live_odds_import(q.league_id,pg_temp.catalog_fixture_import(),'catalog-initial-import')->>'importId')::uuid,
 array(select 'catalog-game-'||n from generate_series(1,16)n),'catalog-initial-publish') from catalog_fixture_context q;
update catalog_fixture_context set first_week=(select id from private.season_weeks where season_id=catalog_fixture_context.season_id);
insert into private.player_prop_leagues(league_id,season_id,catalog_enabled,rules_enabled,first_enabled_week,activated_at,release_sha,approval_reference)
 select league_id,season_id,true,true,1,clock_timestamp(),repeat('a',40),'Nomination review fixture' from catalog_fixture_context;
select api.enqueue_player_catalog('catalog-quotes');
create temporary table nomination_lease as select api.claim_player_catalog_job((select first_week from catalog_fixture_context)) response;
select is((select response->>'sourcePolicy' from nomination_lease),'NFLVERSE_PRIMARY','catalog claim records primary policy');
select is((select response->>'selectionPolicy' from nomination_lease),'FEATURED_HIGHEST_STANDARD_LINES','claim selects highest standard line policy');
select api.import_player_catalog((select jsonb_agg(jsonb_build_object('canonicalKey','nomination-qb-'||n,'displayName','Nomination QB '||n,'position','QB',
 'provider','THE_ODDS_API','externalEventId','catalog-game-1','externalPlayerId','Nomination QB '||n,'team','Away 1',
 'gameDate',(c.kickoff at time zone 'America/New_York')::date,'verifiedAt',clock_timestamp(),'evidenceHash',repeat(n::text,64),
 'roleRank',0,'roleEvidence','Verified standard line membership fixture','resultPathVerified',true)) from catalog_fixture_context c,generate_series(1,2)n));
select is((select count(*) from private.player_menu_candidates((select id from private.sports_events where fixture_event_key='catalog-game-1'),'Away 1','QB_PASS')),0::bigint,'historical identities alone cannot nominate pilot candidates');
create temporary table nominations as select jsonb_agg(jsonb_build_object('externalEventId',e.fixture_event_key,'team',team,'slot',slot,
 'proposedCanonicalKey',case when e.fixture_event_key='catalog-game-1' and team='Away 1' and slot='QB_PASS' then 'nomination-qb-1' else null end,
 'candidates',case when e.fixture_event_key='catalog-game-1' and team='Away 1' and slot='QB_PASS' then
 '[{"canonicalKey":"nomination-qb-1","displayName":"Nomination QB 1","roleRank":0,"roleEvidence":"Verified current full-game line"}]'::jsonb else '[]'::jsonb end,
 'nominationExpiresAt',clock_timestamp()+interval '10 hours','nominationEvidenceHash',repeat('a',64),'nominationVerifiedAt',clock_timestamp()-interval '2 minutes') order by e.fixture_event_key,team,slot) proposals
 from private.sports_events e cross join lateral unnest(array[e.away_team,e.home_team])team cross join unnest(array['QB_PASS','RB_RUSH','RECEIVER'])slot
 where week_id=(select first_week from catalog_fixture_context);
select lives_ok($$select api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from nomination_lease),(select proposals from nominations))$$,'complete generation records all 96 slots including explicit empty membership');
select is((select count(*) from private.player_menu_candidates((select id from private.sports_events where fixture_event_key='catalog-game-1'),'Away 1','QB_PASS')),1::bigint,'current generation filters to one current candidate');
select is(api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from nomination_lease),(select proposals from nominations))->>'replayed','true','same complete generation replays');
select private.record_player_mapping_observation(m.id,jsonb_build_object('verifiedAt',clock_timestamp(),'evidenceHash',repeat('f',64),'roleRank',999,'roleEvidence','Later uncommitted generation fixture')) from private.player_provider_mappings m join private.player_subjects s on s.id=m.subject_id where s.canonical_key='nomination-qb-1';
select is((select role_rank from private.player_menu_candidates((select id from private.sports_events where fixture_event_key='catalog-game-1'),'Away 1','QB_PASS')),0,'partially imported mapping rank cannot change committed nomination authority');

select throws_ok($$select api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from nomination_lease),(select proposals-0 from nominations))$$,'22023',null,'partial refresh cannot carry old omitted nominations');
update private.week_player_menu set confirmed_at=clock_timestamp(),confirmed_by='ac100000-0000-4000-8000-000000000001' where week_id=(select first_week from catalog_fixture_context);
create function pg_temp.expired_nomination_review(p_open boolean) returns jsonb language plpgsql as $$
declare new_generation uuid;result jsonb;
begin
 begin
  if p_open then update private.season_weeks set state='OPEN' where id=(select first_week from catalog_fixture_context);end if;
  -- Disposable historical evidence fixture models time passing after review.
  insert into private.player_catalog_nomination_generations(week_id,source_validation_id,nominations,content_hash)
  select g.week_id,g.source_validation_id,(select jsonb_agg(n||jsonb_build_object('nominationExpiresAt',clock_timestamp()-interval '1 second')) from jsonb_array_elements(g.nominations)n),repeat('e',64)
  from private.player_catalog_nomination_heads h join private.player_catalog_nomination_generations g on g.id=h.generation_id
  where h.week_id=(select first_week from catalog_fixture_context) returning id into new_generation;
  update private.player_catalog_nomination_heads set generation_id=new_generation where week_id=(select first_week from catalog_fixture_context);
  result:=jsonb_build_object('reviewed',private.player_props_menu_reviewed((select first_week from catalog_fixture_context)),
   'candidateCount',(select count(*) from private.player_menu_candidates((select id from private.sports_events where fixture_event_key='catalog-game-1'),'Away 1','QB_PASS')));
  raise exception using errcode='ZX001',message=result::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;
end; $$;
select is(pg_temp.expired_nomination_review(false)->>'reviewed','false','expired planned nomination requires fresh review before opening');
select is(pg_temp.expired_nomination_review(true),'{"reviewed":true,"candidateCount":0}'::jsonb,'already-open reviewed identity preserves game betting after quote expiry');
create temporary table old_nominations as table nominations;
update nominations set proposals=(select jsonb_agg(case when n->>'externalEventId'='catalog-game-1' and n->>'team'='Away 1' and n->>'slot'='QB_PASS'
 then n||jsonb_build_object('proposedCanonicalKey','nomination-qb-2','candidates','[{"canonicalKey":"nomination-qb-2","displayName":"Nomination QB 2","roleRank":0,"roleEvidence":"Verified new highest line"}]'::jsonb,
 'nominationEvidenceHash',repeat('b',64),'nominationVerifiedAt',clock_timestamp()-interval '1 minute') else n end) from jsonb_array_elements(proposals)n);
select lives_ok($$select api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from nomination_lease),(select proposals from nominations))$$,'new coherent generation replaces prior current membership');
select is((select s.canonical_key from private.player_menu_candidates((select id from private.sports_events where fixture_event_key='catalog-game-1'),'Away 1','QB_PASS')c join private.player_subjects s on s.id=c.subject_id),'nomination-qb-2','withdrawn prior leader no longer wins old rank-zero tie');
select is((select count(*) from private.player_provider_mappings),2::bigint,'refresh preserves historical stable identities');
select is((select count(*) from private.week_player_menu where confirmed_at is not null),0::bigint,'changed membership invalidates old commissioner review');
select throws_ok($$select api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from nomination_lease),(select proposals from old_nominations))$$,'55000',null,'older generation cannot replace current membership');
update nominations set proposals=(select jsonb_agg(case when n->>'externalEventId'='catalog-game-1' and n->>'team'='Away 1' and n->>'slot'='QB_PASS'
 then n||jsonb_build_object('proposedCanonicalKey',null,'candidates','[]'::jsonb,'nominationEvidenceHash',repeat('c',64),'nominationVerifiedAt',clock_timestamp()) else n end) from jsonb_array_elements(proposals)n);
select lives_ok($$select api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from nomination_lease),(select proposals from nominations))$$,'explicit current empty membership removes withdrawn offers');
select is((select count(*) from private.player_menu_candidates((select id from private.sports_events where fixture_event_key='catalog-game-1'),'Away 1','QB_PASS')),0::bigint,'missing market does not resurrect stale player');
select function_privs_are('api','record_player_catalog_nominations',array['uuid','jsonb'],'authenticated',array[]::text[],'member cannot write nomination generations');
select throws_ok($$update private.player_catalog_nomination_generations set content_hash=repeat('f',64)$$,'55000',null,'nomination history is append-only');
select * from finish();
rollback;
