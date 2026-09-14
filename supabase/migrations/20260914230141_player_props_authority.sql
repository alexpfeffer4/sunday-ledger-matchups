-- Prepared Ruleset 1.4 / Product Bible 3.3. Additive support only: no active
-- catalog, opened week, existing receipt hash or Production offer setting changes.
create table private.prepared_player_props_rulesets (
 mode text primary key check(mode in ('LIVE','SIMULATION')),
 canonical_json jsonb not null,
 sha256_hash text not null check(sha256_hash ~ '^[0-9a-f]{64}$')
);
alter table private.prepared_player_props_rulesets enable row level security;
revoke all on private.prepared_player_props_rulesets from public,anon,authenticated;
insert into private.prepared_player_props_rulesets
select mode,j,encode(extensions.digest(private.canonical_ruleset_json(j),'sha256'),'hex')
from (select mode,jsonb_set(jsonb_set(jsonb_set(canonical_json,'{version}','"1.4"'),
 '{productBibleVersion}','"3.3"'),'{markets}',
 '{"eligible":["MONEYLINE","SPREAD","TOTAL","PLAYER_PASSING_YARDS","PLAYER_RUSHING_YARDS","PLAYER_RECEIVING_YARDS"],"referenceBook":"draftkings","playerProps":{"period":"FULL_GAME","includesOvertime":true,"slotsPerTeam":["QB_PASS","RB_RUSH","RECEIVER"],"menuFreeze":"FIRST_ACCEPTED_SUBMISSION","identity":"EVENT_PLAYER_STATISTIC_PERIOD","participation":"OFFENSIVE_PARTICIPATION_REQUIRED","zeroOffensiveSnaps":"VOID","unknownEvidence":"PENDING","injuryAfterParticipation":"GRADE_FINAL_STATISTIC"}}'::jsonb) j
from private.prepared_rolling_rulesets) packages;
create trigger prepared_player_props_rulesets_append_only before update or delete on private.prepared_player_props_rulesets
 for each row execute function private.reject_competitive_mutation();
create function private.player_props_ruleset_package(p_mode text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select canonical_json from private.prepared_player_props_rulesets where mode=p_mode;
$$;
create function private.is_player_props_week(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select r.ruleset_version='1.4' and r.canonical_json=private.player_props_ruleset_package(r.mode)
 from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.id=p_week_id),false);
$$;
create or replace function private.is_rolling_week(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select (r.ruleset_version='1.3' and r.canonical_json=private.rolling_ruleset_package(r.mode))
 or (r.ruleset_version='1.4' and r.canonical_json=private.player_props_ruleset_package(r.mode))
 from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.id=p_week_id),false);
$$;
revoke all on function private.player_props_ruleset_package(text),private.is_player_props_week(uuid),private.is_rolling_week(uuid) from public,anon,authenticated;

do $migration$
declare d text; e record;
begin
 select pg_get_functiondef('private.season_card_rules(uuid,text)'::regprocedure) into d;
 for e in select * from (values
 ($old$in ('1.0','1.1','1.2','1.3')$old$,$new$in ('1.0','1.1','1.2','1.3','1.4')$new$),
 ($old$when '1.3' then '3.2'$old$,$new$when '1.4' then '3.3' when '1.3' then '3.2'$new$),
 ($old$  if v_snapshot.ruleset_version='1.3' then$old$,$new$  if v_snapshot.ruleset_version='1.4' then
    if v_json is distinct from private.player_props_ruleset_package(p_mode) then
      raise exception using errcode='22023',message='UNSUPPORTED_SEASON_CARD_RULES'; end if;
    return jsonb_build_object('card',v_json->'card','concentration',v_json->'concentration','markets',v_json->'markets');
  end if;
  if v_snapshot.ruleset_version='1.3' then$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Props rules baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text); end loop; execute d;
 select pg_get_functiondef('private.pin_week_rules()'::regprocedure) into d;
 if strpos(d,'if not ((v_previous.ruleset_version')=0 then raise exception 'Props prospective upgrade baseline changed'; end if;
 d:=replace(d,'if not ((v_previous.ruleset_version',
 $new$if not ((v_previous.ruleset_version in ('1.0','1.1','1.2','1.3') and v_catalog.ruleset_version='1.4'
    and v_catalog.canonical_json=private.player_props_ruleset_package(v_season.mode)
    and v_catalog.sha256_hash=(select sha256_hash from private.prepared_player_props_rulesets where mode=v_season.mode))
    or (v_previous.ruleset_version$new$);
 execute d;
end; $migration$;

-- Explicit identity crosswalks are service/operator imports, never inferred from
-- a market's type or a display name. A mapping is scoped to the exact published
-- Odds event, team and Eastern game date; immutable rows retain audit provenance.
create table private.player_subjects (
 id uuid primary key default gen_random_uuid(),
 canonical_key text not null unique check(char_length(canonical_key) between 3 and 160),
 display_name text not null check(char_length(display_name) between 1 and 120),
 position text not null check(position in ('QB','RB','WR','TE')),
 created_at timestamptz not null default clock_timestamp()
);
create table private.player_provider_mappings (
 id uuid primary key default gen_random_uuid(),
 provider text not null check(provider in ('THE_ODDS_API','API_SPORTS','NFLVERSE','SIMULATION_FIXTURE')),
 external_event_id text not null check(char_length(external_event_id) between 1 and 160),
 external_player_id text not null check(char_length(external_player_id) between 1 and 160),
 subject_id uuid not null references private.player_subjects(id),
 team text not null check(char_length(team) between 1 and 60),
 game_date date not null,
 source_team text,
 secondary_player_id text,
 verified_at timestamptz not null,
 evidence_hash text not null check(evidence_hash ~ '^[0-9a-f]{64}$'),
 role_rank integer not null default 999 check(role_rank between 0 and 999),
 role_evidence text not null check(char_length(role_evidence) between 3 and 300),
 result_path_verified boolean not null default false,
 unique(provider,external_event_id,external_player_id,team,game_date),
 unique(provider,external_event_id,subject_id,team,game_date)
);
create index player_provider_mappings_subject_idx on private.player_provider_mappings(subject_id,external_event_id);
create index player_provider_mappings_game_role_idx on private.player_provider_mappings(external_event_id,team,game_date,role_rank);
create table private.player_prop_controls (
 singleton boolean primary key default true check(singleton),
 offers_enabled boolean not null default false,
 updated_at timestamptz not null default clock_timestamp()
);
insert into private.player_prop_controls(singleton) values(true);
create table private.player_prop_leagues (
 league_id uuid primary key references private.leagues(id),
 enabled boolean not null default false
);
create table private.week_player_menu (
 week_id uuid not null references private.season_weeks(id),
 event_id uuid not null references private.sports_events(id),
 team text not null,
 slot text not null check(slot in ('QB_PASS','RB_RUSH','RECEIVER')),
 subject_id uuid references private.player_subjects(id),
 statistic text not null check(statistic in ('PASSING_YARDS','RUSHING_YARDS','RECEIVING_YARDS')),
 period text not null default 'FULL_GAME' check(period='FULL_GAME'),
 proposed_at timestamptz not null default clock_timestamp(),
 confirmed_at timestamptz,
 confirmed_by uuid references private.profiles(id),
 frozen_at timestamptz,
 unavailable_reason text,
 primary key(event_id,team,slot),
 unique(event_id,subject_id,statistic,period),
 check((slot='QB_PASS' and statistic='PASSING_YARDS') or
       (slot='RB_RUSH' and statistic='RUSHING_YARDS') or
       (slot='RECEIVER' and statistic='RECEIVING_YARDS'))
);
create index week_player_menu_week_idx on private.week_player_menu(week_id,event_id);
create index week_player_menu_subject_idx on private.week_player_menu(subject_id,event_id) where subject_id is not null;
do $$ declare n text; begin
 foreach n in array array['player_subjects','player_provider_mappings','player_prop_controls','player_prop_leagues','week_player_menu'] loop
 execute format('alter table private.%I enable row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated',n);
 end loop; end $$;
create trigger player_subjects_append_only before update or delete on private.player_subjects
 for each row execute function private.reject_competitive_mutation();
create trigger player_provider_mappings_append_only before update or delete on private.player_provider_mappings
 for each row execute function private.reject_competitive_mutation();

create function api.import_player_catalog(p_records jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; s private.player_subjects%rowtype; existing private.player_provider_mappings%rowtype; n integer:=0;
begin
 if p_records is null or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 2000 then
   raise exception using errcode='22023',message='Invalid player catalog batch.'; end if;
 for r in select value from jsonb_array_elements(p_records) loop
  if not exists(select 1 from private.sports_events e where e.fixture_event_key=r->>'externalEventId'
    and (r->>'team') in(e.away_team,e.home_team)
    and (e.scheduled_start_at at time zone 'America/New_York')::date=(r->>'gameDate')::date)
    or (r->>'verifiedAt')::timestamptz>clock_timestamp()+interval '1 minute'
    or coalesce(r->>'evidenceHash','')!~'^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='Player mapping requires exact published game, team, date and evidence.'; end if;
  insert into private.player_subjects(canonical_key,display_name,position)
    values(r->>'canonicalKey',r->>'displayName',r->>'position') on conflict(canonical_key) do nothing;
  select * into strict s from private.player_subjects where canonical_key=r->>'canonicalKey';
  if s.display_name<>r->>'displayName' or s.position<>r->>'position' then
    raise exception using errcode='22023',message='Conflicting canonical player identity.'; end if;
  select * into existing from private.player_provider_mappings where provider=r->>'provider'
    and external_event_id=r->>'externalEventId' and external_player_id=r->>'externalPlayerId'
    and team=r->>'team' and game_date=(r->>'gameDate')::date;
  if found then
    if existing.subject_id<>s.id or existing.evidence_hash<>r->>'evidenceHash' then
      raise exception using errcode='22023',message='An immutable provider mapping conflicts with this evidence.'; end if;
    continue;
  end if;
  insert into private.player_provider_mappings(provider,external_event_id,external_player_id,subject_id,team,game_date,
    source_team,secondary_player_id,verified_at,evidence_hash,role_rank,role_evidence,result_path_verified)
  values(r->>'provider',r->>'externalEventId',r->>'externalPlayerId',s.id,r->>'team',(r->>'gameDate')::date,
    r->>'sourceTeam',r->>'secondaryPlayerId',(r->>'verifiedAt')::timestamptz,r->>'evidenceHash',
    coalesce((r->>'roleRank')::integer,999),r->>'roleEvidence',coalesce((r->>'resultPathVerified')::boolean,false));
  n:=n+1;
 end loop;
 return jsonb_build_object('imported',n);
end; $$;
revoke all on function api.import_player_catalog(jsonb) from public,anon,authenticated;
grant execute on function api.import_player_catalog(jsonb) to service_role;

create function private.player_menu_candidates(p_event_id uuid,p_team text,p_slot text)
returns table(subject_id uuid,subject_label text,"position" text,role_rank integer,role_evidence text)
language sql stable security invoker set search_path='' as $$
 select s.id,s.display_name,s.position,m.role_rank,m.role_evidence
 from private.sports_events e join private.player_provider_mappings m on m.external_event_id=e.fixture_event_key
 join private.player_subjects s on s.id=m.subject_id
 where e.id=p_event_id and p_team in(e.away_team,e.home_team) and m.team=p_team
 and m.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date
 and m.provider in ('THE_ODDS_API','SIMULATION_FIXTURE') and m.result_path_verified
 and ((p_slot='QB_PASS' and s.position='QB') or (p_slot='RB_RUSH' and s.position='RB')
 or (p_slot='RECEIVER' and s.position in('WR','TE')))
 order by m.role_rank,s.canonical_key;
$$;
create function private.prepare_player_menu(p_week_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare w private.season_weeks%rowtype; e record; t text; sl text; sid uuid;
begin
 select * into strict w from private.season_weeks where id=p_week_id for update;
 if not private.is_player_props_week(p_week_id) then return; end if;
 if exists(select 1 from private.week_player_menu where week_id=p_week_id and frozen_at is not null) then return; end if;
 for e in select ev.* from private.sports_events ev where ev.week_id=p_week_id
 and exists(select 1 from private.slate_items i where i.event_id=ev.id and i.week_id=p_week_id and private.is_effective_slate_item(i.id)) order by ev.id loop
  foreach t in array array[e.away_team,e.home_team] loop
   foreach sl in array array['QB_PASS','RB_RUSH','RECEIVER'] loop
    select subject_id into sid from private.player_menu_candidates(e.id,t,sl) limit 1;
    insert into private.week_player_menu(week_id,event_id,team,slot,subject_id,statistic,unavailable_reason)
    values(w.id,e.id,t,sl,sid,case sl when 'QB_PASS' then 'PASSING_YARDS' when 'RB_RUSH' then 'RUSHING_YARDS' else 'RECEIVING_YARDS' end,
      case when sid is null then 'PLAYER_IDENTITY_UNRESOLVED' else 'SLATE_REVIEW_REQUIRED' end)
    on conflict(event_id,team,slot) do update set subject_id=excluded.subject_id,
      unavailable_reason=excluded.unavailable_reason,proposed_at=clock_timestamp()
    where private.week_player_menu.frozen_at is null and private.week_player_menu.confirmed_at is null;
   end loop;
  end loop;
 end loop;
end; $$;
create function private.guard_player_menu() returns trigger
language plpgsql security invoker set search_path='' as $$
declare e private.sports_events%rowtype;
begin
 if tg_op='DELETE' then
  if old.frozen_at is not null then raise exception using errcode='55000',message='The player menu is frozen.'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and old.frozen_at is not null and new is distinct from old then
  raise exception using errcode='55000',message='The player menu is frozen.'; end if;
 select * into strict e from private.sports_events where id=new.event_id;
 if new.week_id<>e.week_id or new.team not in(e.away_team,e.home_team) or not private.is_player_props_week(e.week_id) then
  raise exception using errcode='22023',message='Invalid published player menu event.'; end if;
 if new.subject_id is not null and not exists(select 1 from private.player_menu_candidates(new.event_id,new.team,new.slot) c where c.subject_id=new.subject_id) then
  raise exception using errcode='22023',message='The player is not a verified role-correct candidate for this game.'; end if;
 return new;
end; $$;
create trigger week_player_menu_guard before insert or update or delete on private.week_player_menu
 for each row execute function private.guard_player_menu();
create function private.prepare_player_menu_trigger() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='season_weeks' then
  if new.state='OPEN' then perform private.prepare_player_menu(new.id); end if;
 else perform private.prepare_player_menu(new.week_id); end if;
 return new;
end; $$;
create trigger season_weeks_prepare_player_menu after insert or update of state on private.season_weeks
 for each row execute function private.prepare_player_menu_trigger();
create trigger sports_events_prepare_player_menu after insert on private.sports_events
 for each row execute function private.prepare_player_menu_trigger();
create function private.player_prop_offers_enabled(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select c.offers_enabled and l.enabled from private.player_prop_controls c
 join private.season_weeks w on w.id=p_week_id join private.player_prop_leagues l on l.league_id=w.league_id),false)
 and private.is_player_props_week(p_week_id);
$$;
create function private.prop_snapshot_allowed(p_event_id uuid,p_subject_id uuid,p_statistic text,p_period text) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select private.player_prop_offers_enabled(m.week_id) and m.confirmed_at is not null
 from private.week_player_menu m where m.event_id=p_event_id and m.subject_id=p_subject_id
 and m.statistic=p_statistic and m.period=p_period),false);
$$;
revoke all on function private.player_menu_candidates(uuid,text,text),private.prepare_player_menu(uuid),private.guard_player_menu(),
 private.prepare_player_menu_trigger(),private.player_prop_offers_enabled(uuid),private.prop_snapshot_allowed(uuid,uuid,text,text)
 from public,anon,authenticated;

create function api.get_player_prop_menu(p_league_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l private.leagues%rowtype; w private.season_weeks%rowtype; commissioner boolean;
begin
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 if (select auth.uid()) is null or not private.is_league_member(l.id) then
  raise exception using errcode='42501',message='League membership required.'; end if;
 select wk.* into w from private.season_weeks wk join private.seasons s on s.id=wk.season_id
 where s.league_id=l.id order by s.created_at desc,wk.nfl_week desc limit 1;
 commissioner:=private.is_league_commissioner(l.id);
 return jsonb_build_object('weekId',w.id,'enabled',private.player_prop_offers_enabled(w.id),'frozen',
 exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null),
 'slots',coalesce((select jsonb_agg(jsonb_build_object('eventId',m.event_id,'team',m.team,'slot',m.slot,
 'subjectId',m.subject_id,'subjectLabel',p.display_name,'position',p.position,'statistic',m.statistic,'period',m.period,
 'confirmed',m.confirmed_at is not null,'frozen',m.frozen_at is not null,'unavailableReason',m.unavailable_reason,
 'candidates',case when commissioner and m.frozen_at is null then coalesce((select jsonb_agg(jsonb_build_object(
 'subjectId',c.subject_id,'subjectLabel',c.subject_label,'position',c.position,'roleRank',c.role_rank,'roleEvidence',c.role_evidence)
 order by c.role_rank,c.subject_id) from private.player_menu_candidates(m.event_id,m.team,m.slot) c),'[]'::jsonb) else '[]'::jsonb end)
 order by e.scheduled_start_at,m.event_id,m.team,m.slot) from private.week_player_menu m
 join private.sports_events e on e.id=m.event_id left join private.player_subjects p on p.id=m.subject_id
 where m.week_id=w.id),'[]'::jsonb));
end; $$;
create function api.prepare_player_prop_menu(p_league_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.leagues%rowtype; s private.seasons%rowtype; w private.season_weeks%rowtype;
begin
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 if (select auth.uid()) is null or not private.is_league_commissioner(l.id) then
  raise exception using errcode='42501',message='Commissioner access required.'; end if;
 select * into strict s from private.seasons where league_id=l.id order by created_at desc limit 1 for update;
 select * into strict w from private.season_weeks where season_id=s.id order by nfl_week desc limit 1 for update;
 perform private.prepare_player_menu(w.id);
 return api.get_player_prop_menu(p_league_slug);
end; $$;
create function api.confirm_player_prop_menu(p_league_slug text,p_choices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.leagues%rowtype; s private.seasons%rowtype; w private.season_weeks%rowtype; c jsonb;
begin
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 if (select auth.uid()) is null or not private.is_league_commissioner(l.id) then
  raise exception using errcode='42501',message='Commissioner access required.'; end if;
 select * into strict s from private.seasons where league_id=l.id order by created_at desc limit 1 for update;
 select * into strict w from private.season_weeks where season_id=s.id order by nfl_week desc limit 1 for update;
 if not private.is_player_props_week(w.id) or exists(select 1 from private.position_receipts where week_id=w.id)
  or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null) then
  raise exception using errcode='55000',message='The player menu is unavailable or frozen.'; end if;
 perform private.prepare_player_menu(w.id);
 if p_choices is null or jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)<>(select count(*) from private.week_player_menu where week_id=w.id)
 or exists(select 1 from jsonb_array_elements(p_choices) q group by q->>'eventId',q->>'team',q->>'slot' having count(*)<>1) then
  raise exception using errcode='22023',message='Confirm the complete player slate once, including unavailable slots.'; end if;
 for c in select value from jsonb_array_elements(p_choices) loop
  update private.week_player_menu set subject_id=(c->>'subjectId')::uuid,confirmed_at=clock_timestamp(),confirmed_by=(select auth.uid()),
   unavailable_reason=case when c->>'subjectId' is null then 'PLAYER_IDENTITY_UNRESOLVED' else null end
  where week_id=w.id and event_id=(c->>'eventId')::uuid and team=c->>'team' and slot=c->>'slot';
  if not found then raise exception using errcode='22023',message='A player choice is outside the published slate.'; end if;
 end loop;
 return api.get_player_prop_menu(p_league_slug);
end; $$;
revoke all on function api.get_player_prop_menu(text),api.prepare_player_prop_menu(text),api.confirm_player_prop_menu(text,jsonb) from public,anon;
grant execute on function api.get_player_prop_menu(text),api.prepare_player_prop_menu(text),api.confirm_player_prop_menu(text,jsonb) to authenticated;

-- Subject identity is explicit at every trusted market and receipt boundary.
do $$ declare n text; begin
 foreach n in array array['market_snapshots','position_receipts','live_quote_heads'] loop
 execute format('alter table private.%I add column subject_id uuid references private.player_subjects(id), add column statistic text, add column period text',n);
 execute format('alter table private.%I drop constraint %I',n,n||'_market_type_check');
 execute format($f$alter table private.%I add constraint %I check(market_type in
 ('MONEYLINE','SPREAD','TOTAL','PLAYER_PASSING_YARDS','PLAYER_RUSHING_YARDS','PLAYER_RECEIVING_YARDS'))$f$,n,n||'_market_type_check');
 execute format($f$alter table private.%I add constraint %I check(
 (market_type in('MONEYLINE','SPREAD','TOTAL') and subject_id is null and statistic is null and period is null)
 or (subject_id is not null and statistic is not null and period is not null and period='FULL_GAME' and outcome_key in('OVER','UNDER') and
 ((market_type='PLAYER_PASSING_YARDS' and statistic='PASSING_YARDS')
 or (market_type='PLAYER_RUSHING_YARDS' and statistic='RUSHING_YARDS')
 or (market_type='PLAYER_RECEIVING_YARDS' and statistic='RECEIVING_YARDS'))))$f$,n,n||'_subject_identity_check');
 execute format('create index %I on private.%I(subject_id,event_id) where subject_id is not null',n||'_subject_idx',n);
 end loop;
 foreach n in array array['market_snapshots','position_receipts'] loop
 execute format('alter table private.%I add column subject_label text, add column subject_team text, add column subject_position text',n);
 execute format($f$alter table private.%I add constraint %I check(
 (subject_id is null and subject_label is null and subject_team is null and subject_position is null)
 or (subject_id is not null and subject_label is not null and subject_team is not null and subject_position is not null and subject_position in('QB','RB','WR','TE')))$f$,n,n||'_subject_label_check');
 end loop;
end $$;
alter table private.market_snapshots drop constraint market_snapshots_check;
alter table private.market_snapshots add constraint market_snapshots_line_check check(
 (market_type='MONEYLINE' and line_milli is null) or (market_type<>'MONEYLINE' and line_milli is not null));
alter table private.market_snapshots drop constraint market_snapshots_event_id_book_key_market_type_outcome_key__key;
create unique index market_snapshots_main_observation_key on private.market_snapshots(event_id,book_key,market_type,outcome_key,line_milli,payload_hash) nulls not distinct where subject_id is null;
create unique index market_snapshots_player_observation_key on private.market_snapshots(event_id,book_key,subject_id,statistic,period,outcome_key,line_milli,payload_hash) where subject_id is not null;
alter table private.position_receipts drop constraint position_receipts_card_id_event_id_market_type_key;
create unique index position_receipts_main_selection_key on private.position_receipts(card_id,event_id,market_type) where subject_id is null;
create unique index position_receipts_player_selection_key on private.position_receipts(card_id,event_id,subject_id,statistic,period) where subject_id is not null;
alter table private.live_quote_heads drop constraint live_quote_heads_pkey;
create unique index live_quote_heads_main_key on private.live_quote_heads(event_id,market_type,outcome_key) where subject_id is null;
create unique index live_quote_heads_player_key on private.live_quote_heads(event_id,subject_id,statistic,period,outcome_key) where subject_id is not null;
alter table private.position_receipts add column receipt_serialization_version integer not null default 1 check(receipt_serialization_version in(1,2)),
 add column receipt_canonical_json jsonb;
alter table private.position_receipts add constraint position_receipts_serializer_check check(
 (subject_id is null and receipt_serialization_version=1 and receipt_canonical_json is null)
 or (subject_id is not null and receipt_serialization_version=2 and receipt_canonical_json is not null));

-- Existing main-line importers keep their six outcomes and cannot attest props.
-- Inference predicates make the retained main unique-key contract unambiguous.
do $migration$
declare f record; d text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('private','api') and p.prokind='f' loop
 d:=pg_get_functiondef(f.oid);
 if strpos(d,'on conflict (event_id, market_type, outcome_key)')>0 then
  d:=replace(d,'on conflict (event_id, market_type, outcome_key)',
  'on conflict (event_id, market_type, outcome_key) where subject_id is null');
 end if;
 if strpos(d,'on conflict (event_id, book_key, market_type, outcome_key, line_milli, payload_hash)')>0 then
  d:=replace(d,'on conflict (event_id, book_key, market_type, outcome_key, line_milli, payload_hash)',
  'on conflict (event_id, book_key, market_type, outcome_key, line_milli, payload_hash) where subject_id is null');
 end if;
 if d is distinct from pg_get_functiondef(f.oid) then execute d; end if;
 end loop;
 for f in select unnest(array['private.refresh_member_quote_heads(uuid,uuid,uuid,text)',
 'api.refresh_live_week_quotes(uuid,uuid,text)']) signature loop
 d:=pg_get_functiondef(f.signature::regprocedure);
 if strpos(d,'(select count(*) from private.live_quote_heads h where h.event_id=e.id)<>6')=0 then
  raise exception 'Props main import completeness baseline changed'; end if;
 d:=replace(d,'(select count(*) from private.live_quote_heads h where h.event_id=e.id)<>6',
 '(select count(*) from private.live_quote_heads h where h.event_id=e.id and h.subject_id is null)<>6');
 -- Legacy all-head completeness also excludes props even when mixed history exists.
 d:=replace(d,'where head.week_id = v_week.id','where head.week_id = v_week.id and head.subject_id is null');
 execute d;
 end loop;
end; $migration$;

create function private.guard_player_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p private.player_subjects%rowtype; m private.week_player_menu%rowtype;
begin
 if new.subject_id is null then return new; end if;
 select * into strict p from private.player_subjects where id=new.subject_id;
 select * into m from private.week_player_menu where event_id=new.event_id and subject_id=new.subject_id
  and statistic=new.statistic and period=new.period and week_id=new.week_id;
 if not found or not private.prop_snapshot_allowed(new.event_id,new.subject_id,new.statistic,new.period)
  or new.book_key<>'draftkings' then
  raise exception using errcode='22023',message='The prop is outside the verified published player menu.'; end if;
 new.subject_label:=p.display_name; new.subject_team:=m.team; new.subject_position:=p.position;
 return new;
end; $$;
create trigger market_snapshots_player_identity before insert on private.market_snapshots
 for each row execute function private.guard_player_snapshot();
create function private.guard_quote_head_subject() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s private.market_snapshots%rowtype;
begin
 select * into strict s from private.market_snapshots where id=new.market_snapshot_id;
 if new.event_id<>s.event_id or new.week_id<>s.week_id or new.league_id<>s.league_id
 or new.market_type<>s.market_type or new.outcome_key<>s.outcome_key
 or new.subject_id is distinct from s.subject_id or new.statistic is distinct from s.statistic or new.period is distinct from s.period then
  raise exception using errcode='22023',message='The quote head does not match its immutable subject.'; end if;
 return new;
end; $$;
create trigger live_quote_heads_subject_guard before insert or update on private.live_quote_heads
 for each row execute function private.guard_quote_head_subject();

create function private.player_receipt_canonical(p_receipt_id uuid,p_card_id uuid,p_snapshot_id uuid,p_stake integer,p_accepted_at timestamptz,p_ruleset_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('serializationVersion',2,'receiptId',p_receipt_id,'cardId',p_card_id,
 'weekId',s.week_id,'eventId',s.event_id,'marketSnapshotId',s.id,'subjectId',s.subject_id,
 'subjectLabel',s.subject_label,'subjectTeam',s.subject_team,'subjectPosition',s.subject_position,
 'marketType',s.market_type,'statistic',s.statistic,'period',s.period,'side',s.outcome_key,'lineMilli',s.line_milli,
 'americanOdds',s.american_odds,'bookmaker',s.book_key,'stakeCredits',p_stake,'acceptedAt',p_accepted_at,
 'rulesetSnapshotId',r.id,'rulesetVersion',r.ruleset_version,'productBibleVersion',r.product_bible_version,'rulesetHash',r.sha256_hash)
 from private.market_snapshots s cross join private.season_ruleset_snapshots r
 where s.id=p_snapshot_id and s.subject_id is not null and r.id=p_ruleset_id;
$$;
create function private.guard_player_receipt() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s private.market_snapshots%rowtype; j jsonb;
begin
 select * into strict s from private.market_snapshots where id=new.market_snapshot_id;
 if new.subject_id is distinct from s.subject_id or new.statistic is distinct from s.statistic
 or new.period is distinct from s.period or new.subject_label is distinct from s.subject_label
 or new.subject_team is distinct from s.subject_team or new.subject_position is distinct from s.subject_position then
  raise exception using errcode='22023',message='Receipt identity must come from its trusted quote.'; end if;
 if new.subject_id is null then return new; end if;
 if not private.prop_snapshot_allowed(new.event_id,new.subject_id,new.statistic,new.period) then
  raise exception using errcode='55000',message='New player props are unavailable.'; end if;
 if new.market_type<>s.market_type or new.outcome_key<>s.outcome_key or new.line_milli is distinct from s.line_milli
 or new.american_odds<>s.american_odds or new.ruleset_snapshot_id<>(select ruleset_snapshot_id from private.season_weeks where id=new.week_id) then
  raise exception using errcode='22023',message='Receipt terms must come from the trusted quote and pinned rules.'; end if;
 j:=private.player_receipt_canonical(new.id,new.card_id,new.market_snapshot_id,new.stake_credits,new.accepted_at,new.ruleset_snapshot_id);
 if new.receipt_serialization_version<>2 or new.receipt_canonical_json is distinct from j
 or new.receipt_hash<>encode(extensions.digest(private.canonical_ruleset_json(j),'sha256'),'hex') then
  raise exception using errcode='22023',message='Invalid player receipt serialization.'; end if;
 return new;
end; $$;
create trigger position_receipts_player_identity before insert on private.position_receipts
 for each row execute function private.guard_player_receipt();
revoke all on function private.guard_player_snapshot(),private.guard_quote_head_subject(),private.player_receipt_canonical(uuid,uuid,uuid,integer,timestamptz,uuid),private.guard_player_receipt()
 from public,anon,authenticated;

-- Preserve the single acceptance authority, authorization-before-replay,
-- cumulative budget and cutoff revalidation. Freeze all six slots/game even
-- for the first game-only batch; late quotes can only address frozen players.
do $migration$
declare d text; e record;
begin
 d:=pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure);
 for e in select * from (values
 ($old$  v_receipt_hash text;$old$,$new$  v_receipt_hash text;
  v_receipt_canonical jsonb;$new$),
 ($old$group by snapshot.event_id, snapshot.market_type$old$,$new$group by snapshot.event_id, snapshot.market_type,snapshot.subject_id,snapshot.statistic,snapshot.period$new$),
 ($old$and receipt.market_type = v_snapshot.market_type$old$,$new$and receipt.market_type = v_snapshot.market_type
        and receipt.subject_id is not distinct from v_snapshot.subject_id
        and receipt.statistic is not distinct from v_snapshot.statistic
        and receipt.period is not distinct from v_snapshot.period$new$),
 ($old$    if v_snapshot.payload_hash <> v_item.payload_hash then$old$,$new$    if v_snapshot.subject_id is not null and not private.prop_snapshot_allowed(v_snapshot.event_id,v_snapshot.subject_id,v_snapshot.statistic,v_snapshot.period) then
      raise exception using errcode='55000',message='The player prop is unavailable or outside the frozen menu.'; end if;
    if v_snapshot.payload_hash <> v_item.payload_hash then$new$),
 ($old$    insert into private.position_receipts ($old$,$new$    v_receipt_canonical:=null;
    if v_snapshot.subject_id is not null then
      v_receipt_canonical:=private.player_receipt_canonical(v_receipt_id,v_card.id,v_snapshot.id,v_item.stake_credits,v_now,v_week.ruleset_snapshot_id);
      v_receipt_hash:=encode(extensions.digest(private.canonical_ruleset_json(v_receipt_canonical),'sha256'),'hex');
    end if;
    insert into private.position_receipts ($new$),
 ($old$ruleset_snapshot_id, idempotency_key, request_hash, receipt_hash
    ) values ($old$,$new$ruleset_snapshot_id, idempotency_key, request_hash, receipt_hash,
      subject_id,statistic,period,subject_label,subject_team,subject_position,receipt_serialization_version,receipt_canonical_json
    ) values ($new$),
 ($old$      v_position_request_hash, v_receipt_hash
    );$old$,$new$      v_position_request_hash, v_receipt_hash,
      v_snapshot.subject_id,v_snapshot.statistic,v_snapshot.period,v_snapshot.subject_label,v_snapshot.subject_team,v_snapshot.subject_position,
      case when v_snapshot.subject_id is null then 1 else 2 end,v_receipt_canonical
    );$new$),
 ($old$'marketSnapshotId', v_snapshot.id,
      'stakeCredits', v_item.stake_credits$old$,$new$'marketSnapshotId', v_snapshot.id,
      'subjectId',v_snapshot.subject_id,'subjectLabel',v_snapshot.subject_label,'subjectTeam',v_snapshot.subject_team,
      'subjectPosition',v_snapshot.subject_position,'statistic',v_snapshot.statistic,'period',v_snapshot.period,
      'serializationVersion',case when v_snapshot.subject_id is null then 1 else 2 end,
      'stakeCredits', v_item.stake_credits$new$),
 ($old$  update private.slates
  set frozen_at = coalesce(frozen_at, v_now)$old$,$new$  if private.is_player_props_week(v_week.id) then
    perform private.prepare_player_menu(v_week.id);
    update private.week_player_menu set frozen_at=v_now,
      unavailable_reason=case when subject_id is null then 'PLAYER_IDENTITY_UNRESOLVED'
      when confirmed_at is null then 'SLATE_REVIEW_NOT_COMPLETED' else unavailable_reason end
      where week_id=v_week.id and frozen_at is null;
  end if;
  update private.slates
  set frozen_at = coalesce(frozen_at, v_now)$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Props acceptance baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text); end loop;
 execute d;
 d:=pg_get_functiondef('private.enforce_live_current_quote()'::regprocedure);
 if strpos(d,'and head.market_snapshot_id = new.market_snapshot_id')=0 then raise exception 'Props quote receipt guard baseline changed'; end if;
 execute replace(d,'and head.market_snapshot_id = new.market_snapshot_id',
 'and head.market_snapshot_id = new.market_snapshot_id and head.subject_id is not distinct from new.subject_id and head.statistic is not distinct from new.statistic and head.period is not distinct from new.period');
end; $migration$;

-- Structural opportunities include known menu identities without requiring a
-- currently available quote, protecting eligibility during delays and outages.
create or replace function private.rolling_card_can_submit(p_card_id uuid)
returns boolean language sql volatile security invoker set search_path='' as $$
 select coalesce(private.is_rolling_week(card.week_id)
 and week.state in('OPEN','LOCKED','PROVISIONAL')
 and private.card_confirmation_time(week.season_id)>=week.opens_at
 and not private.rolling_week_entries_closed(week.id)
 and card.granted_credits-totals.credits>=50 and totals.picks<20
 and (exists(select 1 from private.slate_items item join private.market_snapshots s on s.id=item.market_snapshot_id
  where item.week_id=week.id and private.is_effective_slate_item(item.id) and private.event_accepts_entries(s.event_id)
  and s.subject_id is null and not exists(select 1 from private.position_receipts r where r.card_id=card.id and r.event_id=s.event_id and r.market_type=s.market_type and r.subject_id is null))
 or exists(select 1 from private.week_player_menu m where m.week_id=week.id and m.subject_id is not null and m.confirmed_at is not null
  and private.event_accepts_entries(m.event_id) and not exists(select 1 from private.position_receipts r where r.card_id=card.id
   and r.event_id=m.event_id and r.subject_id=m.subject_id and r.statistic=m.statistic and r.period=m.period))),false)
 from private.weekly_cards card join private.season_weeks week on week.id=card.week_id
 cross join lateral(select coalesce(sum(r.stake_credits),0) credits,count(*) picks from private.position_receipts r where r.card_id=card.id) totals
 where card.id=p_card_id;
$$;
revoke all on function private.rolling_card_can_submit(uuid) from public,anon,authenticated;

-- Member readers add labels only where quote/own/reliably revealed receipt
-- objects already exist. The separate distinct-game hidden projection is intact.
do $migration$
declare d text; f text; a text;
begin
 foreach f in array array['api.get_stage1_state(text)','api.get_live_quote_heads(text)','api.get_league_matchup_cards(text,uuid)'] loop
 d:=pg_get_functiondef(f::regprocedure);
 foreach a in array array['snapshot','receipt'] loop
 if strpos(d,'''marketType'', '||a||'.market_type')>0 then
 d:=replace(d,'''marketType'', '||a||'.market_type',
 '''subjectId'', '||a||'.subject_id, ''subjectLabel'', '||a||'.subject_label, ''subjectTeam'', '||a||'.subject_team, ''subjectPosition'', '||a||'.subject_position, ''statistic'', '||a||'.statistic, ''period'', '||a||'.period, ''marketType'', '||a||'.market_type');
 end if;
 end loop;
 if f='api.get_stage1_state(text)' then
 if strpos(d,'''nflWeek'', v_week.nfl_week')=0 then raise exception 'Props week reader baseline changed'; end if;
 d:=replace(d,'''nflWeek'', v_week.nfl_week','''propsEnabled'', private.player_prop_offers_enabled(v_week.id), ''nflWeek'', v_week.nfl_week');
 d:=replace(d,'''receiptHash'', receipt.receipt_hash','''receiptHash'', receipt.receipt_hash, ''serializationVersion'',receipt.receipt_serialization_version');
 -- Legacy opponent view must use the same reliable-start/void rule as browsing.
 d:=replace(d,'and event.state in (''LIVE'', ''FINAL'', ''VOID'', ''CORRECTED'')',
 'and (event.state=''VOID'' or (event.state in (''LIVE'',''FINAL'',''CORRECTED'') and event.actual_started_at is not null and event.actual_started_at<=private.card_confirmation_time(v_season.id)))');
 end if;
 execute d;
 end loop;
end; $migration$;

-- Deterministic Simulation still uses the same immutable snapshot and receipt
-- paths. Renewal keeps each player's own head; it cannot overwrite teammates.
do $migration$
declare d text; e record;
begin
 d:=pg_get_functiondef('api.prepare_simulation_card_quotes(text)'::regprocedure);
 for e in select * from (values
 ($old$coalesce(m.line_milli::text,'null')||':'||m.american_odds::text||':'||n::text$old$,
 $new$coalesce(m.subject_id::text,'main')||':'||coalesce(m.statistic,'main')||':'||coalesce(m.period,'main')||':'||coalesce(m.line_milli::text,'null')||':'||m.american_odds::text||':'||n::text$new$),
 ($old$line_milli,american_odds,quality_status,observed_at,payload_hash)$old$,
 $new$line_milli,american_odds,quality_status,observed_at,payload_hash,subject_id,statistic,period,subject_label,subject_team,subject_position)$new$),
 ($old$m.quality_status,n,h)$old$,$new$m.quality_status,n,h,m.subject_id,m.statistic,m.period,m.subject_label,m.subject_team,m.subject_position)$new$),
 ($old$where event_id=m.event_id and market_type=m.market_type and outcome_key=m.outcome_key;$old$,
 $new$where event_id=m.event_id and market_type=m.market_type and outcome_key=m.outcome_key
       and subject_id is not distinct from m.subject_id and statistic is not distinct from m.statistic and period is not distinct from m.period;$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Props Simulation quote baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text); end loop;
 execute d;
end; $migration$;
-- Initial head creation must use the same subject identity as later refreshes.
do $migration$
declare d text; a text:='  insert into private.live_quote_heads (';
begin
 d:=pg_get_functiondef('private.set_initial_live_quote_head()'::regprocedure);
 if strpos(d,a)=0 then raise exception 'Props initial head baseline changed'; end if;
 execute replace(d,a,$new$  if v_snapshot.subject_id is not null then
    insert into private.live_quote_heads(event_id,week_id,league_id,market_type,outcome_key,market_snapshot_id,subject_id,statistic,period)
    values(new.event_id,new.week_id,new.league_id,v_snapshot.market_type,v_snapshot.outcome_key,new.market_snapshot_id,
      v_snapshot.subject_id,v_snapshot.statistic,v_snapshot.period)
    on conflict(event_id,subject_id,statistic,period,outcome_key) where subject_id is not null do nothing;
    return new;
  end if;
  insert into private.live_quote_heads ($new$);
end; $migration$;
-- A bounded league/season override activates only the configured pilot. Global
-- catalogs retain 1.3. Disabling offers never downgrades already adopted rules.
alter table private.player_prop_leagues add column rules_enabled boolean not null default false,
 add column season_id uuid references private.seasons(id),
 add column first_enabled_week integer check(first_enabled_week between 1 and 18),
 add column activated_at timestamptz,
 add column release_sha text check(release_sha ~ '^[0-9a-f]{40}$'),
 add column approval_reference text,
 add constraint player_prop_leagues_rules_scope_check check(not rules_enabled or
 (season_id is not null and first_enabled_week is not null and activated_at is not null and release_sha is not null and approval_reference is not null));
create index player_prop_leagues_season_idx on private.player_prop_leagues(season_id) where season_id is not null;
do $migration$
declare d text; old text:='  select * into strict v_catalog from private.authoritative_season_rulesets where mode=v_season.mode for share;';
begin
 d:=pg_get_functiondef('private.pin_week_rules()'::regprocedure);
 if strpos(d,old)=0 then raise exception 'Pilot props week opening lock baseline changed'; end if;
 execute replace(d,old,old||$new$
  -- Serialized with activation's season -> scoped setting locks. The already-
  -- open early return above remains authoritative even for a supported override.
  perform 1 from private.player_prop_leagues where league_id=v_season.league_id for share;
  if exists(select 1 from private.player_prop_leagues p where p.league_id=v_season.league_id
    and p.season_id=v_season.id and p.rules_enabled and new.nfl_week>=p.first_enabled_week) then
    select '1.4','3.3',p.canonical_json,p.sha256_hash into
      v_catalog.ruleset_version,v_catalog.product_bible_version,v_catalog.canonical_json,v_catalog.sha256_hash
      from private.prepared_player_props_rulesets p where p.mode=v_season.mode;
  end if;
$new$);
end; $migration$;
-- Cross-provider identity stays immutable while refreshed role evidence can be
-- appended before slate review. Updated directory timestamps do not require
-- manual SQL or rewrite the verified player/event/team mapping.
create table private.player_provider_mapping_observations (
 id uuid primary key default gen_random_uuid(),
 mapping_id uuid not null references private.player_provider_mappings(id),
 verified_at timestamptz not null,
 evidence_hash text not null check(evidence_hash ~ '^[0-9a-f]{64}$'),
 role_rank integer not null check(role_rank between 0 and 999),
 role_evidence text not null check(char_length(role_evidence) between 3 and 300),
 unique(mapping_id,evidence_hash)
);
create index player_provider_mapping_observations_latest_idx on private.player_provider_mapping_observations(mapping_id,verified_at desc,id);
alter table private.player_provider_mapping_observations enable row level security;
revoke all on private.player_provider_mapping_observations from public,anon,authenticated;
create trigger player_provider_mapping_observations_append_only before update or delete on private.player_provider_mapping_observations
 for each row execute function private.reject_competitive_mutation();
create function private.record_player_mapping_observation(p_mapping_id uuid,p_record jsonb) returns void
language sql security invoker set search_path='' as $$
 insert into private.player_provider_mapping_observations(mapping_id,verified_at,evidence_hash,role_rank,role_evidence)
 values(p_mapping_id,(p_record->>'verifiedAt')::timestamptz,p_record->>'evidenceHash',coalesce((p_record->>'roleRank')::integer,999),p_record->>'roleEvidence')
 on conflict(mapping_id,evidence_hash) do nothing;
$$;
revoke all on function private.record_player_mapping_observation(uuid,jsonb) from public,anon,authenticated;
do $migration$
declare d text; e record;
begin
 d:=pg_get_functiondef('api.import_player_catalog(jsonb)'::regprocedure);
 for e in select * from (values
 ($old$if existing.subject_id<>s.id or existing.evidence_hash<>r->>'evidenceHash' then$old$,
 $new$if existing.subject_id<>s.id or existing.result_path_verified is distinct from coalesce((r->>'resultPathVerified')::boolean,false)
      or existing.source_team is distinct from r->>'sourceTeam' or existing.secondary_player_id is distinct from r->>'secondaryPlayerId' then$new$),
 ($old$    continue;
  end if;$old$,$new$    perform private.record_player_mapping_observation(existing.id,r);
    continue;
  end if;$new$),
 ($old$coalesce((r->>'resultPathVerified')::boolean,false));
  n:=n+1;$old$,
 $new$coalesce((r->>'resultPathVerified')::boolean,false)) returning id into existing.id;
  perform private.record_player_mapping_observation(existing.id,r);
  n:=n+1;$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Player mapping revision baseline changed'; end if;
 d:=replace(d,e.old_text,e.new_text); end loop; execute d;
end; $migration$;
create or replace function private.player_menu_candidates(p_event_id uuid,p_team text,p_slot text)
returns table(subject_id uuid,subject_label text,"position" text,role_rank integer,role_evidence text)
language sql stable security invoker set search_path='' as $$
 select s.id,s.display_name,s.position,coalesce(o.role_rank,m.role_rank),coalesce(o.role_evidence,m.role_evidence)
 from private.sports_events e join private.player_provider_mappings m on m.external_event_id=e.fixture_event_key
 join private.player_subjects s on s.id=m.subject_id
 left join lateral(select * from private.player_provider_mapping_observations x where x.mapping_id=m.id
 order by x.verified_at desc,x.evidence_hash desc limit 1) o on true
 where e.id=p_event_id and p_team in(e.away_team,e.home_team) and m.team=p_team
 and m.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date
 and m.provider in('THE_ODDS_API','SIMULATION_FIXTURE') and m.result_path_verified
 and ((p_slot='QB_PASS' and s.position='QB') or (p_slot='RB_RUSH' and s.position='RB')
 or (p_slot='RECEIVER' and s.position in('WR','TE')))
 order by coalesce(o.role_rank,m.role_rank),s.canonical_key;
$$;
-- An existing1.3 draft can open its first week with a scoped1.4 override. This
-- validates the exact old package without treating an unfrozen row as frozen.
do $migration$
declare d text; old text:=$old$  if v_previous.frozen_at is null then
    if not coalesce(v_previous.ruleset_version='1.2'$old$;
begin
 d:=pg_get_functiondef('private.pin_week_rules()'::regprocedure);
 if strpos(d,old)=0 then raise exception 'Props initial draft upgrade baseline changed'; end if;
 execute replace(d,old,$new$  if v_previous.frozen_at is null then
    if v_previous.ruleset_version='1.3' and v_previous.product_bible_version='3.2'
      and v_previous.mode=v_season.mode
      and v_previous.ruleset_id=v_previous.canonical_json->>'id'
      and v_previous.product_bible_id=v_previous.canonical_json->>'productBibleId'
      and v_previous.canonical_json=private.rolling_ruleset_package(v_season.mode)
      and v_previous.sha256_hash=(select sha256_hash from private.prepared_rolling_rulesets where mode=v_season.mode)
      and v_previous.sha256_hash=encode(extensions.digest(private.canonical_ruleset_json(v_previous.canonical_json),'sha256'),'hex') then
      null;
    elsif not coalesce(v_previous.ruleset_version='1.2'$new$);
end; $migration$;
