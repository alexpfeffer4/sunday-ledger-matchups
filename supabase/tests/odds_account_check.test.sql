begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

update private.odds_refresh_policy set enabled=true,daily_credit_limit=90,monthly_credit_limit=450,
 daily_credits=14,monthly_credits=200,requests_remaining=287,
 next_request_at='-infinity',next_entitlement_probe_at='-infinity';
create temporary table account_policy_before as
 select to_jsonb(p)-array['next_request_at','next_entitlement_probe_at'] as policy from private.odds_refresh_policy p;
create temporary table account_check_context(probe_id uuid,proof jsonb);

select is(api.claim_odds_entitlement_probe()->>'status','IDLE','ordinary reconciliation stays disabled before paid entitlement');
insert into account_check_context(probe_id) values((api.claim_odds_account_probe()->>'probeId')::uuid);
select ok(probe_id is not null,'new account can be checked without first claiming a paid entitlement') from account_check_context;
select is(api.claim_odds_account_probe()->>'status','IDLE','simultaneous account checks share one global lease');
update private.odds_refresh_policy set next_request_at='-infinity';
select throws_ok($$select private.reserve_provider_credits(2)$$,'P0001','QUOTE_REFRESH_COOLDOWN','running account check excludes paid score work even after launch spacing');
select throws_ok($$select private.reserve_selective_quote_credits(1,true)$$,'P0001','QUOTE_REFRESH_COOLDOWN','running account check excludes paid prop quote work');
select throws_ok($$select api.complete_odds_entitlement_probe(probe_id,'{"remaining":20000,"used":0,"last":0}') from account_check_context$$,
 'P0001','ODDS_PROBE_PURPOSE_MISMATCH','ordinary reconciliation cannot turn account proof into allowance');
update account_check_context set proof=api.complete_odds_account_probe(probe_id,'{"remaining":19980,"used":20,"last":0}');
select is(proof->>'status','READY','fresh valid provider headers are recorded') from account_check_context;
select is(proof-'observedAt','{"status":"READY","remaining":19980,"used":20,"last":0}'::jsonb,'account proof contains only normalized quota fields and observed time') from account_check_context;
select ok((proof->>'observedAt')::timestamptz<=clock_timestamp(),'proof time is assigned by the database') from account_check_context;
select is((select to_jsonb(p)-array['next_request_at','next_entitlement_probe_at'] from private.odds_refresh_policy p),
 (select policy from account_policy_before),'account check preserves every cap, flag, balance, cycle, and app usage counter');
select is((select count(*)::integer from private.odds_budget_configuration_evidence),0,'account check cannot configure the paid tier');
select is(api.complete_odds_account_probe(probe_id,'{"remaining":1,"used":19999,"last":0}'),proof,'completion replay preserves the original immutable observation') from account_check_context;
select is(api.claim_odds_account_probe()->>'status','IDLE','account checks are limited to once per hour');

update private.odds_refresh_policy set next_request_at='-infinity',next_entitlement_probe_at='-infinity';
update account_check_context set probe_id=(api.claim_odds_account_probe()->>'probeId')::uuid;
select is(api.complete_odds_account_probe(probe_id,'{"remaining":19980,"used":20,"last":1}')->>'status','UNAVAILABLE','charged observation cannot prove a zero-credit account check') from account_check_context;
update private.odds_refresh_policy set next_request_at='-infinity',next_entitlement_probe_at='-infinity';
update account_check_context set probe_id=(api.claim_odds_account_probe()->>'probeId')::uuid;
select is(api.complete_odds_account_probe(probe_id,'{"remaining":19980,"last":0}')->>'status','UNAVAILABLE','missing quota fields fail closed') from account_check_context;
update private.odds_refresh_policy set next_request_at='-infinity',next_entitlement_probe_at='-infinity';
update account_check_context set probe_id=(api.claim_odds_account_probe()->>'probeId')::uuid;
update private.odds_entitlement_probes set expires_at=clock_timestamp()-interval '1 second' where id=(select probe_id from account_check_context);
select is(api.complete_odds_account_probe(probe_id,'{"remaining":19980,"used":20,"last":0}')->>'status','UNAVAILABLE','expired lease cannot attest account evidence') from account_check_context;

update private.odds_refresh_policy set next_request_at='-infinity',next_entitlement_probe_at='-infinity';
insert into private.shared_quote_requests(kind,event_ids,families,state,attempted_at,expires_at,reserved_cost)
 values('PROPS',array['fixture-only'],array['player_pass_yds'],'RUNNING',clock_timestamp(),clock_timestamp()+interval '20 seconds',1);
select is(api.claim_odds_account_probe()->>'status','IDLE','account check waits for existing paid quote work');
update private.shared_quote_requests set state='FAILED' where state='RUNNING';
insert into private.provider_requests(kind) values('SCORES');
select is(api.claim_odds_account_probe()->>'status','IDLE','account check waits for existing paid score work');
update private.provider_requests set state='FAILED' where state='RUNNING';
update account_check_context set probe_id=(api.claim_odds_account_probe()->>'probeId')::uuid;
select is(api.complete_odds_account_probe(probe_id,'{"remaining":490,"used":10,"last":0}')->>'status','READY','free account can be identified honestly without upgrading its configuration') from account_check_context;
select is((select daily_credit_limit from private.odds_refresh_policy),90,'even successful account checks leave the prepared cap transition separate');

insert into private.odds_entitlement_probes default values;
select throws_ok($$select api.complete_odds_account_probe(id,'{"remaining":20000,"used":0,"last":0}') from private.odds_entitlement_probes where not account_check$$,
 'P0001','ODDS_PROBE_PURPOSE_MISMATCH','account completion cannot consume an ordinary reconciliation lease');
select lives_ok($$select api.configure_player_prop_odds_budget(proof||jsonb_build_object(
 'entitlementCredits',(proof->>'remaining')::integer+(proof->>'used')::integer,
 'cycleId','quota:'||to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),
 'resetPolicy','FIRST_OF_MONTH_CONFIRMED_HEADERS',
 'nextQuotaResetAt',(date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month 1 day') at time zone 'UTC')) from account_check_context$$,
 'separate approved configuration accepts actual newly persisted 20K account evidence');
select is((select jsonb_build_array(daily_credit_limit,monthly_credit_limit,protected_core_daily_credits,protected_core_monthly_credits) from private.odds_refresh_policy),
 '[1000,5000,350,2000]'::jsonb,'verified paid entitlement applies exactly the prepared caps and core reserves');
select is((select jsonb_build_array(daily_credits,monthly_credits,requests_remaining) from private.odds_refresh_policy),
 '[14,200,19980]'::jsonb,'verified new account balance is adopted without resetting existing app consumption');

select ok(not has_function_privilege('anon','api.claim_odds_account_probe()','EXECUTE'),'anonymous callers cannot claim account checks');
select ok(not has_function_privilege('authenticated','api.claim_odds_account_probe()','EXECUTE'),'members cannot claim account checks');
select ok(not has_function_privilege('authenticated','api.complete_odds_account_probe(uuid,jsonb)','EXECUTE'),'members cannot forge account proof');
select ok(has_function_privilege('service_role','api.claim_odds_account_probe()','EXECUTE'),'only the server can claim account checks');
select * from finish();
rollback;
