-- Explicit, disabled-by-default source-policy amendment for the limited pilot.
-- No source contracts, offers, result processing, menu review or cutover is activated.
create table private.player_source_validations (
 id uuid primary key default gen_random_uuid(),
 source_policy text not null check(source_policy='NFLVERSE_PRIMARY'),
 selection_policy text not null check(selection_policy='FEATURED_HIGHEST_STANDARD_LINES'),
 validation_sha text not null check(validation_sha ~ '^[0-9a-f]{64}$'),
 approval_reference text not null check(char_length(approval_reference) between 8 and 500),
 validated_at timestamptz not null default clock_timestamp(),
 unique(source_policy,selection_policy,validation_sha,approval_reference)
);
alter table private.player_source_validations enable row level security;
revoke all on private.player_source_validations from public,anon,authenticated;
create trigger player_source_validations_immutable before update or delete on private.player_source_validations
 for each row execute function private.reject_competitive_mutation();

alter table private.player_result_policy
 add column source_policy text not null default 'API_SPORTS_NFLVERSE' check(source_policy in('API_SPORTS_NFLVERSE','NFLVERSE_PRIMARY')),
 add column selection_policy text not null default 'LEGACY_ROLE_PRIORITY' check(selection_policy in('LEGACY_ROLE_PRIORITY','FEATURED_HIGHEST_STANDARD_LINES')),
 add column source_validation_id uuid references private.player_source_validations(id),
 add constraint player_source_policy_pair check(
  (source_policy='API_SPORTS_NFLVERSE' and selection_policy='LEGACY_ROLE_PRIORITY' and source_validation_id is null)
  or (source_policy='NFLVERSE_PRIMARY' and selection_policy='FEATURED_HIGHEST_STANDARD_LINES' and source_validation_id is not null));

create function private.player_source_policy_validated() returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.player_result_policy p where p.nflverse_contract_validated
 and ((p.source_policy='API_SPORTS_NFLVERSE' and p.api_sports_contract_validated)
 or (p.source_policy='NFLVERSE_PRIMARY' and exists(select 1 from private.player_source_validations v
 where v.id=p.source_validation_id and v.source_policy=p.source_policy and v.selection_policy=p.selection_policy))));
$$;
create function private.guard_player_source_policy() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if row(new.source_policy,new.selection_policy,new.source_validation_id) is distinct from row(old.source_policy,old.selection_policy,old.source_validation_id) then
  if exists(select 1 from private.player_prop_controls where offers_enabled)
   or exists(select 1 from private.effective_position_receipts where subject_id is not null)
   or exists(select 1 from private.week_player_menu where frozen_at is not null)
   or exists(select 1 from private.player_result_event_mappings)
   or exists(select 1 from private.player_catalog_jobs)
   or exists(select 1 from private.player_result_jobs) then
   raise exception using errcode='55000',message='An established player policy cannot be replaced by the pilot.';
  end if;
 end if;
 if new.source_policy='NFLVERSE_PRIMARY' and not exists(select 1 from private.player_source_validations v
 where v.id=new.source_validation_id and v.source_policy=new.source_policy and v.selection_policy=new.selection_policy) then
  raise exception using errcode='22023',message='Recorded source and selection validation is required.';
 end if;
 return new;
end; $$;
create trigger player_source_policy_guard before update on private.player_result_policy for each row execute function private.guard_player_source_policy();

create function private.configure_nflverse_primary_pilot(p_validation_sha text,p_approval_reference text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v uuid;p private.player_result_policy%rowtype;
begin
 if p_validation_sha is null or p_validation_sha !~ '^[0-9a-f]{64}$'
 or p_approval_reference is null or char_length(btrim(p_approval_reference)) not between 8 and 500 then
  raise exception using errcode='22023',message='Exact source validation and pilot approval are required.';end if;
 perform 1 from private.seasons where mode='LIVE' order by id for update;
 perform 1 from private.season_weeks w join private.seasons s on s.id=w.season_id where s.mode='LIVE' order by w.id for update of w;
 select * into strict p from private.player_result_policy where singleton for update;
 if p.source_policy='NFLVERSE_PRIMARY' then
  if not exists(select 1 from private.player_source_validations where id=p.source_validation_id and validation_sha=p_validation_sha and approval_reference=btrim(p_approval_reference)) then
   raise exception using errcode='22000',message='A different source validation is already recorded.';end if;
  return jsonb_build_object('validationId',p.source_validation_id,'sourcePolicy',p.source_policy,'selectionPolicy',p.selection_policy,'replayed',true);
 end if;
 insert into private.player_source_validations(source_policy,selection_policy,validation_sha,approval_reference)
 values('NFLVERSE_PRIMARY','FEATURED_HIGHEST_STANDARD_LINES',p_validation_sha,btrim(p_approval_reference)) returning id into v;
 update private.player_result_policy set source_policy='NFLVERSE_PRIMARY',selection_policy='FEATURED_HIGHEST_STANDARD_LINES',source_validation_id=v where singleton;
 return jsonb_build_object('validationId',v,'sourcePolicy','NFLVERSE_PRIMARY','selectionPolicy','FEATURED_HIGHEST_STANDARD_LINES','replayed',false);
end; $$;

alter table private.player_result_event_mappings alter column api_sports_event_id drop not null;
alter table private.player_result_event_mappings
 add column source_policy text not null default 'API_SPORTS_NFLVERSE' check(source_policy in('API_SPORTS_NFLVERSE','NFLVERSE_PRIMARY')),
 add column source_validation_id uuid references private.player_source_validations(id),
 add constraint player_event_source_policy check((source_policy='API_SPORTS_NFLVERSE' and api_sports_event_id is not null and source_validation_id is null)
 or (source_policy='NFLVERSE_PRIMARY' and api_sports_event_id is null and source_validation_id is not null));
alter table private.week_player_menu
 add column source_policy text not null default 'API_SPORTS_NFLVERSE',
 add column selection_policy text not null default 'LEGACY_ROLE_PRIORITY',
 add column source_validation_id uuid references private.player_source_validations(id);
create function private.pin_player_menu_source_policy() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p private.player_result_policy%rowtype;
begin
 if tg_op='UPDATE' and old.frozen_at is not null then
  if row(new.source_policy,new.selection_policy,new.source_validation_id) is distinct from row(old.source_policy,old.selection_policy,old.source_validation_id) then
   raise exception using errcode='55000',message='A frozen player menu retains its source and selection policy.';end if;
  return new;
 end if;
 select * into strict p from private.player_result_policy where singleton;
 new.source_policy:=p.source_policy;new.selection_policy:=p.selection_policy;new.source_validation_id:=p.source_validation_id;
 return new;
end; $$;
create trigger player_menu_source_policy before insert or update on private.week_player_menu
 for each row execute function private.pin_player_menu_source_policy();

alter table private.player_catalog_sources drop constraint player_catalog_sources_cache_key_check;
alter table private.player_catalog_sources add constraint player_catalog_sources_cache_key_check
 check(cache_key ~ '^(COVERAGE|GAMES|NFLVERSE|NFLVERSE_PRIMARY):[0-9]{4}$|^ROSTER:[0-9]{4}:[0-9]+$');
-- Exact guarded changes retain the existing leases, budget counters, and Week 2
-- receipt/reset/first-start authority. API-Sports workers stay disabled in pilot.
do $policy$
declare d text;old text;
begin
 d:=pg_get_functiondef('api.claim_player_catalog_source(text)'::regprocedure);
 d:=replace(d,'COVERAGE|GAMES|NFLVERSE','COVERAGE|GAMES|NFLVERSE|NFLVERSE_PRIMARY');
 old:='insert into private.player_catalog_sources(cache_key)';
 if strpos(d,old)=0 then raise exception 'Catalog source policy anchor changed';end if;
 d:=replace(d,old,$new$if (select source_policy='NFLVERSE_PRIMARY' from private.player_result_policy where singleton)
 and (p_cache_key not like 'NFLVERSE_PRIMARY:%' or not private.player_source_policy_validated()) then
  return jsonb_build_object('status','DISABLED');end if;
 if p_cache_key like 'NFLVERSE_PRIMARY:%' and not exists(select 1 from private.player_result_policy where source_policy='NFLVERSE_PRIMARY') then
  return jsonb_build_object('status','DISABLED');end if;
 insert into private.player_catalog_sources(cache_key)$new$);execute d;
 d:=pg_get_functiondef('api.claim_player_catalog_job(uuid)'::regprocedure);
 old:='if not p.metadata_enabled then';
 if strpos(d,old)=0 then raise exception 'Catalog claim source policy anchor changed';end if;
 d:=replace(d,old,'if not p.metadata_enabled or (p.source_policy=''NFLVERSE_PRIMARY'' and not private.player_source_policy_validated()) then');
 old:='''apiSportsContractValidated'',p.api_sports_contract_validated';
 if strpos(d,old)=0 then raise exception 'Catalog policy response anchor changed';end if;
 d:=replace(d,old,'''sourcePolicy'',p.source_policy,''selectionPolicy'',p.selection_policy,''sourceValidationId'',p.source_validation_id,'||old);execute d;
 d:=pg_get_functiondef('private.require_week2_props_readiness(boolean)'::regprocedure);
 old:='metadata_enabled and api_sports_contract_validated and nflverse_contract_validated';
 if strpos(d,old)=0 then raise exception 'Week 2 source readiness anchor changed';end if;
 execute replace(d,old,'metadata_enabled and private.player_source_policy_validated()');
 d:=pg_get_functiondef('api.claim_player_result_jobs()'::regprocedure);
 old:='if not policy.processing_enabled or not policy.api_sports_contract_validated then';
 if strpos(d,old)=0 then raise exception 'API-Sports result policy anchor changed';end if;
 execute replace(d,old,'if policy.source_policy<>''API_SPORTS_NFLVERSE'' or not policy.processing_enabled or not policy.api_sports_contract_validated then');
 d:=pg_get_functiondef('api.claim_player_statistics_status()'::regprocedure);
 old:='if not p.metadata_enabled and (not p.processing_enabled or not p.api_sports_contract_validated) then';
 if strpos(d,old)=0 then raise exception 'API-Sports status policy anchor changed';end if;
 execute replace(d,old,'if p.source_policy<>''API_SPORTS_NFLVERSE'' or (not p.metadata_enabled and (not p.processing_enabled or not p.api_sports_contract_validated)) then');
 d:=pg_get_functiondef('private.reserve_player_metadata_credits(uuid)'::regprocedure);
 old:='if (p_smoke_run_id is null and not (p.processing_enabled or p.metadata_enabled))';
 if strpos(d,old)=0 then raise exception 'API-Sports metadata policy anchor changed';end if;
 execute replace(d,old,'if p.source_policy<>''API_SPORTS_NFLVERSE'' or (p_smoke_run_id is null and not (p.processing_enabled or p.metadata_enabled))');
 d:=pg_get_functiondef('api.claim_nflverse_reconciliation()'::regprocedure);
 old:='if not p.processing_enabled or not p.nflverse_contract_validated then';
 if strpos(d,old)=0 then raise exception 'NFLVERSE result policy anchor changed';end if;
 execute replace(d,old,'if not p.processing_enabled or not p.nflverse_contract_validated or (p.source_policy=''NFLVERSE_PRIMARY'' and not private.player_source_policy_validated()) then');
 -- Null-safe provider identity is essential now API-Sports IDs may be absent.
 d:=pg_get_functiondef('api.import_player_result_observations(jsonb)'::regprocedure);
 old:='o->>''sourceEventId''<>(case provider_name when ''API_SPORTS'' then m.api_sports_event_id else m.nflverse_event_id end)';
 if strpos(d,old)=0 then raise exception 'Result import event identity anchor changed';end if;
 execute replace(d,old,'o->>''sourceEventId'' is distinct from (case provider_name when ''API_SPORTS'' then m.api_sports_event_id else m.nflverse_event_id end) or (provider_name=''API_SPORTS'' and m.api_sports_event_id is null)');
end; $policy$;

create or replace function api.register_player_result_event(p_mapping jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;
begin
 select * into strict p from private.player_result_policy where singleton;
 if p.source_policy='NFLVERSE_PRIMARY' and (not private.player_source_policy_validated() or p_mapping->>'apiSportsEventId' is not null) then
  raise exception using errcode='22023',message='Validated NFLVERSE-only crosswalk required for the pilot.';end if;
 if not exists(select 1 from private.sports_events e where e.fixture_event_key=p_mapping->>'externalEventId' and e.away_team=p_mapping->>'awayTeam' and e.home_team=p_mapping->>'homeTeam' and (e.scheduled_start_at at time zone 'America/New_York')::date=(p_mapping->>'gameDate')::date) then raise exception using errcode='22023',message='Result crosswalk must match a published event.';end if;
 insert into private.player_result_event_mappings(external_event_id,api_sports_event_id,nflverse_event_id,game_date,away_team,home_team,verified_at,evidence_hash,source_policy,source_validation_id)
 values(p_mapping->>'externalEventId',p_mapping->>'apiSportsEventId',p_mapping->>'nflverseEventId',(p_mapping->>'gameDate')::date,p_mapping->>'awayTeam',p_mapping->>'homeTeam',clock_timestamp(),p_mapping->>'evidenceHash',p.source_policy,p.source_validation_id)
 on conflict (external_event_id) do nothing;
 -- A durable acquisition retry reuses identical identity without rewriting its
 -- original evidence. Conflicting provider IDs must never silently remap a game.
 if not exists(select 1 from private.player_result_event_mappings m
  where m.external_event_id=p_mapping->>'externalEventId'
   and m.source_policy=p.source_policy and m.source_validation_id is not distinct from p.source_validation_id
   and m.api_sports_event_id is not distinct from (p_mapping->>'apiSportsEventId')
   and m.nflverse_event_id is not distinct from (p_mapping->>'nflverseEventId')
   and m.game_date=(p_mapping->>'gameDate')::date
   and m.away_team=p_mapping->>'awayTeam' and m.home_team=p_mapping->>'homeTeam') then
  raise exception using errcode='22000',message='Result crosswalk identity conflicts with the registered event.';
 end if;
end; $$;

create or replace function private.player_result_event_context(p_external_event_id text,p_provider text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('externalEventId',m.external_event_id,'sourceEventId',case p_provider when 'API_SPORTS' then m.api_sports_event_id else m.nflverse_event_id end,
 'gameDate',m.game_date,'final',true,'sourcePolicy',m.source_policy,
 'finalObservedAt',(select j.final_observed_at from private.player_result_jobs j where j.external_event_id=m.external_event_id),
 'awayTeam',case when p_provider='NFLVERSE' then split_part(m.nflverse_event_id,'_',3) else m.away_team end,
 'homeTeam',case when p_provider='NFLVERSE' then split_part(m.nflverse_event_id,'_',4) else m.home_team end,
 'scheduledStartAt',(select min(e.scheduled_start_at) from private.sports_events e where e.fixture_event_key=m.external_event_id),'mappings',coalesce((select jsonb_agg(jsonb_build_object('subjectId',p.subject_id,'externalPlayerId',p.external_player_id,'team',p.team,'sourceTeam',coalesce(p.source_team,p.team),'pfrPlayerId',p.secondary_player_id,'statistic',r.statistic) order by p.subject_id,r.statistic)
 from private.player_provider_mappings p join(select distinct r.subject_id,r.statistic from private.position_receipts r join private.sports_events e on e.id=r.event_id join private.seasons s on s.id=e.season_id where e.fixture_event_key=m.external_event_id and s.mode='LIVE' and r.subject_id is not null)r on r.subject_id=p.subject_id
 where p.external_event_id=m.external_event_id and p.provider=p_provider and p.game_date=m.game_date and p.result_path_verified),'[]'::jsonb)) from private.player_result_event_mappings m where m.external_event_id=p_external_event_id;
$$;

revoke all on function private.player_source_policy_validated(),private.guard_player_source_policy(),
 private.configure_nflverse_primary_pilot(text,text),private.pin_player_menu_source_policy() from public,anon,authenticated;

-- Exceptional, independently verified evidence is labeled honestly. It cannot
-- enter the automatic NFLVERSE importer or fabricate an NFLVERSE source row.
alter table private.player_result_observations drop constraint player_result_observations_provider_check;
alter table private.player_result_observations add constraint player_result_observations_provider_check
 check(provider in('API_SPORTS','NFLVERSE','VERIFIED_EXCEPTION'));
create table private.player_verified_exceptions (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references private.sports_events(id),
 subject_id uuid not null references private.player_subjects(id),statistic text not null,
 observation_id uuid not null references private.player_result_observations(id),
 candidate_id uuid not null references private.player_result_candidates(id),
 actor_user_id uuid not null references private.profiles(id),
 statistic_source_url text not null,participation_source_url text not null,
 evidence_hash text not null check(evidence_hash ~ '^[0-9a-f]{64}$'),
 offensive_snaps integer not null check(offensive_snaps between 0 and 200),
 reason text not null check(char_length(reason) between 10 and 500),
 idempotency_key text not null unique check(char_length(idempotency_key) between 8 and 120),
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 evidence_bundle_id uuid not null references private.player_evidence_bundles(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.player_verified_exceptions enable row level security;
revoke all on private.player_verified_exceptions from public,anon,authenticated;
create trigger player_verified_exceptions_append_only before update or delete on private.player_verified_exceptions
 for each row execute function private.reject_competitive_mutation();
create function api.resolve_verified_player_result_exception(
 p_event_id uuid,p_subject_id uuid,p_statistic text,p_value integer,p_offensive_snaps integer,
 p_statistic_source_url text,p_participation_source_url text,p_evidence_hash text,
 p_actor_user_id uuid,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.sports_events%rowtype;m private.player_result_event_mappings%rowtype;
 pm private.player_provider_mappings%rowtype;prior private.player_verified_exceptions%rowtype;
 h text;part text;observation uuid;candidate uuid;bundle uuid;final_at timestamptz;url text;
begin
 if p_event_id is null or p_subject_id is null or p_statistic is null or p_statistic not in('PASSING_YARDS','RUSHING_YARDS','RECEIVING_YARDS')
 or p_offensive_snaps is null or p_offensive_snaps not between 0 and 200
 or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$'
 or p_reason is null or char_length(btrim(p_reason)) not between 10 and 500
 or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 120
 or p_statistic_source_url is null or p_participation_source_url is null
 or (p_offensive_snaps>0 and (p_value is null or p_value not between -1000 and 2000))
 or (p_offensive_snaps=0 and p_value is not null and p_value<>0) then
  raise exception using errcode='22023',message='Explicit verified yards, offensive snaps, sources, evidence hash and reason are required.';end if;
 foreach url in array array[p_statistic_source_url,p_participation_source_url] loop
  if char_length(url)>2000 or url !~ '^https://(github\.com/nflverse/|raw\.githubusercontent\.com/nflverse/|www\.pro-football-reference\.com/|static\.nfl\.com/|www\.nfl\.com/|nflcdns\.nfl\.com/)' or url ~ '[[:space:]]' then
   raise exception using errcode='22023',message='Use a verifiable NFLVERSE, PFR or official NFL evidence URL.';end if;
 end loop;
 select * into strict e from private.sports_events where id=p_event_id;
 if p_actor_user_id is null or not exists(select 1 from private.league_memberships where league_id=e.league_id and user_id=p_actor_user_id and role='COMMISSIONER') then
  raise exception using errcode='42501',message='An identified league commissioner must verify exceptional evidence.';end if;
 perform 1 from private.seasons where id=e.season_id for update;
 perform 1 from private.season_weeks where id=e.week_id for update;
 perform 1 from private.sports_events where id=e.id for update;
 h:=encode(extensions.digest(jsonb_build_object('eventId',p_event_id,'subjectId',p_subject_id,'statistic',p_statistic,
  'value',p_value,'offensiveSnaps',p_offensive_snaps,'statisticSourceUrl',p_statistic_source_url,'participationSourceUrl',p_participation_source_url,
  'evidenceHash',p_evidence_hash,'actorUserId',p_actor_user_id,'reason',btrim(p_reason))::text,'sha256'),'hex');
 select * into prior from private.player_verified_exceptions where idempotency_key=p_idempotency_key;
 if found then
  if prior.request_hash<>h then raise exception using errcode='22000',message='Exceptional verification key already records different evidence.';end if;
  return jsonb_build_object('exceptionId',prior.id,'evidenceBundleId',prior.evidence_bundle_id,'replayed',true);
 end if;
 select * into strict m from private.player_result_event_mappings where external_event_id=e.fixture_event_key and source_policy='NFLVERSE_PRIMARY';
 if not exists(select 1 from private.player_source_validations v where v.id=m.source_validation_id)
 or not exists(select 1 from private.effective_position_receipts r where r.event_id=e.id and r.subject_id=p_subject_id and r.statistic=p_statistic)
 or exists(select 1 from private.player_evidence_bundles where event_id=e.id and subject_id=p_subject_id and statistic=p_statistic)
 or exists(select 1 from private.player_result_observations where external_event_id=e.fixture_event_key and subject_id=p_subject_id and statistic=p_statistic
  and participation_complete and (participation='NO_OFFENSE' or complete)) then
  raise exception using errcode='55000',message='This path only resolves accepted pilot props with missing complete evidence.';end if;
 select created_at into final_at from private.event_result_versions where event_id=e.id and status='FINAL' order by version desc limit 1;
 if final_at is null or e.actual_started_at is null then raise exception using errcode='55000',message='A verified final game is required.';end if;
 select * into strict pm from private.player_provider_mappings where provider='NFLVERSE' and external_event_id=e.fixture_event_key
 and subject_id=p_subject_id and game_date=m.game_date and result_path_verified;
 part:=case when p_offensive_snaps=0 then 'NO_OFFENSE' else 'OFFENSE' end;
 insert into private.player_result_observations(provider,external_event_id,source_event_id,external_player_id,subject_id,team,game_date,statistic,period,
 value,complete,participation,participation_complete,source_updated_at,participation_source_updated_at,fetched_at,content_hash)
 values('VERIFIED_EXCEPTION',m.external_event_id,m.nflverse_event_id,pm.external_player_id,p_subject_id,pm.team,m.game_date,p_statistic,'FULL_GAME',
 p_value,p_value is not null,part,true,null,null,clock_timestamp(),h) returning id into observation;
 insert into private.player_result_candidates(event_id,subject_id,statistic,statistic_observation_id,participation_observation_id,evidence_hash,reason)
 values(e.id,p_subject_id,p_statistic,case when p_value is not null then observation end,observation,h,'VERIFIED_MISSING_RESULT_EXCEPTION') returning id into candidate;
 -- Existing authority enforces finality and the established correction window.
 -- It is never passed the protected Week 17 bypass from this exception path.
 bundle:=private.publish_player_evidence(e.id,p_subject_id,p_statistic,case when p_value is not null then observation end,observation,btrim(p_reason));
 if bundle is null then raise exception using errcode='55000',message='Complete player evidence and a final game are required.';end if;
 insert into private.player_result_decisions(candidate_id,actor_user_id,reason,evidence_bundle_id) values(candidate,p_actor_user_id,btrim(p_reason),bundle);
 insert into private.player_verified_exceptions(event_id,subject_id,statistic,observation_id,candidate_id,actor_user_id,statistic_source_url,participation_source_url,
 evidence_hash,offensive_snaps,reason,idempotency_key,request_hash,evidence_bundle_id)
 values(e.id,p_subject_id,p_statistic,observation,candidate,p_actor_user_id,p_statistic_source_url,p_participation_source_url,p_evidence_hash,
 p_offensive_snaps,btrim(p_reason),p_idempotency_key,h,bundle) returning * into prior;
 update private.player_result_jobs j set state='COMPLETE',incident_code=null,completed_at=clock_timestamp(),
  next_reconcile_at=null,reconcile_lease_id=null,reconcile_lease_until=null,lease_id=null,lease_until=null
 where j.external_event_id=e.fixture_event_key and not exists(select 1 from private.effective_position_receipts r
 join private.sports_events event on event.id=r.event_id where event.fixture_event_key=j.external_event_id and r.subject_id is not null
 and not exists(select 1 from private.settlement_versions sv where sv.receipt_id=r.id));
 return jsonb_build_object('exceptionId',prior.id,'evidenceBundleId',bundle,'replayed',false);
end; $$;
revoke all on function api.resolve_verified_player_result_exception(uuid,uuid,text,integer,integer,text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function api.resolve_verified_player_result_exception(uuid,uuid,text,integer,integer,text,text,text,uuid,text,text) to service_role;

-- Current complete nomination membership is separate from immutable historical
-- identity mappings. Removed starters cannot survive through an old rank zero.
create table private.player_catalog_nomination_generations (
 id uuid primary key default gen_random_uuid(),week_id uuid not null references private.season_weeks(id),
 source_validation_id uuid not null references private.player_source_validations(id),
 nominations jsonb not null check(jsonb_typeof(nominations)='array' and jsonb_array_length(nominations)<=96),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),unique(week_id,content_hash)
);
create table private.player_catalog_nomination_heads (
 week_id uuid primary key references private.season_weeks(id),
 generation_id uuid not null references private.player_catalog_nomination_generations(id)
);
alter table private.player_catalog_nomination_generations enable row level security;
alter table private.player_catalog_nomination_heads enable row level security;
revoke all on private.player_catalog_nomination_generations,private.player_catalog_nomination_heads from public,anon,authenticated;
create trigger player_catalog_nomination_generations_append_only before update or delete on private.player_catalog_nomination_generations
 for each row execute function private.reject_competitive_mutation();
create function api.record_player_catalog_nominations(p_lease_id uuid,p_proposals jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.player_catalog_jobs%rowtype;w private.season_weeks%rowtype;p private.player_result_policy%rowtype;
 oldg private.player_catalog_nomination_generations%rowtype;g uuid;h text;n jsonb;c jsonb;oldn jsonb;e private.sports_events%rowtype;expected integer;
begin
 select * into strict j from private.player_catalog_jobs where lease_id=p_lease_id and lease_until>clock_timestamp();
 select * into strict w from private.season_weeks where id=j.week_id;
 perform 1 from private.seasons where id=w.season_id for update;
 perform 1 from private.season_weeks where id=w.id for update;
 select * into strict j from private.player_catalog_jobs where week_id=w.id and lease_id=p_lease_id and lease_until>clock_timestamp() for update;
 select * into strict p from private.player_result_policy where singleton;
 if p.source_policy<>'NFLVERSE_PRIMARY' or not private.player_source_policy_validated() then
  raise exception using errcode='55000',message='Validated primary source policy is required for nominations.';end if;
 if exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null)
 or exists(select 1 from private.effective_position_receipts where week_id=w.id)
 or exists(select 1 from private.sports_events where week_id=w.id and (actual_started_at is not null or scheduled_start_at<=clock_timestamp())) then
  raise exception using errcode='55000',message='Nomination membership cannot change after acceptance or first start.';end if;
 select 6*count(*) into expected from private.sports_events ev where ev.week_id=w.id
 and exists(select 1 from private.slate_items i where i.event_id=ev.id and private.is_effective_slate_item(i.id));
 if expected=0 or p_proposals is null or jsonb_typeof(p_proposals)<>'array' or jsonb_array_length(p_proposals)<>expected or expected>96
 or exists(select 1 from jsonb_array_elements(p_proposals)proposal group by proposal->>'externalEventId',proposal->>'team',proposal->>'slot' having count(*)<>1) then
  raise exception using errcode='22023',message='A complete six-slot nomination generation is required.';end if;
 select g.* into oldg from private.player_catalog_nomination_heads head join private.player_catalog_nomination_generations g on g.id=head.generation_id where head.week_id=w.id;
 for n in select value from jsonb_array_elements(p_proposals) loop
  select * into e from private.sports_events ev where ev.week_id=w.id and ev.fixture_event_key=n->>'externalEventId'
  and exists(select 1 from private.slate_items i where i.event_id=ev.id and private.is_effective_slate_item(i.id));
  if e.id is null or n->>'team' is null or n->>'team' not in(e.away_team,e.home_team)
  or n->>'slot' is null or n->>'slot' not in('QB_PASS','RB_RUSH','RECEIVER')
  or jsonb_typeof(n->'candidates') is distinct from 'array' or jsonb_array_length(n->'candidates')>30
  or n->>'nominationEvidenceHash' is null or n->>'nominationEvidenceHash' !~ '^[0-9a-f]{64}$'
  or n->>'nominationExpiresAt' is null or (jsonb_array_length(n->'candidates')>0 and (n->>'nominationExpiresAt')::timestamptz<=clock_timestamp())
  or (n->>'nominationExpiresAt')::timestamptz>clock_timestamp()+interval '12 hours'
  or n->>'nominationVerifiedAt' is null or (n->>'nominationVerifiedAt')::timestamptz>clock_timestamp()
  or (n->>'nominationVerifiedAt')::timestamptz<clock_timestamp()-interval '48 hours'
  or (n->>'proposedCanonicalKey' is not null and not exists(select 1 from jsonb_array_elements(n->'candidates')candidate where candidate->>'canonicalKey'=n->>'proposedCanonicalKey'))
  or (jsonb_array_length(n->'candidates')>0 and n->>'proposedCanonicalKey' is null)
  or exists(select 1 from jsonb_array_elements(n->'candidates')candidate group by candidate->>'canonicalKey' having count(*)<>1) then
   raise exception using errcode='22023',message='Every nomination requires current verified event, slot, membership and evidence.';end if;
  if oldg.id is not null then
   select value into oldn from jsonb_array_elements(oldg.nominations)o where o->>'externalEventId'=n->>'externalEventId' and o->>'team'=n->>'team' and o->>'slot'=n->>'slot';
   if oldn is not null and (n->>'nominationEvidenceHash'<>oldn->>'nominationEvidenceHash')
   and (n->>'nominationVerifiedAt')::timestamptz<=(oldn->>'nominationVerifiedAt')::timestamptz then
    raise exception using errcode='55000',message='Older or unordered nomination evidence cannot replace current membership.';end if;
  end if;
  for c in select value from jsonb_array_elements(n->'candidates') loop
   if c->>'roleRank' is null or (c->>'roleRank')::integer not between 0 and 999
    or c->>'roleEvidence' is null or char_length(c->>'roleEvidence') not between 3 and 300
    or not exists(select 1 from private.player_subjects subject join private.player_provider_mappings pm on pm.subject_id=subject.id
      where subject.canonical_key=c->>'canonicalKey' and pm.external_event_id=e.fixture_event_key and pm.team=n->>'team'
      and pm.provider='THE_ODDS_API' and pm.result_path_verified and pm.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date
      and ((n->>'slot'='QB_PASS' and subject.position='QB') or(n->>'slot'='RB_RUSH' and subject.position='RB') or(n->>'slot'='RECEIVER' and subject.position in('WR','TE')))) then
     raise exception using errcode='22023',message='A nomination candidate must retain verified role-correct bookmaker identity.';end if;
  end loop;
 end loop;
 select encode(extensions.digest(jsonb_agg(proposal order by proposal->>'externalEventId',proposal->>'team',proposal->>'slot')::text,'sha256'),'hex') into h from jsonb_array_elements(p_proposals)proposal;
 if oldg.content_hash=h then return jsonb_build_object('generationId',oldg.id,'replayed',true);end if;
 insert into private.player_catalog_nomination_generations(week_id,source_validation_id,nominations,content_hash)
 values(w.id,p.source_validation_id,p_proposals,h) returning id into g;
 insert into private.player_catalog_nomination_heads(week_id,generation_id) values(w.id,g)
 on conflict(week_id) do update set generation_id=excluded.generation_id;
 -- A changed membership requires a fresh complete commissioner review. Clear
 -- the old selection before proposing, never leave an obsolete confirmed one.
 update private.week_player_menu set subject_id=null,confirmed_at=null,confirmed_by=null,unavailable_reason='SLATE_REVIEW_REQUIRED'
 where week_id=w.id and frozen_at is null;
 if private.player_props_menu_eligible(w.id) then perform private.prepare_player_menu(w.id);end if;
 return jsonb_build_object('generationId',g,'replayed',false);
end; $$;
revoke all on function api.record_player_catalog_nominations(uuid,jsonb) from public,anon,authenticated;
grant execute on function api.record_player_catalog_nominations(uuid,jsonb) to service_role;

create or replace function private.player_menu_candidates(p_event_id uuid,p_team text,p_slot text)
returns table(subject_id uuid,subject_label text,"position" text,role_rank integer,role_evidence text)
language sql stable security invoker set search_path='' as $$
 select subject_id,subject_label,"position",role_rank,role_evidence from (
 select s.id subject_id,s.display_name subject_label,s.position,
 coalesce(o.role_rank,m.role_rank) role_rank,coalesce(o.role_evidence,m.role_evidence) role_evidence,s.canonical_key
 from private.sports_events e join private.player_provider_mappings m on m.external_event_id=e.fixture_event_key
 join private.player_subjects s on s.id=m.subject_id
 left join lateral(select * from private.player_provider_mapping_observations x where x.mapping_id=m.id
 order by x.verified_at desc,x.evidence_hash desc limit 1)o on true
 where e.id=p_event_id and p_team in(e.away_team,e.home_team) and m.team=p_team
 and m.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date
 and m.provider in('THE_ODDS_API','SIMULATION_FIXTURE') and m.result_path_verified
 and ((select source_policy from private.player_result_policy where singleton)<>'NFLVERSE_PRIMARY' or m.provider='SIMULATION_FIXTURE')
 and ((p_slot='QB_PASS' and s.position='QB') or(p_slot='RB_RUSH' and s.position='RB') or(p_slot='RECEIVER' and s.position in('WR','TE')))
 union all
 select s.id,s.display_name,s.position,(candidate->>'roleRank')::integer,candidate->>'roleEvidence',s.canonical_key
 from private.sports_events e join private.player_catalog_nomination_heads head on head.week_id=e.week_id
 join private.player_catalog_nomination_generations generation on generation.id=head.generation_id
 cross join lateral jsonb_array_elements(generation.nominations)n
 cross join lateral jsonb_array_elements(n->'candidates')candidate
 join private.player_subjects s on s.canonical_key=candidate->>'canonicalKey'
 where e.id=p_event_id and p_team in(e.away_team,e.home_team) and n->>'externalEventId'=e.fixture_event_key and n->>'team'=p_team and n->>'slot'=p_slot
 and (select source_policy from private.player_result_policy where singleton)='NFLVERSE_PRIMARY'
 and (n->>'nominationExpiresAt')::timestamptz>clock_timestamp()
 and exists(select 1 from private.player_provider_mappings m where m.external_event_id=e.fixture_event_key and m.team=p_team
 and m.subject_id=s.id and m.provider='THE_ODDS_API' and m.result_path_verified and m.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date)
 and ((p_slot='QB_PASS' and s.position='QB') or(p_slot='RB_RUSH' and s.position='RB') or(p_slot='RECEIVER' and s.position in('WR','TE')))
 )current_candidates order by role_rank,canonical_key;
$$;

-- Before opening, review does not extend pregame source-line lifetime. Once
-- OPEN, reviewed identities still permit ordinary game bets after quote expiry.
-- Week 2 cutover separately requires fresh player_catalog_complete evidence.
-- Frozen identities retain their accepted policy and cannot be substituted.
create or replace function private.player_props_menu_reviewed(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.player_props_menu_eligible(p_week_id) and
 exists(select 1 from private.slate_items i where i.week_id=p_week_id and private.is_effective_slate_item(i.id))
 and (select count(*) from private.week_player_menu where week_id=p_week_id)=6*(select count(distinct event_id)
 from private.slate_items i where i.week_id=p_week_id and private.is_effective_slate_item(i.id))
 and not exists(select 1 from private.week_player_menu where week_id=p_week_id and confirmed_at is null)
 and not exists(select 1 from private.week_player_menu m where m.week_id=p_week_id and m.source_policy='NFLVERSE_PRIMARY'
 and m.frozen_at is null and m.subject_id is not null and not exists(select 1 from private.season_weeks w where w.id=m.week_id and w.state='OPEN') and not exists(select 1 from private.player_menu_candidates(m.event_id,m.team,m.slot)c where c.subject_id=m.subject_id));
$$;

-- Index new evidence references without exposing private records through RLS.
create index player_result_policy_validation_idx on private.player_result_policy(source_validation_id) where source_validation_id is not null;
create index player_event_source_validation_idx on private.player_result_event_mappings(source_validation_id) where source_validation_id is not null;
create index player_menu_source_validation_idx on private.week_player_menu(source_validation_id) where source_validation_id is not null;
create index player_nomination_validation_idx on private.player_catalog_nomination_generations(source_validation_id);
create index player_nomination_head_generation_idx on private.player_catalog_nomination_heads(generation_id);
create index player_exception_event_idx on private.player_verified_exceptions(event_id);
create index player_exception_subject_idx on private.player_verified_exceptions(subject_id);
create index player_exception_observation_idx on private.player_verified_exceptions(observation_id);
create index player_exception_candidate_idx on private.player_verified_exceptions(candidate_id);
create index player_exception_actor_idx on private.player_verified_exceptions(actor_user_id);
create index player_exception_bundle_idx on private.player_verified_exceptions(evidence_bundle_id);
