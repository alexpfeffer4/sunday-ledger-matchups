-- Forward repair of the real PREPARE acquisition path. The local `id` variable
-- conflicted with seasons.id before the budget reservation could execute.
-- Preserve the service-only entry, lease fences, readiness, cooldown and cost.
create or replace function api.claim_season_automation_odds(p_run uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r private.season_automation_runs%rowtype;request_id uuid;l uuid;
begin
 r:=private.assert_season_automation_run(p_run);
 if r.operation<>'PREPARE' then raise exception using errcode='42501',message='Only due preparation can acquire markets.';end if;
 select season.league_id into l from private.seasons season where season.id=r.season_id;
 perform 1 from private.odds_refresh_policy for update nowait;
 perform private.require_season_automation_readiness();
 if exists(select 1 from private.provider_requests where kind='ODDS' and league_id=l and attempted_at>clock_timestamp()-interval '60 seconds') then raise exception 'QUOTE_REFRESH_COOLDOWN';end if;
 perform private.reserve_provider_credits(3);
 insert into private.provider_requests(kind,league_id,actor_user_id) values('ODDS',l,null) returning provider_requests.id into request_id;
 return request_id;
end $$;
revoke all on function api.claim_season_automation_odds(uuid) from public,anon,authenticated;
grant execute on function api.claim_season_automation_odds(uuid) to service_role;
