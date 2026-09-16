create function pg_temp.automation_postseason_fixture(size integer,p_stop_open18 boolean default false) returns jsonb language plpgsql as $$
declare c jsonb;u uuid;wk uuid;j jsonb;n integer;answer jsonb;gate jsonb;
begin
 c:=pg_temp.automation_context('auto-postseason-'||size||'-'||substr(gen_random_uuid()::text,1,8),p_enroll=>false);
 -- The reused Week 2 has real matchup/card rows; supply its stored terminal
 -- score/result fixture facts as well as the prior-week FINAL state.
 perform pg_temp.phase8_close_matrix_week((c->>'season')::uuid,2);
 -- Complete synthetic roster construction before real standing consent.
 update private.seasons set lifecycle='DRAFT',roster_locked_at=null where id=(c->>'season')::uuid;
 for n in 5..size loop
 u:=gen_random_uuid();insert into auth.users(id,email) values(u,u::text||'@automation.test');
 insert into private.profiles(id,display_name) values(u,'Automation member '||n);
 insert into private.league_memberships(league_id,user_id,role) values((c->>'league')::uuid,u,'MEMBER');
 insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak) values((c->>'season')::uuid,(c->>'league')::uuid,u,lpad(n::text,64,'0'));
 end loop;
 update private.seasons set lifecycle='REGULAR',roster_locked_at=now() where id=(c->>'season')::uuid;
 perform api.configure_season_automation(c->>'slug','ENABLE',3,'ALL_NFL_GAMES',private.season_automation_policy_hash());
 insert into private.season_weeks(season_id,league_id,nfl_week,scope,state,opens_at,common_lock_at,locked_at,correction_window_closes_at)
 values((c->>'season')::uuid,(c->>'league')::uuid,14,'REGULAR','FINAL',now()-interval '2 days',now()-interval '1 day',now()-interval '1 day',clock_timestamp()+interval '1 hour') returning id into wk;
 insert into private.standings_snapshots(season_id,week_id,league_id,through_week,ordered_rows,input_hash,status)
 select (c->>'season')::uuid,wk,(c->>'league')::uuid,14,jsonb_agg(jsonb_build_object('seed',seed,'entryId',id,'displayName','Member '||seed,
 'wins',size-seed,'losses',seed,'ties',0,'pointsForCenticredits',2000000-seed*10000,'allPlayHalfWinUnits',200-seed,
 'allPlayComparisonCount',126,'attendanceMisses',0,'highestWeekCenticredits',200000-seed*1000,'deterministicTiebreak',lpad(seed::text,64,'0')) order by seed),repeat('a',64),'FINAL'
 from (select id,row_number() over(order by id)::integer seed from private.season_entries where season_id=(c->>'season')::uuid)e;
 -- Historical regular weeks are stored fixture inputs, as in the roster matrix.
 -- The unchanged authoritative full-season suite exercises their scoring paths.
 insert into private.season_weeks(season_id,league_id,nfl_week,scope,state,opens_at,common_lock_at,locked_at,correction_window_closes_at)
 select (c->>'season')::uuid,(c->>'league')::uuid,historical,'REGULAR','FINAL',now()-interval '2 days',now()-interval '1 day',now()-interval '1 day',now()-interval '1 hour'
 from generate_series(1,13)historical where historical<>2;
 gate:=api.complete_season_automation(pg_temp.automation_run(c,'QUALIFY',15));
 update private.season_weeks set correction_window_closes_at=now()-interval '1 second' where id=wk;
 j:=api.complete_season_automation(pg_temp.automation_run(c,'QUALIFY',15));
 if j->>'status'<>'QUALIFIED' then raise exception 'Qualification failed: %',j;end if;
 for n in 15..18 loop
 if n=18 then
 j:=api.complete_season_automation(pg_temp.automation_run(c,'CHAMPION',17));
 if j->>'status'<>'CHAMPION_FINAL' then raise exception 'Champion failed: %',j;end if;
 end if;
 wk:=pg_temp.automation_stage(c,n,false);
 j:=api.complete_season_automation(pg_temp.automation_run(c,'VALIDATE',n));
 if j->>'status'<>'VALIDATED' then raise exception 'Validation failed: %',j;end if;
 j:=api.complete_season_automation(pg_temp.automation_run(c,'OPEN',n));
 if j->>'status'<>'OPENED' then raise exception 'Opening failed: %',j;end if;
 if n=18 and p_stop_open18 then return c||jsonb_build_object('week',wk,'event17',(select id from private.sports_events where week_id=(select id from private.season_weeks where season_id=(c->>'season')::uuid and nfl_week=17)));end if;
 insert into private.event_result_versions(event_id,week_id,league_id,version,status,away_score,home_score,source,reason,recorded_by,input_hash)
 select id,week_id,league_id,1,'FINAL',14,21,'MANUAL_OBJECTIVE','Immutable postseason result fixture',(c->>'owner')::uuid,encode(extensions.digest(id::text||':fixture-final','sha256'),'hex') from private.sports_events where week_id=wk;
 -- Terminal fixture evidence also closes the rolling entry window through
 -- the existing cutoff trigger before any objective correction can replay it.
 update private.sports_events set state='FINAL',actual_started_at=clock_timestamp()-interval '4 hours' where week_id=wk;
 perform pg_temp.phase8_close_matrix_week((c->>'season')::uuid,n);
 end loop;
 j:=api.complete_season_automation(pg_temp.automation_run(c,'ARCHIVE',18));
 answer:=j||jsonb_build_object('gate',gate->>'status','cards',(select count(*) from private.weekly_cards card join private.season_weeks w on w.id=card.week_id where w.season_id=(c->>'season')::uuid and w.nfl_week>=15),
 'rounds',(select count(*) from private.playoff_round_publications where season_id=(c->>'season')::uuid and execution_kind='SYSTEM' and created_by is null),
 'validations',(select count(*) from private.player_prop_system_validations v join private.season_weeks w on w.id=v.week_id where w.season_id=(c->>'season')::uuid));
 return answer;end $$;
create function pg_temp.automation_postseason_trial(size integer) returns jsonb language plpgsql as $$
declare answer jsonb;
begin begin
 answer:=pg_temp.automation_postseason_fixture(size);
 raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;end $$;
