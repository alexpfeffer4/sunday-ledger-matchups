-- Expected installed function SHA-256 from the complete candidate migration chain.
-- Also checked by native CI; this file never changes installed definitions.
do $$ declare f record;begin
 for f in select * from (values
  ('api.apply_background_quote_event(uuid,uuid,uuid[])','8dd9f8a8ccbb806da97467d4487dfba004fa306c6538bd24f11fc0af0cf49fee'),
  ('api.apply_live_quote_plan(uuid)','53553b12fc23e0eeb181a4272ca2d719e48f9ca770dd8c5cb20b7d2adb412b18'),
  ('api.claim_background_quote_request(uuid)','f2d038e54cfe8f53f191197b2067aa68b5f1b7a6d8e10156c2561a8624c48fdb'),
  ('api.claim_background_quote_run()','fbf94de46e0749f96e1d3c2562fdf53c05de2d93cef0ad97dcb3eaa74e61716e'),
  ('api.claim_live_quote_refresh(uuid)','a00e96c13d6650b1da5dc2a8580e63a57050b02ce66f035d96b9876f09ef2ce5'),
  ('api.complete_background_quote_request(uuid,uuid,jsonb,jsonb,text,integer)','70b7bde3ff4c9c62a48b5347e6233874654a8441dcce188f6b2ad44e3d29a036'),
  ('api.complete_shared_quote_request(uuid,jsonb,jsonb)','18a6913b814d96b58284e59a16f9165ae10b7f658f19b82c4f3326630cafd2ac'),
  ('api.finish_background_quote_run(uuid)','176d8773b8fe0544e1765bb696237294f0e45c9b7f3f1a03fc654f0d0d5cb801'),
  ('api.get_stored_quote_updates(text,uuid)','2b7592c71c88f8d861e7d3cb6ddfa0eb81b4e600eddd355eafc2e95e0e98f9c3'),
  ('api.next_background_quote_application(uuid)','2659aeec3fc15623d096ff02c624b6fc3565ba7adf38648cdab1acddf19354f8'),
  ('private.apply_shared_quote_events(uuid,uuid,uuid[],boolean,text[])','bd5817e0247c85f341a766cb51a706593e300777759b31fdeda508a5537a11dd'),
  ('private.assert_background_quote_run(uuid)','6f83a247600fdea0a6237c7fd4f43fd1d196634046c8a159f23f7a2c14210db6'),
  ('private.attach_background_quotes_dispatch_hook()','35fd86c4ebeab005d6ed505b2a16da7f8c5610b07e1dbac3da4fc884fc465be9'),
  ('private.background_quote_due()','cda9139cc2bace40ea7dcc1f42cc3dd6649246e3eec16b67350e90093069baf8'),
  ('private.background_quote_forecast_scope(timestamp with time zone,timestamp with time zone)','55ea0d60ba8b111000729d15e596914a56364a0aeb84db4c24272d2cf7628121'),
  ('private.background_quote_interval(text,timestamp with time zone,timestamp with time zone)','95b876f9eaf1e72f1ae1515277958d5d4ce94062a30e39139c6731447477ef4a'),
  ('private.background_quote_targets()','6547f15267d3855a800e832f532b614cf3011ca1e57cf5d7a1c766ac09567b17'),
  ('private.dispatch_background_quotes()','0fa43e10663f9f5096a4cc8d52a675e95ee93361daf1d55deab1050734732a0b'),
  ('private.dispatch_score_checkpoints()','a7a198ce62357a74b98a6e90661c924d211d5aa5f81d348ea384e9e05adc80e8'),
  ('private.evaluate_background_quote_budget()','48e38dd45eb34faeda2f6691bcf9d3a549f52e55f5bc0172d3f20e26f5b54f30'),
  ('private.reserve_background_quote_credits(integer)','f2ed9f0bdf73d4f71d65c12d0bb7c1607258db7e7e680e65f6868101aa559e52'),
  ('private.reserve_selective_quote_credits(integer,boolean)','b774e5599968d6bc2079ff891d78a6be16431229e2ded9241e3b2156f169b06a')
 ) expected(signature,hash) loop
 if to_regprocedure(f.signature) is null or encode(extensions.digest(pg_get_functiondef(to_regprocedure(f.signature)),'sha256'),'hex')<>f.hash then
 raise exception 'Shared quote release function differs: %',f.signature;end if;
 end loop;
end $$;
