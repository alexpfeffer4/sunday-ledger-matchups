-- Additive and disabled: immutable player evidence extends the existing grading
-- and weekly rebuild. No provider request, scheduler or offer is activated here.
alter table private.settlement_versions add column player_evidence_bundle_id uuid;
alter table private.settlement_versions drop constraint settlement_versions_receipt_id_result_version_id_key;
create unique index settlement_versions_main_identity on private.settlement_versions(receipt_id,result_version_id) where player_evidence_bundle_id is null;

create table private.player_result_policy (
 singleton boolean primary key default true check(singleton),
 processing_enabled boolean not null default false,
 api_sports_contract_validated boolean not null default false,
 nflverse_contract_validated boolean not null default false,
 results_daily_limit integer not null default 80 check(results_daily_limit between 1 and 80),
 metadata_daily_limit integer not null default 20 check(metadata_daily_limit between 0 and 20),
 requests_per_minute integer not null default 8 check(requests_per_minute between 1 and 8),
 provider_remaining integer check(provider_remaining>=0),
 provider_window_date date not null default (clock_timestamp() at time zone 'UTC')::date,
 provider_observed_at timestamptz,
 blocked_until timestamptz,
 policy_version text not null default 'LEDGER_OFFENSIVE_PARTICIPATION_V1' check(policy_version='LEDGER_OFFENSIVE_PARTICIPATION_V1')
);
insert into private.player_result_policy(singleton) values(true);

create table private.player_result_event_mappings (
 external_event_id text primary key,
 api_sports_event_id text not null unique,
 nflverse_event_id text not null unique,
 game_date date not null, away_team text not null,home_team text not null,
 verified_at timestamptz not null,
 evidence_hash text not null check(evidence_hash ~ '^[0-9a-f]{64}$'),
 check(away_team<>home_team)
);
create table private.player_result_observations (
 id uuid primary key default gen_random_uuid(),
 provider text not null check(provider in('API_SPORTS','NFLVERSE')),
 external_event_id text not null references private.player_result_event_mappings(external_event_id),
 source_event_id text not null, external_player_id text not null,
 subject_id uuid not null references private.player_subjects(id),
 team text not null, game_date date not null,
 statistic text not null check(statistic in('PASSING_YARDS','RUSHING_YARDS','RECEIVING_YARDS')),
 period text not null check(period='FULL_GAME'),
 value integer check(value between -1000 and 2000), complete boolean not null,
 participation text not null check(participation in('UNKNOWN','OFFENSE','NO_OFFENSE')),
 participation_complete boolean not null,
 source_updated_at timestamptz,participation_source_updated_at timestamptz,fetched_at timestamptz not null,
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 check(not complete or value is not null),
 check(participation_complete=(participation<>'UNKNOWN')),
 check(source_updated_at<=fetched_at),
 check(participation_source_updated_at<=fetched_at),
 unique(provider,external_event_id,subject_id,statistic,period,content_hash)
);
create index player_result_observations_latest on private.player_result_observations(external_event_id,subject_id,statistic,provider,source_updated_at desc);
create table private.player_evidence_bundles (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references private.sports_events(id),
 subject_id uuid not null references private.player_subjects(id),
 statistic text not null, period text not null check(period='FULL_GAME'),
 version integer not null check(version>0),
 result_version_id uuid not null references private.event_result_versions(id),
 statistic_observation_id uuid references private.player_result_observations(id),
 participation_observation_id uuid not null references private.player_result_observations(id),
 value integer,participation text not null check(participation in('OFFENSE','NO_OFFENSE')),
 policy_version text not null check(policy_version='LEDGER_OFFENSIVE_PARTICIPATION_V1'),
 supersedes_id uuid references private.player_evidence_bundles(id),
 reason text not null,created_at timestamptz not null default clock_timestamp(),
 check(participation='NO_OFFENSE' or (value is not null and statistic_observation_id is not null)),
 unique(event_id,subject_id,statistic,period,version)
);
alter table private.settlement_versions add foreign key(player_evidence_bundle_id) references private.player_evidence_bundles(id);
create unique index settlement_versions_player_identity on private.settlement_versions(receipt_id,result_version_id,player_evidence_bundle_id) where player_evidence_bundle_id is not null;
create table private.player_result_candidates (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references private.sports_events(id),
 subject_id uuid not null references private.player_subjects(id),statistic text not null,
 statistic_observation_id uuid references private.player_result_observations(id),
 participation_observation_id uuid not null references private.player_result_observations(id),
 evidence_hash text not null,reason text not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(event_id,subject_id,statistic,evidence_hash)
);
create table private.player_result_decisions (
 id uuid primary key default gen_random_uuid(),candidate_id uuid not null unique references private.player_result_candidates(id),
 actor_user_id uuid not null references private.profiles(id), reason text not null check(char_length(reason) between 3 and 500),
 evidence_bundle_id uuid not null references private.player_evidence_bundles(id),
 created_at timestamptz not null default clock_timestamp()
);
create table private.player_result_jobs (
 external_event_id text primary key references private.player_result_event_mappings(external_event_id),
 final_observed_at timestamptz not null,
 state text not null default 'WAITING' check(state in('WAITING','RUNNING','COMPLETE','INCIDENT')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_id uuid,lease_until timestamptz,
 incident_code text, completed_at timestamptz,
 last_attempt_at timestamptz
);
create table private.player_result_requests (
 id uuid primary key default gen_random_uuid(),
 external_event_id text references private.player_result_jobs(external_event_id),
 request_class text not null check(request_class in('RESULT','METADATA')),
 reserved_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz, succeeded boolean,
 provider_remaining integer check(provider_remaining>=0)
);
create index player_result_requests_budget on private.player_result_requests(reserved_at,request_class);
create index player_result_jobs_due on private.player_result_jobs(next_attempt_at) where state in('WAITING','RUNNING');

do $security$
declare t text;
begin
 foreach t in array array['player_result_policy','player_result_event_mappings','player_result_observations','player_evidence_bundles','player_result_candidates','player_result_decisions','player_result_jobs','player_result_requests'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
 foreach t in array array['player_result_observations','player_evidence_bundles','player_result_candidates','player_result_decisions'] loop
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_competitive_mutation()',t||'_append_only',t);
 end loop;
end;
$security$;

create function private.grade_player_prop_receipt(p_outcome text,p_line_milli integer,p_odds integer,p_stake integer,p_status text,p_value integer,p_complete boolean,p_participation text,p_participation_complete boolean)
returns table(outcome text,returned_centicredits bigint) language plpgsql immutable set search_path='' as $$
declare delta integer;
begin
 if p_status='VOID' then outcome:='VOID';
 elsif p_status<>'FINAL' or not coalesce(p_participation_complete,false) or p_participation='UNKNOWN' then return;
 elsif p_participation='NO_OFFENSE' then outcome:='VOID';
 elsif not coalesce(p_complete,false) or p_value is null then return;
 else
  if p_outcome not in('OVER','UNDER') or p_line_milli is null then raise exception using errcode='22023',message='Invalid player proposition.'; end if;
  delta:=p_value*1000-p_line_milli;
  outcome:=case when delta=0 then 'PUSH' when (delta>0)=(p_outcome='OVER') then 'WIN' else 'LOSS' end;
 end if;
 returned_centicredits:=private.stage1_return_centicredits(p_stake,p_odds,outcome);return next;
end; $$;

create function private.settle_receipt_with_evidence(p_receipt_id uuid,p_result_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r private.position_receipts%rowtype;e private.event_result_versions%rowtype;b private.player_evidence_bundles%rowtype;g record;previous_id uuid;
begin
 select * into strict r from private.position_receipts where id=p_receipt_id;
 select * into strict e from private.event_result_versions where id=p_result_id and event_id=r.event_id;
 select id into previous_id from private.settlement_versions where receipt_id=r.id order by created_at desc,id desc limit 1;
 if r.subject_id is null then
  select * into strict g from private.grade_stage1_receipt(r.market_type,r.outcome_key,r.line_milli,r.american_odds,r.stake_credits,e.status,e.away_score,e.home_score);
 else
  select * into b from private.player_evidence_bundles where event_id=r.event_id and subject_id=r.subject_id and statistic=r.statistic and period=r.period order by version desc limit 1;
  select * into g from private.grade_player_prop_receipt(r.outcome_key,r.line_milli,r.american_odds,r.stake_credits,e.status,b.value,b.value is not null,b.participation,b.id is not null);
  if not found then return; end if;
 end if;
 insert into private.settlement_versions(receipt_id,result_version_id,week_id,league_id,owner_user_id,outcome,returned_centicredits,supersedes_id,player_evidence_bundle_id)
 values(r.id,e.id,r.week_id,r.league_id,r.owner_user_id,g.outcome,g.returned_centicredits,previous_id,b.id)
 on conflict do nothing;
end; $$;
-- Replace only the receipt loop; all existing rolling completion, postseason,
-- standings, automatic finalization and correction semantics remain authoritative.
do $rebuild$
declare d text; start_at integer;end_at integer;
begin
 d:=pg_get_functiondef('private.recompute_stage1_week(uuid,uuid)'::regprocedure);
 start_at:=strpos(d,'    select * into v_previous_settlement');
 end_at:=strpos(d,'  end loop;');
 if start_at=0 or end_at<=start_at or strpos(substring(d from start_at for end_at-start_at),'on conflict (receipt_id, result_version_id) do nothing;')=0 then raise exception 'Player grading rebuild anchor changed';end if;
 d:=substring(d from 1 for start_at-1)||'    perform private.settle_receipt_with_evidence(v_receipt.id,v_result.id);'||chr(10)||substring(d from end_at);
 execute d;
end;
$rebuild$;

create function private.publish_player_evidence(p_event_id uuid,p_subject_id uuid,p_statistic text,p_stat_id uuid,p_part_id uuid,p_reason text,p_protected_week17 boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare e private.sports_events%rowtype;w private.season_weeks%rowtype;t private.event_result_versions%rowtype;s private.player_result_observations%rowtype;p private.player_result_observations%rowtype;b private.player_evidence_bundles%rowtype;new_id uuid;
begin
 select * into strict e from private.sports_events where id=p_event_id;
 perform 1 from private.seasons where id=e.season_id for update;
 select * into strict w from private.season_weeks where id=e.week_id for update;
 perform 1 from private.sports_events where id=e.id for update;
 select * into t from private.event_result_versions where event_id=e.id order by version desc limit 1;
 if t.id is null or t.status<>'FINAL' or e.actual_started_at is null then return null;end if;
 select * into strict p from private.player_result_observations where id=p_part_id and external_event_id=e.fixture_event_key and subject_id=p_subject_id and statistic=p_statistic and period='FULL_GAME' and participation_complete;
 if p_stat_id is not null then select * into strict s from private.player_result_observations where id=p_stat_id and external_event_id=e.fixture_event_key and subject_id=p_subject_id and statistic=p_statistic and period='FULL_GAME' and complete;end if;
 if p.participation='OFFENSE' and s.id is null then return null;end if;
 select * into b from private.player_evidence_bundles where event_id=e.id and subject_id=p_subject_id and statistic=p_statistic and period='FULL_GAME' order by version desc limit 1;
 if b.id is not null and b.value is not distinct from (case when p.participation='OFFENSE' then s.value else null end) and b.participation=p.participation then return b.id;end if;
 if (w.state not in('LOCKED','PROVISIONAL','FINAL') and not(w.state='OPEN' and private.is_rolling_week(w.id))) or (w.state='FINAL' and w.finalization_mode<>'AFTER_RESULTS') or (w.state in('PROVISIONAL','FINAL') and (w.correction_window_closes_at is null or private.stage1_season_time(e.season_id)>=w.correction_window_closes_at)) then
  if not (p_protected_week17 and w.nfl_week=17 and w.state='FINAL' and exists(select 1 from private.seasons season where season.id=e.season_id and season.lifecycle in('CHAMPION_FINAL','WEEK_18_EXHIBITION','FINAL')) and exists(select 1 from private.playoff_publications pub where pub.season_id=e.season_id and pub.publication_stage='CHAMPION_FINAL')) then
   raise exception using errcode='55000',message='The correction window is closed; player evidence requires protected-result review.';
  end if;
 end if;
 insert into private.player_evidence_bundles(event_id,subject_id,statistic,period,version,result_version_id,statistic_observation_id,participation_observation_id,value,participation,policy_version,supersedes_id,reason)
 values(e.id,p_subject_id,p_statistic,'FULL_GAME',coalesce(b.version,0)+1,t.id,s.id,p.id,case when p.participation='OFFENSE' then s.value else null end,p.participation,'LEDGER_OFFENSIVE_PARTICIPATION_V1',b.id,p_reason) returning id into new_id;
 perform private.recompute_stage1_week(w.id,t.id);
 if b.id is not null and not p_protected_week17 then
  insert into private.corrections(league_id,week_id,event_id,original_result_version_id,corrected_result_version_id,reason,actor_user_id,before_summary,after_summary,original_player_evidence_bundle_id,corrected_player_evidence_bundle_id)
  values(e.league_id,w.id,e.id,t.id,t.id,p_reason,coalesce(auth.uid(),(select user_id from private.league_memberships where league_id=e.league_id and role='COMMISSIONER' order by user_id limit 1)),
   jsonb_build_object('playerEvidenceBundleId',b.id,'playerValue',b.value,'playerParticipation',b.participation),
   jsonb_build_object('playerEvidenceBundleId',new_id,'playerValue',case when p.participation='OFFENSE' then s.value else null end,'playerParticipation',p.participation),b.id,new_id);
 end if;
 return new_id;
end; $$;

create function private.reconcile_player_event(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare e private.sports_events%rowtype;r record;s private.player_result_observations%rowtype;a private.player_result_observations%rowtype;n private.player_result_observations%rowtype;p private.player_result_observations%rowtype;b private.player_evidence_bundles%rowtype;previous_stat private.player_result_observations%rowtype;previous_part private.player_result_observations%rowtype;h text;reason text;
begin
 select * into strict e from private.sports_events where id=p_event_id;
 perform 1 from private.seasons where id=e.season_id for update;
 perform 1 from private.season_weeks where id=e.week_id for update;
 perform 1 from private.sports_events where id=e.id for update;
 for r in select distinct subject_id,statistic from private.position_receipts where event_id=e.id and subject_id is not null order by subject_id,statistic loop
  select * into a from private.player_result_observations where external_event_id=e.fixture_event_key and subject_id=r.subject_id and statistic=r.statistic and complete and provider='API_SPORTS' order by coalesce(source_updated_at,fetched_at) desc,created_at desc,id desc limit 1;
  select * into n from private.player_result_observations where external_event_id=e.fixture_event_key and subject_id=r.subject_id and statistic=r.statistic and complete and provider='NFLVERSE' order by coalesce(source_updated_at,fetched_at) desc,created_at desc,id desc limit 1;
  if a.id is not null then s:=a;else s:=n;end if;
  select * into p from private.player_result_observations where external_event_id=e.fixture_event_key and subject_id=r.subject_id and statistic=r.statistic and participation_complete order by (provider='NFLVERSE') desc,coalesce(participation_source_updated_at,source_updated_at,fetched_at) desc,created_at desc,id desc limit 1;
  if p.id is null or (s.id is null and p.participation<>'NO_OFFENSE') then continue;end if;
  reason:=null;
  if a.id is not null and n.id is not null and a.value<>n.value then reason:='SOURCE_STATISTIC_DISAGREEMENT';
  elsif p.participation='NO_OFFENSE' and exists(select 1 from private.player_result_observations where external_event_id=e.fixture_event_key and subject_id=r.subject_id and statistic=r.statistic and participation='OFFENSE') then reason:='SOURCE_PARTICIPATION_DISAGREEMENT';
  end if;
  select * into b from private.player_evidence_bundles where event_id=e.id and subject_id=r.subject_id and statistic=r.statistic order by version desc limit 1;
  if b.statistic_observation_id is not null then
   select * into previous_stat from private.player_result_observations where id=b.statistic_observation_id;
   if s.id is not null and s.id<>previous_stat.id and s.value is distinct from b.value
    and (s.source_updated_at is null or previous_stat.source_updated_at is null or s.source_updated_at<=previous_stat.source_updated_at) then
    reason:='SOURCE_REVISION_ORDER_UNVERIFIED';
   end if;
  end if;
  if b.participation_observation_id is not null and p.participation is distinct from b.participation then
   select * into previous_part from private.player_result_observations where id=b.participation_observation_id;
   if coalesce(p.participation_source_updated_at,p.source_updated_at) is null
    or coalesce(previous_part.participation_source_updated_at,previous_part.source_updated_at) is null
    or coalesce(p.participation_source_updated_at,p.source_updated_at)<=coalesce(previous_part.participation_source_updated_at,previous_part.source_updated_at) then
    reason:='SOURCE_REVISION_ORDER_UNVERIFIED';
   end if;
  end if;
  if reason is null then
   begin perform private.publish_player_evidence(e.id,r.subject_id,r.statistic,s.id,p.id,'Official player statistics or participation were updated.');
   exception when sqlstate '55000' then reason:='PROTECTED_RESULT_REVIEW_REQUIRED';end;
  end if;
  if reason is not null then
   h:=encode(extensions.digest(coalesce(s.id::text,'')||':'||p.id::text||':'||coalesce(n.id::text,'')||':'||reason,'sha256'),'hex');
   insert into private.player_result_candidates(event_id,subject_id,statistic,statistic_observation_id,participation_observation_id,evidence_hash,reason) values(e.id,r.subject_id,r.statistic,s.id,p.id,h,reason) on conflict do nothing;
  end if;
 end loop;
end; $$;

create function api.resolve_player_result_candidate(p_candidate_id uuid,p_statistic_observation_id uuid,p_participation_observation_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.player_result_candidates%rowtype;e private.sports_events%rowtype;b uuid;d private.player_result_decisions%rowtype;
begin
 select * into strict c from private.player_result_candidates where id=p_candidate_id;
 select * into strict e from private.sports_events where id=c.event_id;
 if auth.uid() is null or not private.is_league_commissioner(e.league_id) then raise exception using errcode='42501',message='Commissioner membership required.';end if;
 if char_length(btrim(p_reason)) not between 3 and 500 then raise exception using errcode='22023',message='A verified-evidence reason is required.';end if;
 perform 1 from private.seasons where id=e.season_id for update;
 perform 1 from private.season_weeks where id=e.week_id for update;
 select * into d from private.player_result_decisions where candidate_id=c.id;
 if d.id is not null then
  if d.reason<>btrim(p_reason) or not exists(select 1 from private.player_evidence_bundles eb where eb.id=d.evidence_bundle_id and eb.statistic_observation_id is not distinct from p_statistic_observation_id and eb.participation_observation_id=p_participation_observation_id) then raise exception using errcode='22000',message='Candidate was already resolved with different evidence.';end if;
  return jsonb_build_object('evidenceBundleId',d.evidence_bundle_id,'replayed',true);end if;
 b:=private.publish_player_evidence(e.id,c.subject_id,c.statistic,p_statistic_observation_id,p_participation_observation_id,btrim(p_reason));
 if b is null then raise exception using errcode='55000',message='Complete player evidence and a final game are required.';end if;
 insert into private.player_result_decisions(candidate_id,actor_user_id,reason,evidence_bundle_id) values(c.id,auth.uid(),btrim(p_reason),b);
 return jsonb_build_object('evidenceBundleId',b,'replayed',false);
end; $$;

create function api.import_player_result_observations(p_observations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o jsonb;m private.player_result_event_mappings%rowtype;e record;count_imported integer:=0;h text;provider_name text;
begin
 if jsonb_typeof(p_observations)<>'array' or jsonb_array_length(p_observations)>96 then raise exception using errcode='22023',message='Player observation batch must contain at most 96 rows.';end if;
 for o in select value from jsonb_array_elements(p_observations) loop
  provider_name:=o->>'provider';
  select * into strict m from private.player_result_event_mappings where external_event_id=o->>'externalEventId';
  if provider_name not in('API_SPORTS','NFLVERSE') or o->>'sourceEventId'<>(case provider_name when 'API_SPORTS' then m.api_sports_event_id else m.nflverse_event_id end) or (o->>'gameDate')::date<>m.game_date or o->>'team' not in(m.away_team,m.home_team) or (o->>'fetchedAt')::timestamptz>clock_timestamp()+interval '1 minute' then raise exception using errcode='22023',message='Unverified player result event identity.';end if;
  if not exists(select 1 from private.player_provider_mappings p where p.provider=provider_name and p.external_event_id=m.external_event_id and p.external_player_id=o->>'externalPlayerId' and p.subject_id=(o->>'subjectId')::uuid and p.team=o->>'team' and p.game_date=m.game_date and p.result_path_verified) then raise exception using errcode='22023',message='Unverified player result mapping.';end if;
  h:=encode(extensions.digest((o-'fetchedAt'-'contentHash')::text,'sha256'),'hex');
  insert into private.player_result_observations(provider,external_event_id,source_event_id,external_player_id,subject_id,team,game_date,statistic,period,value,complete,participation,participation_complete,source_updated_at,participation_source_updated_at,fetched_at,content_hash)
  values(provider_name,m.external_event_id,o->>'sourceEventId',o->>'externalPlayerId',(o->>'subjectId')::uuid,o->>'team',m.game_date,o->>'statistic',o->>'period',(o->>'value')::integer,(o->>'complete')::boolean,o->>'participation',(o->>'participationComplete')::boolean,(o->>'sourceUpdatedAt')::timestamptz,coalesce((o->>'participationSourceUpdatedAt')::timestamptz,(o->>'sourceUpdatedAt')::timestamptz),(o->>'fetchedAt')::timestamptz,h) on conflict do nothing;
  if found then count_imported:=count_imported+1;end if;
 end loop;
 for e in select distinct ev.id,ev.season_id,ev.week_id from private.sports_events ev join private.seasons s on s.id=ev.season_id where ev.fixture_event_key in(select value->>'externalEventId' from jsonb_array_elements(p_observations)) and s.mode='LIVE' and exists(select 1 from private.position_receipts r where r.event_id=ev.id and r.subject_id is not null) order by ev.season_id,ev.week_id,ev.id loop
  perform private.reconcile_player_event(e.id);
 end loop;
 return jsonb_build_object('imported',count_imported);
end; $$;

alter table private.player_result_jobs add column next_reconcile_at timestamptz;
alter table private.player_result_jobs add column reconcile_attempts integer not null default 0 check(reconcile_attempts between 0 and 7);
alter table private.player_result_jobs add column reconcile_lease_id uuid;
alter table private.player_result_jobs add column reconcile_lease_until timestamptz;

create function private.player_result_event_context(p_external_event_id text,p_provider text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('externalEventId',m.external_event_id,'sourceEventId',case p_provider when 'API_SPORTS' then m.api_sports_event_id else m.nflverse_event_id end,
 'gameDate',m.game_date,'final',true,'mappings',coalesce((select jsonb_agg(jsonb_build_object('subjectId',p.subject_id,'externalPlayerId',p.external_player_id,'team',p.team,'sourceTeam',coalesce(p.source_team,p.team),'pfrPlayerId',p.secondary_player_id,'statistic',r.statistic) order by p.subject_id,r.statistic)
 from private.player_provider_mappings p join(select distinct r.subject_id,r.statistic from private.position_receipts r join private.sports_events e on e.id=r.event_id join private.seasons s on s.id=e.season_id where e.fixture_event_key=m.external_event_id and s.mode='LIVE' and r.subject_id is not null)r on r.subject_id=p.subject_id
 where p.external_event_id=m.external_event_id and p.provider=p_provider and p.game_date=m.game_date and p.result_path_verified),'[]'::jsonb)) from private.player_result_event_mappings m where m.external_event_id=p_external_event_id;
$$;

create function private.enqueue_player_result_jobs()
returns void language sql security definer set search_path='' as $$
 insert into private.player_result_jobs(external_event_id,final_observed_at,next_reconcile_at)
 select e.fixture_event_key,min(result.created_at),clock_timestamp() from private.sports_events e
 join private.seasons s on s.id=e.season_id and s.mode='LIVE'
 join private.player_result_event_mappings m on m.external_event_id=e.fixture_event_key and m.away_team=e.away_team and m.home_team=e.home_team and m.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date
 join private.event_result_versions result on result.event_id=e.id and result.status='FINAL'
 where e.actual_started_at is not null and exists(select 1 from private.position_receipts r where r.event_id=e.id and r.subject_id is not null)
 group by e.fixture_event_key on conflict do nothing;
$$;

-- API-Sports documents daily reset at 00:00 UTC. Reset only this provider's
-- conservative headroom, never reservation history or the independent Odds API.
create function private.roll_player_result_budget_day()
returns void language plpgsql security definer set search_path='' as $$
begin
 update private.player_result_policy set provider_window_date=(clock_timestamp() at time zone 'UTC')::date,
 provider_remaining=100,provider_observed_at=null
 where singleton and provider_window_date<(clock_timestamp() at time zone 'UTC')::date;
end; $$;

create function api.claim_player_result_jobs()
returns jsonb language plpgsql security definer set search_path='' as $$
declare policy private.player_result_policy%rowtype;j private.player_result_jobs%rowtype;lease uuid;result jsonb:='[]';available integer;reserved_today integer;reserved_minute integer;now_at timestamptz:=clock_timestamp();
begin
 perform private.roll_player_result_budget_day();
 select * into strict policy from private.player_result_policy where singleton for update;
 if not policy.processing_enabled or not policy.api_sports_contract_validated then return jsonb_build_object('status','DISABLED','jobs',result);end if;
 if policy.blocked_until>now_at then return jsonb_build_object('status','BACKOFF','jobs',result);end if;
 perform private.enqueue_player_result_jobs();
 select count(*) into reserved_today from private.player_result_requests where request_class='RESULT' and reserved_at>=date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC';
 select count(*) into reserved_minute from private.player_result_requests where reserved_at>now_at-interval '1 minute';
 available:=least(policy.results_daily_limit-reserved_today,policy.requests_per_minute-reserved_minute,coalesce(policy.provider_remaining,100),8);
 if available<=0 then return jsonb_build_object('status','BUDGET','jobs',result);end if;
 -- Expired requests remain charged; their next claim is a new bounded attempt.
 update private.player_result_jobs set state='INCIDENT',incident_code='PLAYER_EVIDENCE_UNRESOLVED',lease_id=null,lease_until=null where attempts>=5 and state in('RUNNING','WAITING') and (lease_until is null or lease_until<=now_at);
 for j in select * from private.player_result_jobs where state in('WAITING','RUNNING') and next_attempt_at<=now_at and attempts<5 and (lease_until is null or lease_until<=now_at) order by next_attempt_at,external_event_id limit available for update skip locked loop
  if not exists(select 1 from private.position_receipts r join private.sports_events e on e.id=r.event_id where e.fixture_event_key=j.external_event_id and r.subject_id is not null and not exists(select 1 from private.settlement_versions sv where sv.receipt_id=r.id)) then
   update private.player_result_jobs set state='COMPLETE',completed_at=now_at where external_event_id=j.external_event_id;continue;
  end if;
  insert into private.player_result_requests(external_event_id,request_class) values(j.external_event_id,'RESULT') returning id into lease;
  update private.player_result_jobs set state='RUNNING',attempts=attempts+1,lease_id=lease,lease_until=now_at+interval '90 seconds',last_attempt_at=now_at where external_event_id=j.external_event_id;
  result:=result||jsonb_build_array(jsonb_build_object('leaseId',lease,'context',private.player_result_event_context(j.external_event_id,'API_SPORTS')));
 end loop;
 -- Decrease conservative headroom at reservation time, never refund unknown failures.
 if policy.provider_remaining is not null then update private.player_result_policy set provider_remaining=greatest(0,provider_remaining-jsonb_array_length(result)) where singleton;end if;
 return jsonb_build_object('status',case when jsonb_array_length(result)=0 then 'IDLE' else 'CLAIMED' end,'jobs',result);
end; $$;

create function api.reserve_player_metadata_request()
returns uuid language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;new_id uuid;n integer;
begin
 perform private.roll_player_result_budget_day();
 select * into strict p from private.player_result_policy where singleton for update;
 if not p.processing_enabled or p.blocked_until>clock_timestamp() or p.provider_remaining=0 then raise exception using errcode='55000',message='Statistics metadata requests unavailable.';end if;
 select count(*) into n from private.player_result_requests where request_class='METADATA' and reserved_at>=(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC');
 if n>=p.metadata_daily_limit or (select count(*) from private.player_result_requests where reserved_at>clock_timestamp()-interval '1 minute')>=p.requests_per_minute then raise exception using errcode='55000',message='Statistics metadata budget exhausted.';end if;
 insert into private.player_result_requests(request_class) values('METADATA') returning id into new_id;
 if p.provider_remaining is not null then update private.player_result_policy set provider_remaining=greatest(0,provider_remaining-1) where singleton;end if;
 return new_id;
end; $$;

create function api.complete_player_result_request(p_request_id uuid,p_observations jsonb default null,p_remaining integer default null,p_rate_limit integer default null,p_retry_after_seconds integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare req private.player_result_requests%rowtype;j private.player_result_jobs%rowtype;unresolved boolean;offset_minutes integer;now_at timestamptz:=clock_timestamp();
begin
 perform private.roll_player_result_budget_day();
 perform 1 from private.player_result_policy where singleton for update;
 select * into strict req from private.player_result_requests where id=p_request_id for update;
 if req.completed_at is not null then return jsonb_build_object('status','REPLAYED');end if;
 if p_remaining is not null and (req.reserved_at at time zone 'UTC')::date=(now_at at time zone 'UTC')::date then update private.player_result_policy set provider_remaining=least(coalesce(provider_remaining,p_remaining),greatest(0,p_remaining)),provider_observed_at=now_at where singleton;end if;
 if p_rate_limit is not null and p_rate_limit>0 then update private.player_result_policy set requests_per_minute=least(requests_per_minute,p_rate_limit) where singleton;end if;
 if p_retry_after_seconds is not null then update private.player_result_policy set blocked_until=greatest(coalesce(blocked_until,now_at),now_at+make_interval(secs=>greatest(60,least(p_retry_after_seconds,86400)))) where singleton;end if;
 update private.player_result_requests set completed_at=now_at,succeeded=p_observations is not null,provider_remaining=p_remaining where id=req.id;
 if req.request_class='METADATA' then return jsonb_build_object('status','RECORDED');end if;
 select * into strict j from private.player_result_jobs where external_event_id=req.external_event_id for update;
 if j.lease_id is distinct from req.id or j.lease_until<=now_at then return jsonb_build_object('status','EXPIRED');end if;
 if p_observations is not null then
  if exists(select 1 from jsonb_array_elements(p_observations) o where o->>'externalEventId'<>j.external_event_id or o->>'provider'<>'API_SPORTS') then raise exception using errcode='22023',message='Result lease does not cover the observations.';end if;
  perform api.import_player_result_observations(p_observations);
 end if;
 select exists(select 1 from private.position_receipts r join private.sports_events e on e.id=r.event_id where e.fixture_event_key=j.external_event_id and r.subject_id is not null and not exists(select 1 from private.settlement_versions sv where sv.receipt_id=r.id)) into unresolved;
 offset_minutes:=(array[5,15,30,60])[j.attempts];
 update private.player_result_jobs set state=case when not unresolved then 'COMPLETE' when j.attempts>=5 then 'INCIDENT' else 'WAITING' end,
 completed_at=case when not unresolved then now_at else null end,lease_id=null,lease_until=null,
 next_attempt_at=greatest(now_at+interval '1 minute',j.final_observed_at+make_interval(mins=>coalesce(offset_minutes,60))),
 incident_code=case when unresolved and j.attempts>=5 then 'PLAYER_EVIDENCE_UNRESOLVED' end where external_event_id=j.external_event_id;
 return jsonb_build_object('status',case when unresolved then 'PENDING' else 'COMPLETE' end);
end; $$;

create function api.claim_nflverse_reconciliation()
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;j private.player_result_jobs%rowtype;items jsonb:='[]';lease uuid:=gen_random_uuid();
begin
 perform private.roll_player_result_budget_day();
 select * into strict p from private.player_result_policy where singleton for update;
 if not p.processing_enabled or not p.nflverse_contract_validated then return jsonb_build_object('status','DISABLED','jobs',items);end if;
 perform private.enqueue_player_result_jobs();
 for j in select * from private.player_result_jobs where next_reconcile_at<=clock_timestamp() and reconcile_attempts<7 and final_observed_at>clock_timestamp()-interval '49 hours' and (reconcile_lease_until is null or reconcile_lease_until<=clock_timestamp()) order by final_observed_at,external_event_id limit 16 for update skip locked loop
  update private.player_result_jobs set reconcile_attempts=reconcile_attempts+1,reconcile_lease_id=lease,reconcile_lease_until=clock_timestamp()+interval '90 seconds' where external_event_id=j.external_event_id;
  items:=items||jsonb_build_array(jsonb_build_object('leaseId',lease,'context',private.player_result_event_context(j.external_event_id,'NFLVERSE')));
 end loop;
 return jsonb_build_object('status',case when jsonb_array_length(items)=0 then 'IDLE' else 'CLAIMED' end,'jobs',items);
end; $$;

create function api.complete_nflverse_reconciliation(p_lease_id uuid,p_observations jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.player_result_jobs%rowtype;now_at timestamptz:=clock_timestamp();
begin
 if not exists(select 1 from private.player_result_jobs where reconcile_lease_id=p_lease_id and reconcile_lease_until>now_at) then return jsonb_build_object('status','EXPIRED');end if;
 if p_observations is not null then
  if exists(select 1 from jsonb_array_elements(p_observations) o where o->>'provider'<>'NFLVERSE' or not exists(select 1 from private.player_result_jobs where reconcile_lease_id=p_lease_id and reconcile_lease_until>now_at and external_event_id=o->>'externalEventId')) then raise exception using errcode='22023',message='Reconciliation lease does not cover the observations.';end if;
  perform api.import_player_result_observations(p_observations);
 end if;
 for j in select * from private.player_result_jobs where reconcile_lease_id=p_lease_id for update loop
  update private.player_result_jobs set reconcile_lease_id=null,reconcile_lease_until=null,
   next_reconcile_at=(select min(j.final_observed_at+make_interval(mins=>m)) from unnest(array[60,120,360,720,1440,2880])m where j.final_observed_at+make_interval(mins=>m)>now_at),
   incident_code=case when j.reconcile_attempts>=7 then 'PLAYER_EVIDENCE_REQUIRES_VERIFIED_SOURCE' else incident_code end,
   state=case when not exists(select 1 from private.position_receipts r join private.sports_events e on e.id=r.event_id where e.fixture_event_key=j.external_event_id and r.subject_id is not null and not exists(select 1 from private.settlement_versions sv where sv.receipt_id=r.id)) then 'COMPLETE' when j.reconcile_attempts>=7 then 'INCIDENT' else state end
  where external_event_id=j.external_event_id;
 end loop;
 return jsonb_build_object('status','RECORDED');
end; $$;

-- Operator-only event crosswalk; requires already-published matching games and
-- verified provider documentation evidence. Never matches names heuristically.
create function api.register_player_result_event(p_mapping jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.sports_events e where e.fixture_event_key=p_mapping->>'externalEventId' and e.away_team=p_mapping->>'awayTeam' and e.home_team=p_mapping->>'homeTeam' and (e.scheduled_start_at at time zone 'America/New_York')::date=(p_mapping->>'gameDate')::date) then raise exception using errcode='22023',message='Result crosswalk must match a published event.';end if;
 insert into private.player_result_event_mappings(external_event_id,api_sports_event_id,nflverse_event_id,game_date,away_team,home_team,verified_at,evidence_hash)
 values(p_mapping->>'externalEventId',p_mapping->>'apiSportsEventId',p_mapping->>'nflverseEventId',(p_mapping->>'gameDate')::date,p_mapping->>'awayTeam',p_mapping->>'homeTeam',clock_timestamp(),p_mapping->>'evidenceHash')
 on conflict (external_event_id) do nothing;
 -- A durable acquisition retry reuses identical identity without rewriting its
 -- original evidence. Conflicting provider IDs must never silently remap a game.
 if not exists(select 1 from private.player_result_event_mappings m
  where m.external_event_id=p_mapping->>'externalEventId'
   and m.api_sports_event_id is not distinct from (p_mapping->>'apiSportsEventId')
   and m.nflverse_event_id is not distinct from (p_mapping->>'nflverseEventId')
   and m.game_date=(p_mapping->>'gameDate')::date
   and m.away_team=p_mapping->>'awayTeam' and m.home_team=p_mapping->>'homeTeam') then
  raise exception using errcode='22000',message='Result crosswalk identity conflicts with the registered event.';
 end if;
end; $$;

do $grants$
declare f record;
begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('grade_player_prop_receipt','settle_receipt_with_evidence','publish_player_evidence','reconcile_player_event','player_result_event_context','enqueue_player_result_jobs','roll_player_result_budget_day') loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api' and p.proname in('import_player_result_observations','claim_player_result_jobs','reserve_player_metadata_request','complete_player_result_request','claim_nflverse_reconciliation','complete_nflverse_reconciliation','register_player_result_event') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end;
$grants$;
revoke all on function api.resolve_player_result_candidate(uuid,uuid,uuid,text) from public,anon;
grant execute on function api.resolve_player_result_candidate(uuid,uuid,uuid,text) to authenticated;

-- Extend existing authorized projections; no new route or relaxed reveal gate.
do $readers$
declare signature text;d text;anchor text;
begin
 foreach signature in array array['api.get_stage1_state(text)','api.get_league_matchup_cards(text,uuid)'] loop
  d:=pg_get_functiondef(signature::regprocedure);
  anchor:='''returnedCenticredits'', settlement.returned_centicredits';
  if strpos(d,anchor)=0 then anchor:='''returnedCenticredits'',settlement.returned_centicredits';end if;
  if strpos(d,anchor)=0 then raise exception 'Player final-yard reader anchor changed: %',signature;end if;
  d:=replace(d,anchor,anchor||',''playerEvidenceVersion'',(select b.version from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id),''playerCorrectionReason'',(select b.reason from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id and b.version>1),''finalYards'',(select b.value from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id)');
  execute d;
 end loop;
end;
$readers$;

-- Only accepted props use faster finish detection. Existing bulk score requests
-- and their protected Odds API budget remain the sole team-status source.
-- The optional pipeline is disabled until the tested provider plan is approved.
do $finish_detection$
declare d text;anchor text;
begin
 d:=pg_get_functiondef('private.due_score_events(uuid,boolean)'::regprocedure);
 anchor:='and (p_manual or (coalesce(c.next_check_at,e.scheduled_start_at+interval ''2 minutes'')<=clock_timestamp()';
 if strpos(d,anchor)=0 then raise exception 'Player finish-detection anchor changed';end if;
 d:=replace(d,anchor,$new$and (p_manual or (exists(select 1 from private.player_result_policy where processing_enabled)
       and e.state='LIVE' and e.actual_started_at is not null
       and clock_timestamp() between e.scheduled_start_at+interval '165 minutes' and e.scheduled_start_at+interval '300 minutes'
       and coalesce(c.attempted_at,e.scheduled_start_at)<=clock_timestamp()-interval '5 minutes'
       and exists(select 1 from private.position_receipts r where r.event_id=e.id and r.subject_id is not null))
       or (coalesce(c.next_check_at,e.scheduled_start_at+interval '2 minutes')<=clock_timestamp()$new$);
 execute d;
end;
$finish_detection$;

-- Existing stored archives remain immutable. New archives retain prop identity.
do $archive_props$
declare d text;anchor text;
begin
 d:=pg_get_functiondef('private.live_archive_card(uuid)'::regprocedure);
 anchor:='''marketType'', receipt.market_type';
 if strpos(d,anchor)=0 then raise exception 'Player archive identity anchor changed';end if;
 d:=replace(d,anchor,anchor||',''subjectId'',receipt.subject_id,''subjectLabel'',receipt.subject_label,''subjectTeam'',receipt.subject_team,''subjectPosition'',receipt.subject_position,''statistic'',receipt.statistic,''period'',receipt.period,''serializationVersion'',receipt.receipt_serialization_version');
 anchor:='''returnedCenticredits'', settlement.returned_centicredits';
 if strpos(d,anchor)=0 then raise exception 'Player archive result anchor changed';end if;
 d:=replace(d,anchor,anchor||',''playerEvidenceVersion'',(select b.version from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id),''playerCorrectionReason'',(select b.reason from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id and b.version>1),''finalYards'',(select b.value from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id)');
 execute d;
end;
$archive_props$;

-- Player revisions participate in the existing objective correction lineage.
-- Team-result references may remain identical: no fictitious score revision.
alter table private.corrections add column original_player_evidence_bundle_id uuid references private.player_evidence_bundles(id);
alter table private.corrections add column corrected_player_evidence_bundle_id uuid references private.player_evidence_bundles(id);
create function api.resolve_finalized_week17_player_candidate(p_candidate_id uuid,p_statistic_observation_id uuid,p_participation_observation_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.player_result_candidates%rowtype;e private.sports_events%rowtype;w private.season_weeks%rowtype;s private.seasons%rowtype;d private.player_result_decisions%rowtype;b uuid;previous_b uuid;team_result uuid;correction uuid:=gen_random_uuid();previous_champion private.playoff_publications%rowtype;new_champion private.playoff_publications%rowtype;round18 private.playoff_round_publications%rowtype;archive private.season_archive_versions%rowtype;
begin
 select * into strict c from private.player_result_candidates where id=p_candidate_id;
 select * into strict e from private.sports_events where id=c.event_id;
 if auth.uid() is null or not private.is_league_commissioner(e.league_id) then raise exception using errcode='42501',message='Commissioner membership required.';end if;
 if char_length(btrim(p_reason)) not between 10 and 500 then raise exception using errcode='22023',message='An objective verified-evidence correction reason is required.';end if;
 select * into strict s from private.seasons where id=e.season_id for update;
 select * into strict w from private.season_weeks where id=e.week_id for update;
 perform 1 from private.sports_events where id=e.id for update;
 select * into d from private.player_result_decisions where candidate_id=c.id;
 if d.id is not null then
  if d.reason<>btrim(p_reason) or not exists(select 1 from private.player_evidence_bundles eb where eb.id=d.evidence_bundle_id and eb.statistic_observation_id is not distinct from p_statistic_observation_id and eb.participation_observation_id=p_participation_observation_id) then raise exception using errcode='22000',message='Candidate was already resolved with different evidence.';end if;
  return jsonb_build_object('evidenceBundleId',d.evidence_bundle_id,'replayed',true);
 end if;
 if w.nfl_week<>17 or w.state<>'FINAL' or s.lifecycle not in('CHAMPION_FINAL','WEEK_18_EXHIBITION','FINAL') then raise exception using errcode='55000',message='This correction authority is limited to finalized Week 17.';end if;
 select * into strict previous_champion from private.playoff_publications pub where pub.season_id=s.id and pub.publication_stage='CHAMPION_FINAL' and not exists(select 1 from private.playoff_publications successor where successor.supersedes_id=pub.id);
 select id into strict team_result from private.event_result_versions where event_id=e.id order by version desc limit 1;
 select id into previous_b from private.player_evidence_bundles where event_id=e.id and subject_id=c.subject_id and statistic=c.statistic order by version desc limit 1;
 b:=private.publish_player_evidence(e.id,c.subject_id,c.statistic,p_statistic_observation_id,p_participation_observation_id,btrim(p_reason),true);
 if b is null or b=previous_b then raise exception using errcode='22023',message='A protected correction must change complete objective player evidence.';end if;
 perform private.finalize_late_week_versions(w.id);
 insert into private.corrections(id,league_id,week_id,event_id,original_result_version_id,corrected_result_version_id,reason,actor_user_id,before_summary,after_summary,original_player_evidence_bundle_id,corrected_player_evidence_bundle_id)
 values(correction,e.league_id,w.id,e.id,team_result,team_result,btrim(p_reason),auth.uid(),jsonb_build_object('eventResultVersionId',team_result,'playerEvidenceBundleId',previous_b,'championPublicationId',previous_champion.id,'championEntryId',previous_champion.champion_entry_id),jsonb_build_object('eventResultVersionId',team_result,'playerEvidenceBundleId',b,'weekState','FINAL'),previous_b,b);
 new_champion:=private.append_phase8b_champion_publication(s.id,auth.uid(),correction);
 if exists(select 1 from private.playoff_round_publications r where r.season_id=s.id and r.nfl_week=18 and not exists(select 1 from private.playoff_round_publications next where next.supersedes_id=r.id)) then
  round18:=private.rebuild_week18_round_after_correction(s.id,new_champion.id,auth.uid());
 end if;
 if s.lifecycle='FINAL' then archive:=private.append_phase8b_archive(s.id,auth.uid(),correction);end if;
 perform private.assert_phase8_terminal_lineage(s.id);
 insert into private.player_result_decisions(candidate_id,actor_user_id,reason,evidence_bundle_id) values(c.id,auth.uid(),btrim(p_reason),b);
 return jsonb_build_object('evidenceBundleId',b,'correctionId',correction,'championPublicationId',new_champion.id,'previousChampionEntryId',previous_champion.champion_entry_id,'championEntryId',new_champion.champion_entry_id,'week18RoundId',round18.id,'archiveId',archive.id,'replayed',false);
end; $$;
revoke all on function api.resolve_finalized_week17_player_candidate(uuid,uuid,uuid,text) from public,anon;
grant execute on function api.resolve_finalized_week17_player_candidate(uuid,uuid,uuid,text) to authenticated;

-- A quota-free /status probe confirms the active account after UTC rollover.
-- Persist only quota facts, never the response's user/account/PII fields.
alter table private.player_result_policy add column status_probe_id uuid;
alter table private.player_result_policy add column status_probe_until timestamptz;
create function api.claim_player_statistics_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;lease uuid:=gen_random_uuid();
begin
 perform private.roll_player_result_budget_day();
 select * into strict p from private.player_result_policy where singleton for update;
 if not p.processing_enabled or not p.api_sports_contract_validated then return jsonb_build_object('status','DISABLED');end if;
 perform private.enqueue_player_result_jobs();
 if not exists(select 1 from private.player_result_jobs where state in('WAITING','RUNNING') and attempts<5 and next_attempt_at<=clock_timestamp()) or p.provider_observed_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC' then return jsonb_build_object('status','IDLE');end if;
 if p.status_probe_until>clock_timestamp() then return jsonb_build_object('status','BUSY');end if;
 update private.player_result_policy set status_probe_id=lease,status_probe_until=clock_timestamp()+interval '1 minute' where singleton;
 return jsonb_build_object('status','CLAIMED','leaseId',lease);
end; $$;
create function api.complete_player_statistics_status(p_lease_id uuid,p_active boolean,p_daily_limit integer,p_used integer,p_observed_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;in_flight integer;
begin
 select * into strict p from private.player_result_policy where singleton for update;
 if p.status_probe_id is distinct from p_lease_id or p.status_probe_until<=clock_timestamp() then raise exception using errcode='55000',message='Statistics status lease expired.';end if;
 if p_observed_at>clock_timestamp() or p_observed_at<p.status_probe_until-interval '1 minute' or p_daily_limit<1 or p_used<0 then raise exception using errcode='22023',message='Statistics status observation invalid.';end if;
 select count(*) into in_flight from private.player_result_requests where completed_at is null and reserved_at>=(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC');
 update private.player_result_policy set provider_remaining=greatest(0,least(100,p_daily_limit-p_used)-in_flight),provider_observed_at=p_observed_at,status_probe_id=null,status_probe_until=null,blocked_until=case when p_active then blocked_until else clock_timestamp()+interval '1 hour' end where singleton;
end; $$;
revoke all on function api.claim_player_statistics_status(),api.complete_player_statistics_status(uuid,boolean,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function api.claim_player_statistics_status(),api.complete_player_statistics_status(uuid,boolean,integer,integer,timestamptz) to service_role;

-- A player correction's impact starts at its own evidence revision, not at the
-- possibly much earlier unchanged team-score observation.
do $player_history$
declare d text;anchor text;
begin
 d:=pg_get_functiondef('api.get_weekly_close_state(text)'::regprocedure);
 anchor:='and affected.created_at >= corrected.created_at';
 if strpos(d,anchor)=0 then raise exception 'Player correction effects anchor changed';end if;
 d:=replace(d,anchor,'and affected.created_at >= coalesce((select b.created_at from private.player_evidence_bundles b where b.id=correction.corrected_player_evidence_bundle_id),corrected.created_at)');
 anchor:='''reason'', correction.reason,';
 if strpos(d,anchor)=0 then raise exception 'Player correction history anchor changed';end if;
 d:=replace(d,anchor,anchor||$new$
          'playerCorrection', (select jsonb_build_object('subjectLabel',subject.display_name,'statistic',after_player.statistic,
           'beforeYards',before_player.value,'afterYards',after_player.value,
           'beforeParticipation',before_player.participation,'afterParticipation',after_player.participation)
           from private.player_evidence_bundles after_player
           join private.player_subjects subject on subject.id=after_player.subject_id
           left join private.player_evidence_bundles before_player on before_player.id=correction.original_player_evidence_bundle_id
           where after_player.id=correction.corrected_player_evidence_bundle_id),$new$);
 execute d;
end;
$player_history$;

-- Stored complete evidence can arrive before the shared team-final observation.
-- Resolve it when finality is first known, using the same event/week authority.
do $player_results_after_final$
declare d text;anchor text;
begin
 d:=pg_get_functiondef('private.record_stage1_result_as(uuid,uuid,text,integer,integer,text,text,text)'::regprocedure);
 anchor:='  perform private.recompute_stage1_week(v_week.id, v_result_id);';
 if strpos(d,anchor)=0 then raise exception 'Player team-final reconciliation anchor changed';end if;
 d:=replace(d,anchor,'  perform private.reconcile_player_event(p_event_id);'||chr(10)||anchor);
 execute d;
end;
$player_results_after_final$;
