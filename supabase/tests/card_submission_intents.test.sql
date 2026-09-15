begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) select ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'rolling-quote-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select id,'Rolling Quote Member '||right(id::text,1) from auth.users where id::text like 'a1000000-%';
create function pg_temp.as_rolling_member(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','a1000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true); end; $$;
select pg_temp.as_rolling_member(1);
-- Create the draft under V1.2 before activating V1.3: this is a real rollout case.
create temporary table rolling_quote_context as select league_id,season_id from api.create_league(
 p_name=>'Rolling Quotes',p_slug=>'rolling-quotes',p_mode=>'LIVE',p_nfl_year=>2026);
alter table rolling_quote_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table rolling_quote_context add column lease_id uuid;
alter table rolling_quote_context add column review jsonb;
alter table rolling_quote_context add column positions jsonb;
alter table rolling_quote_context add column first_response jsonb;
alter table rolling_quote_context add column first_week uuid;
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from rolling_quote_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from rolling_quote_context q,generate_series(2,4) n;
create function pg_temp.rolling_quote_import(p_only_late boolean default false,p_price integer default 140)
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_agg(
 jsonb_build_object('source','THE_ODDS_API','externalEventId','rolling-game-'||n,'sportKey','americanfootball_nfl',
 'awayTeam','Away '||n,'homeTeam','Home '||n,'scheduledStartAt',q.kickoff+(n-1)*interval '26 hours','markets',(
 select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType',market,'outcomeKey',side,
 'proposition',proposition,'lineMilli',line,'americanOdds',odds,'observedAt',clock_timestamp()-interval '5 minutes'))
 from (values ('MONEYLINE','AWAY','Away to win',null::integer,-160),('MONEYLINE','HOME','Home to win',null::integer,p_price),
 ('SPREAD','AWAY','Away -3.5',-3500,-110),('SPREAD','HOME','Home +3.5',3500,-110),
 ('TOTAL','OVER','Over44.5',44500,-110),('TOTAL','UNDER','Under44.5',44500,-110)) m(market,side,proposition,line,odds)
 )) order by n)) from rolling_quote_context q,generate_series(1,2) n where not p_only_late or n=2;
$$;
select api.publish_live_week_slate(q.league_id,
 (api.store_live_odds_import(q.league_id,pg_temp.rolling_quote_import(),'rolling-initial-import')->>'importId')::uuid,
 array['rolling-game-1','rolling-game-2'],'rolling-initial-publish') from rolling_quote_context q;
update rolling_quote_context set first_week=(select id from private.season_weeks where season_id=rolling_quote_context.season_id);
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',canonical_json=p.canonical_json,
 sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
update private.odds_refresh_policy set enabled=true,requests_remaining=500;
update rolling_quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select lives_ok($$select api.complete_live_quote_refresh(lease_id,pg_temp.rolling_quote_import(),497) from rolling_quote_context$$,'initial freshness acquisition remains available on the old draft');
select lives_ok($$select api.lock_live_roster_and_open_week(league_id,'rolling-lock-open') from rolling_quote_context$$,'oldV1.2 draft opens successfully afterV1.3 activation');
select ok(private.is_rolling_week(first_week),'opened week adoptsV1.3 while original draft season snapshot is retained') from rolling_quote_context;
select is((select r.ruleset_version from private.seasons s join private.season_ruleset_snapshots r on r.id=s.ruleset_snapshot_id where s.id=c.season_id),'1.2','activation leaves original season snapshot intact') from rolling_quote_context c;
create function pg_temp.rolling_live_positions(p_event integer,p_stake integer,p_review text default null) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('marketSnapshotId',s.id,'payloadHash',s.payload_hash,'stakeCredits',p_stake)
 ||case when p_review is null then '{}'::jsonb else jsonb_build_object('reviewId',p_review) end)
 from private.live_quote_heads h join private.market_snapshots s on s.id=h.market_snapshot_id join private.sports_events e on e.id=h.event_id
 where h.week_id=(select first_week from rolling_quote_context) and e.fixture_event_key='rolling-game-'||p_event and h.market_type='MONEYLINE' and h.outcome_key='HOME';
$$;

select pg_temp.as_rolling_member(2);
update rolling_quote_context set positions=pg_temp.rolling_live_positions(1,300);
select lives_ok($$select api.bind_card_submission_intent('rolling-quotes','b0000000-0000-4000-8000-000000000001',positions) from rolling_quote_context$$,'explicit intent binds trusted economics before provider work');
update rolling_quote_context set review=api.review_live_card_quotes('rolling-quotes',positions);
with expired as (
 insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
 select card_id,actor_user_id,positions,clock_timestamp()-interval '35 seconds',clock_timestamp()-interval '5 seconds',fetched_at
 from private.live_card_quote_reviews where id=(select (review->>'reviewId')::uuid from rolling_quote_context)
 returning id
) update rolling_quote_context set review=jsonb_set(review,'{reviewId}',to_jsonb(expired.id::text)) from expired;
select throws_ok($$select api.accept_stage1_card('rolling-quotes',jsonb_set(positions,'{0}',(positions->0)||jsonb_build_object('intentId','b0000000-0000-4000-8000-000000000001','reviewId',review->>'reviewId')),'intent:b0000000-0000-4000-8000-000000000001') from rolling_quote_context$$,'P0001','QUOTE_REVIEW_EXPIRED','expired proof cannot accept before renewal');
select is((select count(*) from private.position_receipts),0::bigint,'expired proof spends nothing');
update private.live_quote_refreshes set attempted_at=clock_timestamp()-interval '2 minutes',fetched_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
update rolling_quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select api.complete_live_quote_refresh(lease_id,pg_temp.rolling_quote_import(),494) from rolling_quote_context;
select isnt(pg_temp.rolling_live_positions(1,300)->0->>'marketSnapshotId',positions->0->>'marketSnapshotId','identical economics are independently imported under a new snapshot identity') from rolling_quote_context;
update rolling_quote_context set review=api.review_live_card_quotes('rolling-quotes',positions);
select is((api.revalidate_card_submission_intent('b0000000-0000-4000-8000-000000000001',(review->>'reviewId')::uuid)->>'status'),'UNCHANGED','replacement proof supports identical confirmed economics') from rolling_quote_context;
select isnt(api.revalidate_card_submission_intent('b0000000-0000-4000-8000-000000000001',(review->>'reviewId')::uuid)#>>'{positions,0,marketSnapshotId}',positions->0->>'marketSnapshotId','renewal replaces evidence identity without replacing confirmed intent') from rolling_quote_context;
select lives_ok($$update rolling_quote_context set first_response=api.accept_stage1_card('rolling-quotes',api.revalidate_card_submission_intent('b0000000-0000-4000-8000-000000000001',(review->>'reviewId')::uuid)->'positions','intent:b0000000-0000-4000-8000-000000000001')$$,'same explicit intent accepts with new proof');
select ok((api.bind_card_submission_intent('rolling-quotes','b0000000-0000-4000-8000-000000000001',positions)->>'committed')::boolean,'lost response recovers original committed batch') from rolling_quote_context;
select ok((api.bind_card_submission_intent('rolling-quotes','b0000000-0000-4000-8000-000000000001',pg_temp.rolling_live_positions(1,300))->>'committed')::boolean,'committed replay also accepts a renewed snapshot with identical economics');
select is((select count(*) from private.position_receipts),1::bigint,'recovery never inserts another receipt');
select throws_ok($$select api.bind_card_submission_intent('rolling-quotes','b0000000-0000-4000-8000-000000000001',jsonb_set(positions,'{0,stakeCredits}','301')) from rolling_quote_context$$,'22000','Idempotency key was reused with a different request.','changed stake cannot reuse an intent');
create temporary table saved_intent_receipts as select to_jsonb(r) receipt from private.position_receipts r;
update rolling_quote_context set positions=pg_temp.rolling_live_positions(2,300);
select api.bind_card_submission_intent('rolling-quotes','b0000000-0000-4000-8000-000000000002',positions) from rolling_quote_context;
update private.live_quote_refreshes set attempted_at=clock_timestamp()-interval '2 minutes',fetched_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
update rolling_quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select api.complete_live_quote_refresh(lease_id,pg_temp.rolling_quote_import(false,160),491) from rolling_quote_context;
update rolling_quote_context set review=api.review_live_card_quotes('rolling-quotes',positions);
select is(api.revalidate_card_submission_intent('b0000000-0000-4000-8000-000000000002',(review->>'reviewId')::uuid)->>'status','CHANGED','even favorable price changes require new consent') from rolling_quote_context;
select is((api.revalidate_card_submission_intent('b0000000-0000-4000-8000-000000000002',(review->>'reviewId')::uuid)#>>'{changes,0,before,americanOdds}')::integer,140,'difference retains the exact confirmed price') from rolling_quote_context;
select is((api.revalidate_card_submission_intent('b0000000-0000-4000-8000-000000000002',(review->>'reviewId')::uuid)#>>'{changes,0,after,americanOdds}')::integer,160,'difference shows the exact new price') from rolling_quote_context;
select is((select count(*) from private.position_receipts),1::bigint,'changed proof cannot silently submit');
select is((select to_jsonb(r) from private.position_receipts r where r.id=(receipt->>'id')::uuid),receipt,'prior receipt bytes and hash survive revalidation') from saved_intent_receipts;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select throws_ok($$select api.bind_card_submission_intent('rolling-quotes','b0000000-0000-4000-8000-000000000001',pg_temp.rolling_live_positions(1,300))$$,'42501','League membership required.','nonmember access is rejected before replay');
select * from finish();
rollback;
