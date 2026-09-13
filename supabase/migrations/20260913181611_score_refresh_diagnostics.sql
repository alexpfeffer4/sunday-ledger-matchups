-- Keep the existing import transaction and rejection rules. Record only bounded
-- diagnostic codes, never exception text, provider payloads or participant data.
do $migration$
declare
  d text;
  catch_anchor text := $old$          -- Deliberately no exception text, provider payload, or participant data in job output.
          null;$old$;
begin
  d := pg_get_functiondef('api.complete_provider_request(uuid,jsonb,integer)'::regprocedure);
  if strpos(d, catch_anchor) = 0 or strpos(d, 'receipt jsonb; checked integer:=0;') = 0
    or strpos(d, '''eventCount'',checked);') = 0 then
    raise exception 'Unexpected score-completion baseline; diagnostics migration refused';
  end if;
  d := replace(d, 'receipt jsonb; checked integer:=0;', 'receipt jsonb; failure_codes jsonb := ''[]''::jsonb; checked integer:=0;');
  d := replace(d, catch_anchor, $new$
          failure_codes := failure_codes || jsonb_build_array(case
            when sqlerrm = 'The provider changed a published event identity or kickoff.' then 'EVENT_IDENTITY_CHANGED'
            when sqlerrm = 'A live score event is internally inconsistent.' then 'INVALID_SCORE_EVIDENCE'
            when sqlerrm = 'Live score imports require locked cards and an unfinalized week.' then 'WEEK_NOT_READY'
            when sqlstate = '42501' then 'AUTHORIZATION_FAILED'
            else 'DATABASE_' || sqlstate
          end);$new$);
  d := replace(d, '''eventCount'',checked);', $new$'eventCount',checked,
      'failureCodes',case
        when jsonb_array_length(failure_codes)>0 then failure_codes
        when checked<cardinality(r.event_ids) then jsonb_build_array(case when p_import is null then 'PROVIDER_UNAVAILABLE' else 'PROVIDER_EVENTS_MISSING' end)
        else '[]'::jsonb end);$new$);
  execute d;
end;
$migration$;
