begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is((select enabled from private.odds_refresh_policy), false, 'activation is opt-in');
select function_privs_are('api','complete_live_quote_refresh',array['uuid','jsonb','integer'],'authenticated',array[]::text[],'members cannot forge provider observations');
select function_privs_are('api','complete_live_quote_refresh',array['uuid','jsonb','integer'],'service_role',array['EXECUTE'],'only provider persistence role can complete a lease');
select function_privs_are('api','claim_live_quote_refresh',array['uuid'],'anon',array[]::text[],'anonymous visitors cannot spend quota');
select function_privs_are('private','store_member_quote_import',array['uuid','uuid','jsonb','text'],'authenticated',array[]::text[],'the reused import helper is private');
select table_privs_are('private','live_card_quote_reviews','authenticated',array[]::text[],'reviewed picks cannot be read directly');

insert into auth.users(id,email) select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'quote-'||n||'@example.test' from generate_series(1,5) n;
insert into private.profiles(id,display_name) select id,'Quote Member '||right(id::text,1) from auth.users where id::text like '71000000-%';
create function pg_temp.as_member(n integer) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','71000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true);
end;
$$;
select pg_temp.as_member(1);
create temporary table quote_context as select league_id,season_id from api.create_league(
  p_name=>'Quote Contract',p_slug=>'quote-contract',p_mode=>'LIVE',p_nfl_year=>2026);
alter table quote_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table quote_context add column source_at timestamptz default clock_timestamp()-interval '5 minutes';
alter table quote_context add column lease_id uuid;
alter table quote_context add column review jsonb;
alter table quote_context add column positions jsonb;
alter table quote_context add column accepted jsonb;
select cmp_ok((select private.card_confirmation_time(season_id) from quote_context),'>',transaction_timestamp(),'Live confirmation uses wall time rather than transaction-start time');
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from quote_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from quote_context q,generate_series(2,4) n;
create function pg_temp.quote_import(price integer default 140,source_shift interval default interval '0')
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_build_array(
  jsonb_build_object('source','THE_ODDS_API','externalEventId','quote-game','sportKey','americanfootball_nfl',
   'awayTeam','Buffalo Bills','homeTeam','New York Jets','scheduledStartAt',q.kickoff,'markets',(
    select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType',market,'outcomeKey',side,
      'proposition',proposition,'lineMilli',line,'americanOdds',odds,'observedAt',q.source_at+source_shift))
    from (values ('MONEYLINE','AWAY','Buffalo Bills to win',null::integer,-160),
      ('MONEYLINE','HOME','New York Jets to win',null::integer,price),
      ('SPREAD','AWAY','Buffalo Bills -3.5',-3500,-110),('SPREAD','HOME','New York Jets +3.5',3500,-110),
      ('TOTAL','OVER','Over 44.5',44500,-110),('TOTAL','UNDER','Under 44.5',44500,-110)) m(market,side,proposition,line,odds)
   )))) from quote_context q;
$$;
select api.publish_live_week_slate(q.league_id,
 (api.store_live_odds_import(q.league_id,pg_temp.quote_import(),'initial-quote-import')->>'importId')::uuid,
 array['quote-game'],'initial-quote-publication') from quote_context q;
update private.odds_refresh_policy set enabled=true;
update quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select throws_ok($$select api.claim_live_quote_refresh(league_id) from quote_context$$,'55000','QUOTE_REFRESH_BUSY','overlapping requests share one lease');
select is((select daily_credits from private.odds_refresh_policy),3,'one request reserves three credits');
select lives_ok($$select api.complete_live_quote_refresh(lease_id,pg_temp.quote_import(),497) from quote_context$$,'a successful fetch retains an aged source time');
select lives_ok($$select api.lock_live_roster_and_open_week(league_id,'quote-roster-lock') from quote_context$$,'aged unchanged terms no longer block opening the roster');
select is((select api.claim_live_quote_refresh(league_id)->>'status' from quote_context),'CACHED','a recent fetch is shared');
select is((select daily_credits from private.odds_refresh_policy),3,'cached reviews consume no quota');

create function pg_temp.current_positions(review_id text default null) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('marketSnapshotId',s.id,'payloadHash',s.payload_hash,'stakeCredits',1000)
   ||case when review_id is null then '{}'::jsonb else jsonb_build_object('reviewId',review_id) end)
 from private.live_quote_heads h join private.market_snapshots s on s.id=h.market_snapshot_id
 where h.league_id=(select league_id from quote_context) and h.market_type='MONEYLINE' and h.outcome_key='HOME';
$$;
select pg_temp.as_member(2);
select throws_ok($$select api.accept_stage1_card('quote-contract',pg_temp.current_positions(),'missing-review-token')$$,'P0001','QUOTE_REVIEW_REQUIRED','direct acceptance cannot bypass review');
update quote_context set review=api.review_live_card_quotes('quote-contract',pg_temp.current_positions());
update quote_context set positions=pg_temp.current_positions(review->>'reviewId');
select pg_temp.as_member(3);
select throws_ok($$select api.accept_stage1_card('quote-contract',positions,'stolen-review-token') from quote_context$$,'P0001','QUOTE_REVIEW_REQUIRED','another member cannot reuse a review');
select pg_temp.as_member(2);
select throws_ok($$select api.accept_stage1_card('quote-contract',jsonb_set(positions,'{0,stakeCredits}','999'),'modified-review-stake') from quote_context$$,'P0001','QUOTE_REVIEW_REQUIRED','review is bound to the entire card');
select lives_ok($$update quote_context set accepted=api.accept_stage1_card('quote-contract',positions,'quote-accepted-once')$$,'member seals with an older provider timestamp and verified current fetch');
create temporary table original_quote_receipts as select to_jsonb(r) as data from private.position_receipts r where league_id=(select league_id from quote_context);
select ok((select bool_and(r.quote_observed_at<clock_timestamp()-interval '2 minutes') from private.position_receipts r where league_id=(select league_id from quote_context)),'receipt preserves the original provider timestamp');
select is((select count(*) from private.card_quote_review_acceptances),1::bigint,'review evidence is linked without rewriting the receipt');
select is((select api.accept_stage1_card('quote-contract',positions,'quote-accepted-once')->>'replayed' from quote_context),'true','retry replays the same acceptance');
select is((select count(*) from private.position_receipts where league_id=(select league_id from quote_context)),1::bigint,'no duplicate receipt');
select pg_temp.as_member(5);
select throws_ok($$select api.claim_live_quote_refresh(league_id) from quote_context$$,'42501','League membership required.','outsiders cannot trigger imports');
select pg_temp.as_member(3);
update quote_context set review=api.review_live_card_quotes('quote-contract',pg_temp.current_positions());
update quote_context set positions=pg_temp.current_positions(review->>'reviewId');
-- Operational fixture time aging avoids a 60-second test sleep; production has no such RPC.
update private.live_quote_refreshes set attempted_at=clock_timestamp()-interval '2 minutes',fetched_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
update quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select lives_ok($$select api.complete_live_quote_refresh(lease_id,pg_temp.quote_import(130),494) from quote_context$$,'a changed price creates a new immutable snapshot');
select throws_ok($$select api.accept_stage1_card('quote-contract',positions,'unreviewed-price-change') from quote_context$$,'P0001','QUOTE_CHANGED','changed terms cannot seal under an old review');
select is((select jsonb_agg(to_jsonb(r)) from private.position_receipts r where league_id=(select league_id from quote_context)),(select jsonb_agg(data) from original_quote_receipts),'refresh leaves every original receipt byte-for-byte unchanged');
update quote_context set review=api.review_live_card_quotes('quote-contract',pg_temp.current_positions());
update quote_context set positions=pg_temp.current_positions(review->>'reviewId');
-- Insert an already-expired review fixture; immutable real review rows are untouched.
insert into private.live_card_quote_reviews(id,card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
 select '79000000-0000-4000-8000-000000000001',card_id,actor_user_id,positions,clock_timestamp()-interval '40 seconds',clock_timestamp()-interval '10 seconds',fetched_at
 from private.live_card_quote_reviews where id=(select (review->>'reviewId')::uuid from quote_context);
select throws_ok($$select api.accept_stage1_card('quote-contract',pg_temp.current_positions('79000000-0000-4000-8000-000000000001'),'expired-confirmation')$$,'P0001','QUOTE_REVIEW_EXPIRED','the 30-second review window is authoritative');

update private.live_quote_refreshes set attempted_at=clock_timestamp()-interval '2 minutes',fetched_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
update quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select throws_ok($$select api.complete_live_quote_refresh(lease_id,pg_temp.quote_import(130,interval '-20 minutes'),491) from quote_context$$,'P0001','QUOTE_SOURCE_STALE','a new fetch cannot launder genuinely stale provider data');
select lives_ok($$select api.complete_live_quote_refresh(lease_id,null,491) from quote_context$$,'failed provider call is recorded without a partial import');
select throws_ok($$select api.claim_live_quote_refresh(league_id) from quote_context$$,'55000','QUOTE_REFRESH_COOLDOWN','provider errors have a bounded retry cooldown');
update private.live_quote_refreshes set attempted_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set daily_credit_limit=daily_credits,next_request_at='-infinity';
select throws_ok($$select api.claim_live_quote_refresh(league_id) from quote_context$$,'55000','QUOTE_REFRESH_BUDGET','daily provider quota cannot be exceeded');
update private.odds_refresh_policy set daily_credit_limit=300,requests_remaining=30;
select throws_ok($$select api.claim_live_quote_refresh(league_id) from quote_context$$,'55000','QUOTE_REFRESH_BUDGET','provider remaining-credit reserve is enforced');

-- A direct legacy commissioner refresh cannot inherit a different quote's verification.
select pg_temp.as_member(1);
select lives_ok($$select api.refresh_live_week_quotes(q.league_id,
 (api.store_live_odds_import(q.league_id,pg_temp.quote_import(125),'legacy-quote-store')->>'importId')::uuid,
 'legacy-quote-heads') from quote_context q$$,'legacy commissioner refresh remains available');
select pg_temp.as_member(3);
select throws_ok($$select api.review_live_card_quotes('quote-contract',pg_temp.current_positions())$$,'P0001','QUOTE_SOURCE_STALE','changed legacy heads cannot inherit a prior verified fetch');

-- Deadline crossing is asserted against the shared acceptance engine clock.
-- A test-only function replacement moves time; no production clock or frozen slate changes.
create or replace function private.card_confirmation_time(p_season_id uuid) returns timestamptz language sql volatile set search_path='' as $$
 select common_lock_at from private.season_weeks where season_id=p_season_id order by nfl_week desc limit 1;
$$;
select throws_ok($$select api.accept_stage1_card('quote-contract',positions,'confirmation-at-lock') from quote_context$$,'55000','The current card is not open.','confirmation crossing lock accepts nothing');
select is((select count(*) from private.position_receipts where owner_user_id='71000000-0000-4000-8000-000000000003'),0::bigint,'all failed confirmations created no partial receipts');
select pg_temp.as_member(2);
select is((select api.accept_stage1_card('quote-contract',jsonb_build_array(jsonb_build_object('marketSnapshotId',data->>'market_snapshot_id','payloadHash',(select payload_hash from private.market_snapshots where id=(data->>'market_snapshot_id')::uuid),'stakeCredits',1000,'reviewId',(select review_id from private.card_quote_review_acceptances where card_id=(data->>'card_id')::uuid))),'quote-accepted-once')->>'replayed' from original_quote_receipts),'true','successful acceptance replays even after lock');
select * from finish();
rollback;
