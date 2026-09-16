-- Disposable fixture helpers. Existing progressive helpers supply the verified
-- sources, exact manual Week 2 and real authority paths. No hosted execution.
create function pg_temp.automation_run(c jsonb,op text,n integer) returns uuid language plpgsql as $$
declare id uuid:=gen_random_uuid();a private.season_automation%rowtype;
begin
 select * into strict a from private.season_automation where season_id=(c->>'season')::uuid;
 insert into private.season_automation_runs(id,season_id,consent_id,revision,generation,operation,nfl_week,operation_key,lease_until)
 values(id,a.season_id,a.consent_id,a.revision,a.generation+1,op,n,op||':'||n,clock_timestamp()+interval '90 seconds');
 update private.season_automation set generation=a.generation+1,lease_id=id,lease_until=clock_timestamp()+interval '90 seconds' where season_id=a.season_id;
 return id;
end $$;
create function pg_temp.automation_context(label text,p_owner_id uuid default null,p_enroll boolean default true) returns jsonb language plpgsql as $$
declare c jsonb;ids uuid[];matches jsonb;
begin
 c:=pg_temp.progressive_fixture(label,p_owner_id=>p_owner_id);
 update private.season_automation_settings set enabled=true,release_sha=repeat('d',40);
 if p_enroll then perform api.configure_season_automation(c->>'slug','ENABLE',3,'ALL_NFL_GAMES',private.season_automation_policy_hash());end if;
 select array_agg(id order by id) into ids from private.season_entries where season_id=(c->>'season')::uuid;
 select jsonb_agg(jsonb_build_object('week',wk,'sideAEntryId',ids[(pair*2)-1],'sideBEntryId',ids[pair*2])) into matches from generate_series(1,14)wk cross join generate_series(1,2)pair;
 insert into private.schedule_publications(season_id,league_id,version,algorithm_version,seed,ordered_entry_ids,output_hash,created_by,schedule_json)
 values((c->>'season')::uuid,(c->>'league')::uuid,2,'circle-v1','automation-fixture-seed',ids,repeat('d',64),(c->>'owner')::uuid,jsonb_build_object('matchups',matches));
 -- Stored prior-week finality is fixture input. Settlement correctness and late
 -- corrections are exercised by the unchanged canonical full-season lanes.
 update private.season_weeks set state='FINAL' where id=(c->>'week')::uuid;
 return c;
end $$;
create function pg_temp.automation_stage(c jsonb,n integer,p_partial boolean default false,p_open_at timestamptz default null) returns uuid language plpgsql as $$
declare r uuid;payload jsonb;result jsonb;wk uuid;ev private.sports_events%rowtype;choices jsonb;claim jsonb;g jsonb;t timestamptz:=clock_timestamp()+interval '48 hours';
begin
 r:=pg_temp.automation_run(c,'PREPARE',n);
 -- Mirror the normalized provider's UTC ISO strings, including microseconds;
 -- the commissioner import DTO intentionally validates that same contract.
 payload:=jsonb_build_object('source','THE_ODDS_API','fetchedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'events',jsonb_build_array(jsonb_build_object(
 'source','THE_ODDS_API','externalEventId',c->>'slug'||'-auto-'||n,'sportKey','americanfootball_nfl','awayTeam','Away A','homeTeam','Home B','scheduledStartAt',to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'markets',(select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType',market,'outcomeKey',outcome,'proposition','Fixture market','americanOdds',-110,'lineMilli',line,'observedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
 from (values('MONEYLINE','AWAY',null::integer),('MONEYLINE','HOME',null),('SPREAD','AWAY',3500),('SPREAD','HOME',-3500),('TOTAL','OVER',45500),('TOTAL','UNDER',45500))v(market,outcome,line)))));
 result:=private.lifecycle_store_live_odds_import((c->>'league')::uuid,payload,'fixture-auto-import-'||n,r);
 if n<=14 then result:=private.lifecycle_publish_next_live_week_slate((c->>'league')::uuid,(result->>'importId')::uuid,array[c->>'slug'||'-auto-'||n],'fixture-auto-publish-'||n,r);
 elsif n=18 then result:=private.lifecycle_publish_week18_exhibition((c->>'league')::uuid,(result->>'importId')::uuid,array[c->>'slug'||'-auto-'||n],'fixture-auto-publish-'||n,r);
 else result:=private.lifecycle_publish_postseason_week((c->>'league')::uuid,(result->>'importId')::uuid,array[c->>'slug'||'-auto-'||n],'fixture-auto-publish-'||n,r);end if;
 wk:=(result->>'weekId')::uuid;
 select * into strict ev from private.sports_events where week_id=wk;
 g:=jsonb_build_array(jsonb_build_object('gameId','fixture-'||n,'awayTeam',ev.away_team,'homeTeam',ev.home_team,'scheduledStartAt',ev.scheduled_start_at));
 insert into private.season_automation_week_plans(week_id,consent_id,run_id,expected_games,schedule_hash,opens_at)
 select wk,consent_id,r,g,repeat('a',64),coalesce(p_open_at,clock_timestamp()-interval '1 minute') from private.season_automation where season_id=(c->>'season')::uuid;
 update private.season_automation_runs set state='SUCCEEDED',finished_at=clock_timestamp(),response=result where id=r;
 update private.season_automation set lease_id=null,lease_until=null where season_id=(c->>'season')::uuid;
 claim:=api.claim_player_catalog_job(wk);
 if p_partial then
 perform api.import_player_catalog(jsonb_build_array(jsonb_build_object('canonicalKey',ev.fixture_event_key||':QB','displayName','Fixture Quarterback','position','QB','provider','THE_ODDS_API',
 'externalEventId',ev.fixture_event_key,'externalPlayerId','fixture-qb','team',ev.away_team,'gameDate',(t at time zone 'America/New_York')::date,'verifiedAt',clock_timestamp(),
 'evidenceHash',repeat('b',64),'roleRank',0,'roleEvidence','Verified highest standard fixture line','resultPathVerified',true)));
 end if;
 select jsonb_agg(jsonb_build_object('externalEventId',ev.fixture_event_key,'team',team,'slot',slot,
 'proposedCanonicalKey',case when p_partial and team=ev.away_team and slot='QB_PASS' then ev.fixture_event_key||':QB' else null end,
 'candidates',case when p_partial and team=ev.away_team and slot='QB_PASS' then jsonb_build_array(jsonb_build_object('canonicalKey',ev.fixture_event_key||':QB','displayName','Fixture Quarterback','roleRank',0,'roleEvidence','Verified highest standard fixture line')) else '[]'::jsonb end,
 'warnings','[]'::jsonb,'availableQuotes',case when p_partial and team=ev.away_team and slot='QB_PASS' then 1 else 0 end,
 'nominationEvidenceHash',repeat('b',64),'nominationVerifiedAt',clock_timestamp(),'nominationExpiresAt',clock_timestamp()+interval '11 hours'))
 into choices from unnest(array[ev.away_team,ev.home_team])team cross join unnest(array['QB_PASS','RB_RUSH','RECEIVER'])slot;
 perform api.record_player_catalog_nominations((claim->>'leaseId')::uuid,choices);
 perform api.complete_player_catalog_job((claim->>'leaseId')::uuid,'PENDING',6,'CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED');
 return wk;
end $$;

create function pg_temp.automation_late_fill(wk uuid) returns jsonb language plpgsql as $$
declare m private.week_player_menu%rowtype;e private.sports_events%rowtype;r uuid;claim jsonb;n jsonb;key text;
begin
 select * into strict m from private.week_player_menu where week_id=wk and subject_id is null order by event_id,team,slot limit 1;
 select * into strict e from private.sports_events where id=m.event_id;key:=e.fixture_event_key||':late:'||m.team||':'||m.slot;
 perform api.import_player_catalog(jsonb_build_array(jsonb_build_object('canonicalKey',key,'displayName','Verified late fixture player',
 'position',case m.slot when 'QB_PASS' then 'QB' when 'RB_RUSH' then 'RB' else 'WR' end,'provider','THE_ODDS_API','externalEventId',e.fixture_event_key,
 'externalPlayerId',key,'team',m.team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'verifiedAt',clock_timestamp(),
 'evidenceHash',repeat('c',64),'roleRank',0,'roleEvidence','Highest standard fixture line','resultPathVerified',true)));
 insert into private.shared_quote_requests(kind,event_ids,families,state,fetched_at) values('PROPS',array[e.fixture_event_key],
 array[case m.slot when 'QB_PASS' then 'player_pass_yds' when 'RB_RUSH' then 'player_rush_yds' else 'player_reception_yds' end],'SUCCEEDED',clock_timestamp()) returning id into r;
 insert into private.player_catalog_quote_evidence(week_id,event_id,family,request_id,expires_at) values(wk,e.id,
 case m.slot when 'QB_PASS' then 'player_pass_yds' when 'RB_RUSH' then 'player_rush_yds' else 'player_reception_yds' end,r,clock_timestamp()+interval '12 hours');
 update private.player_catalog_jobs set next_attempt_at=clock_timestamp() where week_id=wk;
 claim:=api.claim_player_catalog_job(wk);
 n:=jsonb_build_array(jsonb_build_object('externalEventId',e.fixture_event_key,'team',m.team,'slot',m.slot,'proposedCanonicalKey',key,
 'candidates',jsonb_build_array(jsonb_build_object('canonicalKey',key,'displayName','Verified late fixture player','roleRank',0,'roleEvidence','Highest standard fixture line')),
 'warnings','[]'::jsonb,'availableQuotes',1,'nominationEvidenceHash',repeat('c',64),'nominationVerifiedAt',clock_timestamp(),'nominationExpiresAt',clock_timestamp()+interval '11 hours'));
 return api.record_player_catalog_nominations((claim->>'leaseId')::uuid,n);
end $$;
