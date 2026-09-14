begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select is(api.claim_odds_entitlement_probe()->>'status','IDLE','unconfigured free account never invokes the entitlement probe');
select api.configure_player_prop_odds_budget(jsonb_build_object('entitlementCredits',20000,'remaining',19900,'used',100,'cycleId','verified-current-cycle',
 'observedAt',clock_timestamp(),'resetPolicy','FIRST_OF_MONTH_CONFIRMED_HEADERS',
 'nextQuotaResetAt',(date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month 1 day') at time zone 'UTC'));
select is(api.claim_odds_entitlement_probe()->>'status','IDLE','fresh verified configuration defers the first probe');
update private.odds_refresh_policy set next_entitlement_probe_at='-infinity',next_request_at='-infinity',daily_credits=14,monthly_credits=200;
create temporary table entitlement_probe_context(probe_id uuid);
insert into entitlement_probe_context values((api.claim_odds_entitlement_probe()->>'probeId')::uuid);
select ok(probe_id is not null,'one due free probe claims a lease') from entitlement_probe_context;
select is(api.claim_odds_entitlement_probe()->>'status','IDLE','duplicate worker cannot claim an in-flight free probe');
select throws_ok($$select private.reserve_provider_credits(2)$$,'P0001','QUOTE_REFRESH_COOLDOWN','paid score request cannot overlap isolated entitlement observation');
select is(api.complete_odds_entitlement_probe(probe_id,'{"remaining":19950,"used":50,"last":0}')->>'status','SUCCEEDED','consistent uncharged endpoint headers reconcile safely') from entitlement_probe_context;
select is((select requests_remaining from private.odds_refresh_policy),19900,'counter decrease outside verified reset boundary cannot raise balance');
select is((select daily_credits from private.odds_refresh_policy),14,'free probe consumes no odds credits');
select is(api.claim_odds_entitlement_probe()->>'status','IDLE','completed probe remains bounded to at most once/hour');
update private.odds_refresh_policy set next_entitlement_probe_at='-infinity',next_request_at='-infinity';
update entitlement_probe_context set probe_id=(api.claim_odds_entitlement_probe()->>'probeId')::uuid;
select is(api.complete_odds_entitlement_probe(probe_id,'{"remaining":19950,"used":49,"last":0}')->>'status','FAILED','inconsistent entitlement headers fail closed') from entitlement_probe_context;
select is((select requests_remaining from private.odds_refresh_policy),19900,'failed probe cannot invent available quota');
update private.odds_refresh_policy set next_quota_reset_at=clock_timestamp()-interval '1 minute',next_entitlement_probe_at='-infinity',next_request_at='-infinity';
update entitlement_probe_context set probe_id=(api.claim_odds_entitlement_probe()->>'probeId')::uuid;
select is(api.complete_odds_entitlement_probe(probe_id,'{"remaining":19998,"used":2,"last":0}')->>'cycleRenewed','true','fresh matching headers after verified safe boundary confirm the new quota cycle') from entitlement_probe_context;
select is((select requests_remaining from private.odds_refresh_policy),19998,'confirmed provider renewal restores provider allowance');
select is((select monthly_credits from private.odds_refresh_policy),200,'provider renewal never resets app monthly usage');
select ok((select next_quota_reset_at>clock_timestamp() and extract(day from next_quota_reset_at at time zone 'UTC')=2 from private.odds_refresh_policy),'subsequent probe waits for conservative next monthly boundary');
-- Boundary proof is independent of old observed high water: an account may
-- have more early-new-month use than its last captured old-month header.
update private.odds_refresh_policy set next_quota_reset_at=clock_timestamp()-interval '1 minute',provider_used_high_water=1,
 next_entitlement_probe_at='-infinity',next_request_at='-infinity';
update entitlement_probe_context set probe_id=(api.claim_odds_entitlement_probe()->>'probeId')::uuid;
select is(api.complete_odds_entitlement_probe(probe_id,'{"remaining":19900,"used":100,"last":0}')->>'cycleRenewed','true','confirmed monthly boundary cannot stall on higher new-month usage') from entitlement_probe_context;
update private.odds_refresh_policy set next_entitlement_probe_at='-infinity',next_request_at='-infinity';
update entitlement_probe_context set probe_id=(api.claim_odds_entitlement_probe()->>'probeId')::uuid;
update private.odds_refresh_policy set provider_cycle_verified_at=clock_timestamp()+interval '1 millisecond';
select is(api.complete_odds_entitlement_probe(probe_id,'{"remaining":100,"used":19900,"last":0}')->>'status','IGNORED','response begun before newly verified cycle is ignored') from entitlement_probe_context;
select is((select requests_remaining from private.odds_refresh_policy),19900,'old response cannot poison newly confirmed cycle allowance');
update private.odds_refresh_policy set next_entitlement_probe_at='-infinity',next_request_at='-infinity';
insert into private.shared_quote_requests(kind,event_ids,families,state,attempted_at,expires_at,reserved_cost)
 values('PROPS',array['fixture-only'],array['player_pass_yds'],'RUNNING',clock_timestamp(),clock_timestamp()+interval '20 seconds',1);
select is(api.claim_odds_entitlement_probe()->>'status','IDLE','probe waits for every paid quote request to finish');
select ok(not has_function_privilege('authenticated','api.claim_odds_entitlement_probe()','EXECUTE'),'member cannot invoke operational quota probe');
select * from finish();
rollback;
