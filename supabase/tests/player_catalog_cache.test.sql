begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is(api.claim_player_catalog_job()->>'status','DISABLED','catalog jobs default to disabled');
select is(api.claim_player_catalog_source('GAMES:2026')->>'status','DISABLED','catalog source acquisition defaults to disabled');
select ok(not has_function_privilege('authenticated','api.claim_player_catalog_job(uuid)','execute'),'members cannot acquire service catalog leases');
select ok(not has_function_privilege('authenticated','api.complete_player_catalog_source(text,uuid,jsonb)','execute'),'members cannot supply trusted catalog source payloads');
select ok(not has_table_privilege('authenticated','private.player_catalog_sources','select'),'raw source cache is inaccessible to members');
select throws_ok($$select api.reserve_player_metadata_request()$$,'55000','Statistics metadata requests unavailable.','metadata requests remain off until acquisition is explicitly enabled');

update private.player_result_policy set metadata_enabled=true,processing_enabled=false,
 provider_remaining=100,provider_observed_at=clock_timestamp(),provider_window_date=(clock_timestamp() at time zone 'UTC')::date,
 blocked_until=null;
select is(api.claim_player_catalog_job()->>'status','IDLE','enabling acquisition alone creates no implicit league jobs');
select is(api.claim_player_result_jobs()->>'status','DISABLED','catalog acquisition does not enable accepted-result processing');
select throws_ok($$select api.claim_player_catalog_source('ARBITRARY:https://example.test')$$,'22023','Invalid catalog source.','service cache keys cannot supply arbitrary network targets');
create temporary table catalog_test_context(source_lease uuid,second_lease uuid,metadata_request uuid);
insert into catalog_test_context(source_lease)
 select (api.claim_player_catalog_source('GAMES:2026')->>'leaseId')::uuid;
select ok(source_lease is not null,'first source consumer obtains a durable shared lease') from catalog_test_context;
select is(api.claim_player_catalog_source('GAMES:2026')->>'status','WAIT','second source consumer waits on that same outstanding lease');
select throws_ok($$select api.complete_player_catalog_source('GAMES:2026',gen_random_uuid(),'[]'::jsonb)$$,'55000','Catalog source lease expired.','another worker cannot complete an unowned source lease');
select lives_ok($$select api.complete_player_catalog_source('GAMES:2026',source_lease,'[{"fixture":"shared-game"}]'::jsonb) from catalog_test_context$$,'the lease owner publishes a successful shared source response');
select is(api.claim_player_catalog_source('GAMES:2026')->>'status','CACHED','later league acquisition reuses cached source coverage');
select is(api.claim_player_catalog_source('GAMES:2026')->'payload','[{"fixture":"shared-game"}]'::jsonb,'cached public source payload is returned unchanged');
update private.player_catalog_sources set expires_at=clock_timestamp()-interval '1 second',retry_at=clock_timestamp()-interval '1 second' where cache_key='GAMES:2026';
update catalog_test_context set second_lease=(api.claim_player_catalog_source('GAMES:2026')->>'leaseId')::uuid;
select ok(second_lease is not null and second_lease<>source_lease,'expired coverage receives a new lease identity') from catalog_test_context;
select throws_ok($$select api.complete_player_catalog_source('GAMES:2026',source_lease,'[]'::jsonb) from catalog_test_context$$,'55000','Catalog source lease expired.','a late old response cannot overwrite the replacement lease');
select lives_ok($$select api.complete_player_catalog_source('GAMES:2026',second_lease,null) from catalog_test_context$$,'failed source attempts complete without fabricated source data');
select is(api.claim_player_catalog_source('GAMES:2026')->>'status','WAIT','failed source attempts preserve bounded retry backoff');
select is((select payload from private.player_catalog_sources where cache_key='GAMES:2026'),null::jsonb,'failed expired source does not become valid empty coverage');
update catalog_test_context set metadata_request=api.reserve_player_metadata_request();
select ok(metadata_request is not null,'acquisition-only mode reserves metadata through the existing quota authority') from catalog_test_context;
select is((select provider_remaining from private.player_result_policy),99,'catalog reservation consumes one conservative provider credit');
select is((select count(*) from private.player_result_requests where request_class='METADATA'),1::bigint,'catalog acquisition retains the distinct metadata request ledger');
select is((select offers_enabled from private.player_prop_controls),false,'catalog acquisition leaves player offers disabled');
select throws_ok($$select api.complete_player_catalog_job(gen_random_uuid(),'READY')$$,'55000','Catalog lease expired.','unclaimed league jobs cannot be reported complete');
select * from finish();
rollback;
