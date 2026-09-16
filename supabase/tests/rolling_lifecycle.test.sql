begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Explicit disposable activation. Installation itself must leave Live V1.2.
select is((select ruleset_version from private.authoritative_season_rulesets where mode='LIVE'),
  '1.2', 'installing rolling support does not activate it');
update private.authoritative_season_rulesets a
set ruleset_version='1.3', product_bible_version='3.2', canonical_json=p.canonical_json, sha256_hash=p.sha256_hash
from private.prepared_rolling_rulesets p where p.mode=a.mode;

create function pg_temp.rid(n integer) returns uuid language sql immutable as $$
  select ('a1300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.actor(n integer) returns void language sql volatile as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.rid(n),'role','authenticated')::text,true)::text::void;
$$;
-- Real ordinary Simulation receipts, with deliberately separated Sunday/Monday
-- windows, independent of the owner guide's accelerated all-Sunday fixture pack.
insert into auth.users(id,email) select pg_temp.rid(n),'rolling-lifecycle-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select pg_temp.rid(n),'Rolling member '||n from generate_series(1,4) n on conflict(id) do update set display_name=excluded.display_name;
insert into private.leagues(id,name,slug,created_by) values(pg_temp.rid(10),'Rolling lifecycle','rolling-lifecycle',pg_temp.rid(1));
insert into private.league_memberships(league_id,user_id,role)
  select pg_temp.rid(10),pg_temp.rid(n),case when n=1 then 'COMMISSIONER' else 'MEMBER' end from generate_series(1,4) n;
insert into private.season_ruleset_snapshots(id,ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,frozen_at)
  select pg_temp.rid(20),ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,'2026-09-12 12:00Z'
  from private.authoritative_season_rulesets where mode='SIMULATION';
insert into private.seasons(id,league_id,ruleset_snapshot_id,mode,nfl_year,lifecycle,roster_seed,schedule_seed,roster_locked_at,simulated_now)
 values(pg_temp.rid(30),pg_temp.rid(10),pg_temp.rid(20),'SIMULATION',2026,'REGULAR',repeat('a',64),repeat('b',64),'2026-09-12 12:00Z','2026-09-13 16:00Z');
insert into private.season_entries(id,season_id,league_id,user_id,standing_tiebreak)
 select pg_temp.rid(40+n),pg_temp.rid(30),pg_temp.rid(10),pg_temp.rid(n),lpad(n::text,64,'0') from generate_series(1,4) n;
insert into private.season_weeks(id,season_id,league_id,nfl_week,state,opens_at,common_lock_at)
 values(pg_temp.rid(50),pg_temp.rid(30),pg_temp.rid(10),1,'OPEN','2026-09-13 16:00Z','2026-09-13 16:55Z');
insert into private.schedule_publications(id,season_id,league_id,version,algorithm_version,seed,ordered_entry_ids,output_hash,created_by)
 values(pg_temp.rid(60),pg_temp.rid(30),pg_temp.rid(10),1,'rolling-test','rolling',array[pg_temp.rid(41),pg_temp.rid(42),pg_temp.rid(43),pg_temp.rid(44)],repeat('c',64),pg_temp.rid(1));
insert into private.matchups(id,week_id,season_id,league_id,schedule_publication_id,side_a_entry_id,side_b_entry_id,display_order)
 select pg_temp.rid(70+n),pg_temp.rid(50),pg_temp.rid(30),pg_temp.rid(10),pg_temp.rid(60),pg_temp.rid(39+n*2),pg_temp.rid(40+n*2),n from generate_series(1,2) n;
insert into private.weekly_cards(id,week_id,season_id,league_id,entry_id,owner_user_id,granted_at)
 select pg_temp.rid(80+n),pg_temp.rid(50),pg_temp.rid(30),pg_temp.rid(10),pg_temp.rid(40+n),pg_temp.rid(n),'2026-09-13 16:00Z' from generate_series(1,4) n;
insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
 select pg_temp.rid(90+n),pg_temp.rid(50),pg_temp.rid(30),pg_temp.rid(10),'rolling-event-'||n,'Away '||n,'Home '||n,
   case n when 1 then '2026-09-13 17:00Z'::timestamptz when 2 then '2026-09-13 20:00Z'::timestamptz else '2026-09-15 00:20Z'::timestamptz end from generate_series(1,3) n;
insert into private.slates(id,week_id,season_id,league_id,version,fixture_id,common_lock_at)
 values(pg_temp.rid(100),pg_temp.rid(50),pg_temp.rid(30),pg_temp.rid(10),1,'rolling-lifecycle','2026-09-13 16:55Z');

-- Fixture adapter creates immutable fresh observation rows, just like the source
-- adapter. Every submission still passes the real membership/acceptance engine.
create function pg_temp.offer(event_number integer, p_outcome text default 'HOME') returns jsonb language plpgsql as $$
declare snapshot_id uuid:=gen_random_uuid(); h text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'); t timestamptz;
begin
 t:=private.card_confirmation_time(pg_temp.rid(30));
 insert into private.market_snapshots(id,event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,american_odds,quality_status,observed_at,payload_hash)
 values(snapshot_id,pg_temp.rid(90+event_number),pg_temp.rid(50),pg_temp.rid(10),'draftkings','MONEYLINE',p_outcome,'Fixture result',100,'HEALTHY',t,h);
 insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
 values(pg_temp.rid(100),pg_temp.rid(90+event_number),snapshot_id,pg_temp.rid(50),pg_temp.rid(10));
 insert into private.live_quote_heads(event_id,week_id,league_id,market_type,outcome_key,market_snapshot_id)
 values(pg_temp.rid(90+event_number),pg_temp.rid(50),pg_temp.rid(10),'MONEYLINE',p_outcome,snapshot_id)
 on conflict(event_id,market_type,outcome_key) where subject_id is null do update set market_snapshot_id=excluded.market_snapshot_id;
 return jsonb_build_object('marketSnapshotId',snapshot_id,'payloadHash',h);
end; $$;
select pg_temp.offer(1),pg_temp.offer(2),pg_temp.offer(3);
create function pg_temp.submit(n integer,event_number integer,credits integer,k text) returns jsonb language plpgsql as $$
begin
 perform pg_temp.actor(n);
 return api.accept_stage1_card('rolling-lifecycle',jsonb_build_array(pg_temp.offer(event_number)||jsonb_build_object('stakeCredits',credits)),k);
end; $$;
create function pg_temp.move(t timestamptz,k text) returns void language plpgsql as $$
begin
 perform pg_temp.actor(1);
 perform api.advance_simulated_time(pg_temp.rid(10),t,k);
end; $$;

select lives_ok($$select pg_temp.submit(1,1,600,'rolling-first-600')$$,'a 600-credit first batch participates');
select is((select compliance from private.weekly_cards where id=pg_temp.rid(81)),'COMPLIANT','a partial card is immediately compliant');
select ok(private.is_week_card_sealed(pg_temp.rid(50)),'the first receipt freezes downstream slate/pairing identity');
select lives_ok($$select pg_temp.move('2026-09-13 16:55Z','rolling-common-time')$$,'the former common lock does not close entries');
select lives_ok($$select api.lock_stage1_week(pg_temp.rid(10),'rolling-common-lock')$$,'old lock RPC is a compatible operational transition');
select is((select count(*) from private.weekly_cards where week_id=pg_temp.rid(50) and compliance='PENDING'),3::bigint,'zero-bet members remain pending after common lock');
select is((select count(*) from private.weekly_score_versions where week_id=pg_temp.rid(50) and compliance='INCOMPLETE'),0::bigint,'no Sunday attendance miss is materialized');
select ok(private.rolling_card_can_submit(pg_temp.rid(81)),'a later published game remains structurally available');
select lives_ok($$select pg_temp.move('2026-09-13 19:00Z','rolling-afternoon-time')$$,'Simulation clock advances to 3 p.m. Eastern');
select lives_ok($$select api.set_stage1_event_live(pg_temp.rid(91),'2026-09-13 17:00Z','rolling-early-start')$$,'reliable actual start uses the existing authority');
select lives_ok($$select api.record_stage1_result(pg_temp.rid(91),'FINAL',10,20,'Fixture home team wins.','SIMULATION_FIXTURE','rolling-early-result')$$,'an earlier submitted game settles while later games remain open');
select is((select score_centicredits from private.weekly_score_versions where card_id=pg_temp.rid(81) order by created_at desc,id desc limit 1),120000::bigint,'600 at +100 returns exactly 1,200; unused 400 scores zero');
select is((select is_complete from private.weekly_score_versions where card_id=pg_temp.rid(81) order by created_at desc,id desc limit 1),false,'settled current receipts do not finish a card with future choices');
select is((select count(*) from private.matchup_result_versions where week_id=pg_temp.rid(50)),0::bigint,'no provisional win or no-show loss is published prematurely');
select ok(not private.event_accepts_entries(pg_temp.rid(91)) and private.event_accepts_entries(pg_temp.rid(92)),'at 3 p.m. the 1 p.m. game is closed and 4 p.m. game is open');
select lives_ok($$select pg_temp.submit(1,2,50,'rolling-afternoon-50')$$,'a later batch uses remaining original allocation after early settlement');
select is((select sum(stake_credits) from private.position_receipts where card_id=pg_temp.rid(81)),650::bigint,'early winnings do not replenish the original allocation');
select lives_ok($$select pg_temp.move('2026-09-14 23:00Z','rolling-monday-time')$$,'empty members retain Monday participation');
select lives_ok($$select pg_temp.submit(2,3,600,'rolling-monday-first')$$,'a member can make the first valid submission Monday');
select is((select compliance from private.weekly_cards where id=pg_temp.rid(82)),'COMPLIANT','Monday first submission is ordinary participation');
select lives_ok($$select pg_temp.move('2026-09-15 00:20Z','rolling-last-cutoff')$$,'entry closes at the final published game cutoff');
select is((select count(*) from private.weekly_cards where week_id=pg_temp.rid(50) and compliance='INCOMPLETE'),2::bigint,'only the two true no-shows receive misses at final cutoff');
select ok(private.rolling_week_entries_closed(pg_temp.rid(50)) and not private.rolling_card_can_submit(pg_temp.rid(81)),'unused credits expire and cannot fund another bet');
select is((select side_a_decision||':'||side_b_decision from private.matchup_result_versions where matchup_id=pg_temp.rid(72) order by created_at desc,id desc limit 1),'LOSS:LOSS','both absent receive losses rather than a tie');
select lives_ok($$select api.record_stage1_result(pg_temp.rid(92),'VOID',null,null,'Fixture game canceled.','SIMULATION_FIXTURE','rolling-afternoon-void')$$,'a voided accepted stake returns through normal settlement');
select lives_ok($$select api.set_stage1_event_live(pg_temp.rid(93),'2026-09-15 00:20Z','rolling-monday-start')$$,'Monday actual kickoff is confirmed');
select lives_ok($$select api.record_stage1_result(pg_temp.rid(93),'FINAL',20,10,'Fixture away team wins.','SIMULATION_FIXTURE','rolling-monday-result')$$,'last result automatically closes the week');
select is((select state from private.season_weeks where id=pg_temp.rid(50)),'FINAL','no mandatory provisional wait is restored');
select is((select score_centicredits from private.weekly_score_versions where card_id=pg_temp.rid(81) order by created_at desc,id desc limit 1),125000::bigint,'partial win plus void returns 1,250 with unused 350 excluded');
select is((select side_a_decision||':'||side_b_decision from private.matchup_result_versions where matchup_id=pg_temp.rid(71) order by created_at desc,id desc limit 1),'WIN:LOSS','partial cards compete by returned credits normally');
select is((select jsonb_agg((r->>'attendanceMisses')::integer order by r->>'entryId') from private.standings_snapshots s cross join lateral jsonb_array_elements(s.ordered_rows) r where s.week_id=pg_temp.rid(50) and s.status='FINAL'),'[0,0,1,1]'::jsonb,'only zero-submission regular-season cards add an attendance miss');
create temporary table rolling_receipt_evidence as select id,receipt_hash from private.position_receipts where week_id=pg_temp.rid(50);
select lives_ok($$select api.record_stage1_result(pg_temp.rid(93),'FINAL',10,20,'Corrected official fixture score.','SIMULATION_FIXTURE','rolling-monday-correction')$$,'verified correction appends through the same final-week engine');
select is((select status from private.weekly_score_versions where card_id=pg_temp.rid(82) order by created_at desc,id desc limit 1),'FINAL','corrected partial score remains final');
select ok(not exists(select * from rolling_receipt_evidence except select id,receipt_hash from private.position_receipts),'corrections preserve every accepted receipt');
select throws_ok($$select private.assert_week_review_complete(pg_temp.rid(50))$$,'55000','The score review period must close before downstream playoff or archive publication.','score-review boundary still protects frozen downstream publications');
select function_privs_are('private','reconcile_rolling_week_closures',array['uuid'],'authenticated',array[]::text[],'members cannot invoke a global close operation');
-- One authoritative V1.3 rehearsal carries partial cards, incremental bot batches,
-- missed-week eligibility, playoff no-shows, corrections and exhibitions to archive.
insert into auth.users(id,email) values(pg_temp.rid(9),'rolling-rehearsal-owner@example.test');
insert into private.profiles(id,display_name) values(pg_temp.rid(9),'Rolling owner') on conflict(id) do update set display_name=excluded.display_name;
insert into private.owner_rehearsal_entitlements(user_id,note) values(pg_temp.rid(9),'Disposable rolling full-season proof');
select pg_temp.actor(9);
select lives_ok($$select api.start_owner_rehearsal('rolling-rehearsal-start')$$,'entitled owner starts a fresh V1.3 rehearsal');
select lives_ok($$select api.fill_owner_rehearsal_bots('rolling-rehearsal-fill')$$,'nine deterministic bots use normal membership');
select lives_ok($$select api.advance_owner_rehearsal('FORMATION_READY','rolling-rehearsal-open')$$,'the new-rule rehearsal opens through the shared rules path');
-- Each checkpoint is its own top-level statement, matching the ordinary app
-- request boundary and releasing executor memory between weeks. The old single
-- DO statement retained an entire 18-week rehearsal's executor allocations.
create function pg_temp.advance_rolling_rehearsal_step(p_step integer) returns void language plpgsql as $$
declare checkpoint text; slug text;
begin
 if p_step not between 1 and 30 then raise exception 'Rehearsal exceeded 30 checkpoint advances'; end if;
 checkpoint:=api.get_owner_rehearsal()->>'checkpoint';
 if checkpoint='COMPLETE' then return; end if;
 -- This rollback-only fixture grows a full season in one transaction. Give
 -- the planner current row counts instead of depending on background ANALYZE,
 -- which cannot see this session's uncommitted fixture rows.
 analyze private.season_weeks,private.season_entries,private.weekly_cards,
 private.sports_events,private.slates,private.slate_items,private.market_snapshots,
 private.live_quote_heads,private.position_receipts,private.settlement_versions,
 private.weekly_score_versions,private.matchups,private.matchup_result_versions,
 private.standings_snapshots,private.playoff_publications,private.playoff_round_publications;
 select league.slug into strict slug from private.owner_rehearsals r join private.leagues league on league.id=r.league_id where r.owner_user_id=pg_temp.rid(9) and r.status='ACTIVE';
 if checkpoint='WEEK_2_OPEN' then
  perform api.prepare_owner_rehearsal_quote_review(slug,'rolling-rehearsal-price-review');
 end if;
 if checkpoint like '%_OPEN' then
  perform api.use_owner_rehearsal_sample_card('rolling-rehearsal-sample-'||p_step);
 end if;
 perform api.advance_owner_rehearsal(checkpoint,'rolling-rehearsal-step-'||p_step);
end; $$;
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(1)$$,'authoritative rehearsal checkpoint 1 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(2)$$,'authoritative rehearsal checkpoint 2 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(3)$$,'authoritative rehearsal checkpoint 3 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(4)$$,'authoritative rehearsal checkpoint 4 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(5)$$,'authoritative rehearsal checkpoint 5 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(6)$$,'authoritative rehearsal checkpoint 6 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(7)$$,'authoritative rehearsal checkpoint 7 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(8)$$,'authoritative rehearsal checkpoint 8 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(9)$$,'authoritative rehearsal checkpoint 9 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(10)$$,'authoritative rehearsal checkpoint 10 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(11)$$,'authoritative rehearsal checkpoint 11 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(12)$$,'authoritative rehearsal checkpoint 12 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(13)$$,'authoritative rehearsal checkpoint 13 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(14)$$,'authoritative rehearsal checkpoint 14 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(15)$$,'authoritative rehearsal checkpoint 15 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(16)$$,'authoritative rehearsal checkpoint 16 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(17)$$,'authoritative rehearsal checkpoint 17 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(18)$$,'authoritative rehearsal checkpoint 18 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(19)$$,'authoritative rehearsal checkpoint 19 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(20)$$,'authoritative rehearsal checkpoint 20 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(21)$$,'authoritative rehearsal checkpoint 21 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(22)$$,'authoritative rehearsal checkpoint 22 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(23)$$,'authoritative rehearsal checkpoint 23 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(24)$$,'authoritative rehearsal checkpoint 24 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(25)$$,'authoritative rehearsal checkpoint 25 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(26)$$,'authoritative rehearsal checkpoint 26 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(27)$$,'authoritative rehearsal checkpoint 27 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(28)$$,'authoritative rehearsal checkpoint 28 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(29)$$,'authoritative rehearsal checkpoint 29 completes within the 30-step bound');
select lives_ok($$select pg_temp.advance_rolling_rehearsal_step(30)$$,'authoritative rehearsal checkpoint 30 completes within the 30-step bound');
select is(api.get_owner_rehearsal()->>'checkpoint','COMPLETE','the full-season rehearsal reaches its stored completion checkpoint');
select is((select count(*) from private.season_weeks w join private.owner_rehearsals r on r.season_id=w.season_id where r.owner_user_id=pg_temp.rid(9) and w.state='FINAL' and private.is_rolling_week(w.id)),18::bigint,'every rehearsal week retains V1.3 and final results');
select is((select count(*) from private.weekly_cards c join private.owner_rehearsals r on r.season_id=c.season_id where r.owner_user_id=pg_temp.rid(9) and c.compliance='COMPLIANT'),176::bigint,'all 176 participating partial cards are compliant');
select is((select count(*) from private.weekly_cards c join private.owner_rehearsals r on r.season_id=c.season_id where r.owner_user_id=pg_temp.rid(9) and c.compliance='INCOMPLETE'),4::bigint,'only the four deliberate zero-bet lessons are incomplete');
select ok((select count(*) from private.position_receipts p join private.owner_rehearsals r on r.league_id=p.league_id where r.owner_user_id=pg_temp.rid(9))>176,'bots submit multiple independent batches through the real receipt authority');
select ok(not exists(select c.id from private.weekly_cards c join private.owner_rehearsals r on r.season_id=c.season_id join private.position_receipts p on p.card_id=c.id where r.owner_user_id=pg_temp.rid(9) group by c.id having sum(p.stake_credits)>=1000),'the full season proves partial allocation rather than accidental full-card compatibility');
select is((select count(*) from private.standings_snapshots s join private.owner_rehearsals r on r.season_id=s.season_id where r.owner_user_id=pg_temp.rid(9) and s.through_week>14),0::bigint,'postseason and Week 18 do not add regular-season attendance or standings');
select ok(exists(select 1 from private.standings_snapshots s join private.owner_rehearsals r on r.season_id=s.season_id cross join lateral jsonb_array_elements(s.ordered_rows) row where r.owner_user_id=pg_temp.rid(9) and s.through_week=14 and (row->>'attendanceMisses')::integer=3),'the regular-season miss threshold still governs qualification');
select is((select count(*) from private.season_archive_versions a join private.owner_rehearsals r on r.season_id=a.season_id where r.owner_user_id=pg_temp.rid(9)),1::bigint,'one complete archive follows champion finality and Week 18');
select is((select count(*) from private.matchup_result_versions result join private.season_weeks week on week.id=result.week_id join private.owner_rehearsals rehearsal on rehearsal.season_id=week.season_id where rehearsal.owner_user_id=pg_temp.rid(9) and week.nfl_week=4 and result.status='FINAL' and result.side_a_decision='TIE' and result.side_b_decision='TIE'),5::bigint,'partially allocated cards can tie normally in every Week 4 matchup');
select ok(not exists(select 1 from private.weekly_cards absent join private.season_weeks week15 on week15.id=absent.week_id and week15.nfl_week=15 join private.owner_rehearsals rehearsal on rehearsal.season_id=week15.season_id join private.season_weeks week16 on week16.season_id=week15.season_id and week16.nfl_week=16 join private.matchups semifinal on semifinal.week_id=week16.id and semifinal.postseason_role='CHAMPIONSHIP' where rehearsal.owner_user_id=pg_temp.rid(9) and absent.compliance='INCOMPLETE' and absent.entry_id in(semifinal.side_a_entry_id,semifinal.side_b_entry_id)),'zero-bet competitive playoff participant is eliminated while partial participants advance');
select is((select count(distinct entry.id) from private.season_entries entry join private.owner_rehearsals rehearsal on rehearsal.season_id=entry.season_id join private.playoff_publications publication on publication.season_id=entry.season_id and publication.publication_stage='QUALIFICATION' join private.season_weeks week16 on week16.season_id=entry.season_id and week16.nfl_week=16 join private.matchups semifinal on semifinal.week_id=week16.id and semifinal.postseason_role='CHAMPIONSHIP' and entry.id in(semifinal.side_a_entry_id,semifinal.side_b_entry_id) where rehearsal.owner_user_id=pg_temp.rid(9) and private.playoff_qualification_seed(publication.id,entry.id)<=2),2::bigint,'both bye recipients advance independently of their exhibition results');
select ok(exists(select 1 from private.settlement_versions settlement join private.position_receipts receipt on receipt.id=settlement.receipt_id join private.season_weeks week on week.id=receipt.week_id join private.owner_rehearsals rehearsal on rehearsal.season_id=week.season_id where rehearsal.owner_user_id=pg_temp.rid(9) and week.nfl_week=8 and settlement.supersedes_id is not null),'partial-card correction uses the existing append-only settlement chain');
select * from finish();
rollback;
