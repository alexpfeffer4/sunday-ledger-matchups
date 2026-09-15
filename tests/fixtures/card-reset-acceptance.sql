-- Disposable native PostgreSQL fixture only. Callers enforce a loopback DB.
-- Seed a real LIVE Week 2 before any kickoff, then accept via the public RPC.
-- No provider, email, hosted connection, trigger bypass, or receipt mutation.
create function pg_temp.card_reset_fixture(p_slug text,p_stake integer default 1000,p_owner_id uuid default null,p_intent_id uuid default null,p_nfl_week integer default 2,p_nfl_year integer default 2026)
returns jsonb language plpgsql as $$
<<card_reset_fixture>>
declare
 owner_id uuid:=coalesce(p_owner_id,gen_random_uuid()); league_id uuid:=gen_random_uuid(); season_id uuid:=gen_random_uuid();
 week_id uuid:=gen_random_uuid(); snapshot_id uuid:=gen_random_uuid(); slate_id uuid:=gen_random_uuid();
 publication_id uuid:=gen_random_uuid(); card_id uuid:=gen_random_uuid();
 members uuid[]:=array[owner_id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 entries uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 events uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 markets jsonb:='[]'; quote_id uuid; payload_hash text; observation timestamptz:=clock_timestamp();
 prior jsonb; n integer; response jsonb; review_id uuid; accepted_positions jsonb; operation_key text; request_id uuid;
begin
 select jsonb_agg(to_jsonb(a)) into prior from private.authoritative_season_rulesets a;
 update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
  canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
 for n in 1..4 loop
  insert into auth.users(id,email) values(members[n],members[n]::text||'@reset-acceptance.test') on conflict(id) do nothing;
  insert into private.profiles(id,display_name) values(members[n],'Reset fixture member '||n) on conflict(id) do nothing;
 end loop;
 insert into private.leagues(id,name,slug,created_by) values(league_id,'Reset acceptance',p_slug,owner_id);
 for n in 1..4 loop
  insert into private.league_memberships(league_id,user_id,role)
   values(league_id,members[n],case when n=1 then 'COMMISSIONER' else 'MEMBER' end);
 end loop;
 insert into private.season_ruleset_snapshots(id,ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,frozen_at)
  select snapshot_id,a.ruleset_id,a.ruleset_version,a.product_bible_id,a.product_bible_version,a.mode,a.canonical_json,a.sha256_hash,observation-interval '1 hour'
  from private.authoritative_season_rulesets a where a.mode='LIVE';
 insert into private.seasons(id,league_id,ruleset_snapshot_id,mode,nfl_year,lifecycle,roster_seed,schedule_seed,roster_locked_at)
  values(season_id,league_id,snapshot_id,'LIVE',p_nfl_year,'REGULAR',repeat('a',64),repeat('b',64),observation-interval '1 hour');
 for n in 1..4 loop
  insert into private.season_entries(id,season_id,league_id,user_id,standing_tiebreak)
   values(entries[n],season_id,league_id,members[n],lpad(n::text,64,'0'));
 end loop;
 insert into private.season_weeks(id,season_id,league_id,nfl_week,state,opens_at,common_lock_at)
  values(week_id,season_id,league_id,p_nfl_week,'OPEN',observation-interval '1 hour',observation+interval '55 minutes');
 insert into private.schedule_publications(id,season_id,league_id,version,algorithm_version,seed,ordered_entry_ids,output_hash,created_by)
  values(publication_id,season_id,league_id,1,'reset-fixture','reset-fixture',entries,repeat('c',64),owner_id);
 for n in 1..2 loop
  insert into private.matchups(week_id,season_id,league_id,schedule_publication_id,side_a_entry_id,side_b_entry_id,display_order)
   values(week_id,season_id,league_id,publication_id,entries[n*2-1],entries[n*2],n);
 end loop;
 for n in 1..4 loop
  insert into private.weekly_cards(id,week_id,season_id,league_id,entry_id,owner_user_id,granted_at)
   values(case when n=1 then card_id else gen_random_uuid() end,week_id,season_id,league_id,entries[n],members[n],observation-interval '1 hour');
 end loop;
 for n in 1..5 loop
  insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
   values(events[n],week_id,season_id,league_id,p_slug||'-game-'||n,'Away '||n,'Home '||n,observation+n*interval '1 hour');
 end loop;
 insert into private.slates(id,week_id,season_id,league_id,version,fixture_id,common_lock_at)
  values(slate_id,week_id,season_id,league_id,1,p_slug,observation+interval '55 minutes');
 for n in 1..5 loop
  quote_id:=gen_random_uuid(); payload_hash:=encode(extensions.digest(quote_id::text,'sha256'),'hex');
  insert into private.market_snapshots(id,event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,american_odds,quality_status,observed_at,payload_hash)
   values(quote_id,events[n],week_id,league_id,'draftkings','MONEYLINE','HOME','Home '||n||' to win',100,'HEALTHY',observation,payload_hash);
  insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
   values(slate_id,events[n],quote_id,week_id,league_id);
  markets:=markets||jsonb_build_array(jsonb_build_object('marketSnapshotId',quote_id,'payloadHash',payload_hash,'stakeCredits',p_stake/4));
 end loop;
 -- Trusted server-side fixture observations establish the same successful
 -- refresh evidence as the adapter. Review and acceptance guards remain real.
 update private.odds_refresh_policy set enabled=true;
 insert into private.shared_quote_requests(kind,event_ids,families,state,fetched_at)
  values('MAIN',array(select p_slug||'-game-'||i from generate_series(1,5) i),array['MAIN'],'SUCCEEDED',clock_timestamp()) returning id into request_id;
 update private.live_quote_heads h set verified_request_id=request_id where h.week_id=card_reset_fixture.week_id;
 update private.authoritative_season_rulesets a set ruleset_version=p.ruleset_version,product_bible_version=p.product_bible_version,
  canonical_json=p.canonical_json,sha256_hash=p.sha256_hash
  from jsonb_populate_recordset(null::private.authoritative_season_rulesets,prior) p where p.mode=a.mode;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
  values(card_id,owner_id,markets-4,clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()) returning id into review_id;
 accepted_positions:=jsonb_set(markets-4,'{0}',markets->0||jsonb_build_object('reviewId',review_id));
 operation_key:=p_slug||'-accepted';
 if p_intent_id is not null then
  perform api.bind_card_submission_intent(p_slug,p_intent_id,markets-4);
  accepted_positions:=jsonb_set(accepted_positions,'{0}',accepted_positions->0||jsonb_build_object('intentId',p_intent_id));
  operation_key:='intent:'||p_intent_id::text;
 end if;
 response:=api.accept_stage1_card(p_slug,accepted_positions,operation_key);
 return jsonb_build_object('owner',owner_id,'member',members[2],'league',league_id,'season',season_id,'week',week_id,
  'card',card_id,'slug',p_slug,'positions',accepted_positions,'rawPositions',markets-4,'sparePositions',jsonb_build_array(markets->4||jsonb_build_object('stakeCredits',100)),'event',events[1],'originalResponse',response,'operationKey',operation_key,'intentId',p_intent_id,
  'receiptIds',(select jsonb_agg(r.id order by r.id) from private.position_receipts r where r.card_id=card_reset_fixture.card_id),
  'receiptHash',private.card_receipt_fingerprint(card_id,0));
end;
$$;
