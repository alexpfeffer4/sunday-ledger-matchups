-- V2.2: dormant, opt-in Live-season automation. Competitive 1.5 bytes stay intact.
-- Human enrollment consent and exact SYSTEM menu validation are distinct audits.
create function private.season_automation_policy() returns jsonb
language sql immutable set search_path='' as $$
 select '{"revision":"SEASON_AUTOMATION_V1","source":"NFLVERSE_PRIMARY","selection":"FEATURED_HIGHEST_STANDARD_LINES","bookmaker":"draftkings","slots":["QB_PASS","RB_RUSH","RECEIVER"],"unavailable":"ALLOW_PARTIAL_OR_EMPTY","freeze":"FIRST_PUBLICATION_PER_SLOT","continuation":"AUTOMATIC_BEFORE_EVENT_CUTOFF","prepare":"TUESDAY_08_AMERICA_NEW_YORK","open":"TUESDAY_10_AMERICA_NEW_YORK","previousWeek":"FINAL","ruleset":"1.5"}'::jsonb;
$$;
create function private.season_automation_policy_hash() returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(private.season_automation_policy()::text,'sha256'),'hex');
$$;
create table private.season_automation_consents (
 id uuid primary key default gen_random_uuid(), season_id uuid not null references private.seasons(id),
 league_id uuid not null references private.leagues(id), approved_by uuid not null references private.profiles(id),
 effective_week integer not null check(effective_week between 2 and 18),
 slate_preset text not null check(slate_preset in('ALL_NFL_GAMES','SUNDAY_AFTERNOON_AND_MONDAY')),
 policy jsonb not null, policy_hash text not null check(policy_hash ~ '^[0-9a-f]{64}$'),
 approved_at timestamptz not null default clock_timestamp()
);
create table private.season_automation (
 season_id uuid primary key references private.seasons(id), consent_id uuid not null references private.season_automation_consents(id),
 enabled boolean not null default false, revoked boolean not null default false, revision bigint not null default 1,
 generation bigint not null default 0, lease_id uuid, lease_until timestamptz,
 schedule jsonb, schedule_hash text, schedule_fetched_at timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 4), operation_key text,
 next_attempt_at timestamptz not null default clock_timestamp(), suspended boolean not null default false,
 last_outcome text, blocker text, failure_dependency_hash text, last_success_dependency_hash text, last_success_operation_key text, last_checked_at timestamptz, last_retry_at timestamptz
);
create table private.season_automation_runs (
 id uuid primary key default gen_random_uuid(),season_id uuid not null references private.seasons(id),
 consent_id uuid not null references private.season_automation_consents(id),revision bigint not null,generation bigint not null,
 operation text not null check(operation in('SYNC_SCHEDULE','PREPARE','VALIDATE','OPEN','RECONCILE','QUALIFY','CHAMPION','ARCHIVE')),
 nfl_week integer not null check(nfl_week between 1 and 18), operation_key text not null,
 state text not null default 'CLAIMED' check(state in('CLAIMED','SUCCEEDED','FAILED','STALE')),
 claimed_at timestamptz not null default clock_timestamp(), lease_until timestamptz not null,
 execution_xid xid8, response jsonb, finished_at timestamptz
);
create unique index automation_execution_xid on private.season_automation_runs(execution_xid) where execution_xid is not null and state='CLAIMED';
create index automation_due_idx on private.season_automation(next_attempt_at) where enabled and not revoked and not suspended;
create index automation_consent_season_idx on private.season_automation_consents(season_id);
create index automation_consent_league_idx on private.season_automation_consents(league_id);
create index automation_consent_actor_idx on private.season_automation_consents(approved_by);
create index automation_state_consent_idx on private.season_automation(consent_id);
create index automation_run_season_idx on private.season_automation_runs(season_id,claimed_at);
create index automation_run_consent_idx on private.season_automation_runs(consent_id);
create table private.season_automation_week_plans (
 week_id uuid primary key references private.season_weeks(id),consent_id uuid not null references private.season_automation_consents(id),
 run_id uuid not null references private.season_automation_runs(id), expected_games jsonb not null,
 schedule_hash text not null, opens_at timestamptz not null, created_at timestamptz not null default clock_timestamp()
);
create index automation_plan_consent_idx on private.season_automation_week_plans(consent_id);
create index automation_plan_run_idx on private.season_automation_week_plans(run_id);
create table private.player_prop_system_validations (
 id uuid primary key default gen_random_uuid(),week_id uuid not null references private.season_weeks(id),
 consent_id uuid not null references private.season_automation_consents(id),run_id uuid not null references private.season_automation_runs(id),
 policy_hash text not null,menu_hash text not null,menu_snapshot jsonb not null,evidence_hash text not null,evidence jsonb not null,
 rules_hash text not null, validated_at timestamptz not null default clock_timestamp(),
 unique(week_id,consent_id,menu_hash,evidence_hash,rules_hash)
);
create index system_validation_consent_idx on private.player_prop_system_validations(consent_id);
create index system_validation_run_idx on private.player_prop_system_validations(run_id);
do $$ declare t text; begin
 foreach t in array array['season_automation_consents','season_automation','season_automation_runs','season_automation_week_plans','player_prop_system_validations'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 if t not in('season_automation','season_automation_runs') then
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_competitive_mutation()',t||'_immutable',t);
 end if;
 end loop;
end $$;

-- Lock the same season authority before checking either current membership or a
-- claimed SYSTEM run. No caller can set auth.uid or supply a human actor.
create function private.assert_season_automation_run(p_run uuid) returns private.season_automation_runs
language plpgsql set search_path='' as $$
declare r private.season_automation_runs%rowtype; a private.season_automation%rowtype;s private.seasons%rowtype;c private.season_automation_consents%rowtype;
begin
 select * into strict r from private.season_automation_runs where id=p_run;
 -- Fence commissioner transfer/deletion while allowing older season-locked
 -- score/receipt writers to take their ordinary league FK KEY SHARE lock.
 perform 1 from private.leagues where id=(select league_id from private.seasons where id=r.season_id) for no key update;
 select * into strict s from private.seasons where id=r.season_id for update;
 select * into strict a from private.season_automation where season_id=s.id for update;
 select * into strict r from private.season_automation_runs where id=p_run for update;
 select * into strict c from private.season_automation_consents where id=a.consent_id;
 perform 1 from private.season_automation_settings where singleton for share;
 if not exists(select 1 from private.season_automation_settings where enabled and release_sha is not null)
 or s.mode<>'LIVE' or s.roster_locked_at is null or exists(select 1 from private.owner_rehearsals where league_id=s.league_id)
 or not a.enabled or a.revoked or a.lease_id is distinct from r.id or a.generation<>r.generation or a.revision<>r.revision
 or a.consent_id<>r.consent_id or r.state<>'CLAIMED' or r.lease_until<=clock_timestamp()
 or c.season_id<>s.id or c.league_id<>s.league_id or c.policy_hash<>private.season_automation_policy_hash()
 or c.policy<>private.season_automation_policy() or r.nfl_week<c.effective_week and r.operation<>'RECONCILE'
 or not exists(select 1 from private.seasons latest where latest.id=s.id and not exists(select 1 from private.seasons newer where newer.league_id=s.league_id and newer.created_at>s.created_at)) then
 raise exception using errcode='40001',message='Automation claim is no longer current.';end if;
 update private.season_automation_runs set execution_xid=pg_current_xact_id() where id=r.id;
 return r;
end $$;
create function private.assert_lifecycle_actor(p_league uuid,p_run uuid) returns void
language plpgsql set search_path='' as $$
declare r private.season_automation_runs%rowtype;
begin
 perform 1 from private.leagues where id=p_league for no key update;
 if p_run is null then
 perform 1 from private.seasons where league_id=p_league order by created_at desc limit 1 for update;
 if auth.uid() is null or not private.is_league_commissioner(p_league) then
 raise exception using errcode='42501',message='Commissioner membership required.';end if;
 else
 r:=private.assert_season_automation_run(p_run);
 if not exists(select 1 from private.seasons where id=r.season_id and league_id=p_league) then
 raise exception using errcode='42501',message='Automation league scope mismatch.';end if;
 end if;
end $$;
-- The protected Week 17 correction originally locked its event before the
-- season. Serialize it with lifecycle publication before taking child locks;
-- retain its complete authentication, objective-result and lineage authority.
do $$ declare d text;anchor text;begin
 d:=pg_get_functiondef('api.correct_finalized_week17_result(uuid,text,integer,integer,text,text)'::regprocedure);
 anchor:=E'begin\n  select event.* into strict v_event';
 if strpos(d,anchor)=0 then raise exception 'Protected correction lock baseline changed';end if;
 execute replace(d,anchor,E'begin\n  perform 1 from private.leagues where id=(select league_id from private.sports_events where id=p_event_id) for no key update;\n  perform 1 from private.seasons where id=(select season_id from private.sports_events where id=p_event_id) for update;\n  select event.* into strict v_event');
end $$;
create function private.automation_week_enrolled(p_season uuid,p_week integer) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.season_automation a join private.season_automation_consents c on c.id=a.consent_id
 where a.season_id=p_season and c.season_id=p_season and p_week>=c.effective_week and not a.revoked);
$$;

-- Initial acquisition for enrolled unopened weeks uses the installed catalog
-- path; progressive continuation begins only after its empty-slot activation.
alter function private.player_catalog_staged_week(uuid,integer) rename to player_catalog_staged_week_before_automation;
create function private.player_catalog_staged_week(p_season_id uuid,p_nfl_week integer) returns boolean
language sql stable set search_path='' as $$
 select private.player_catalog_staged_week_before_automation(p_season_id,p_nfl_week)
 or (private.automation_week_enrolled(p_season_id,p_nfl_week) and exists(select 1 from private.player_prop_leagues where season_id=p_season_id and catalog_enabled));
$$;
create function private.catalog_uses_progressive_continuation(p_week uuid) returns boolean
language sql stable set search_path='' as $$
 select private.is_progressive_player_props_week(p_week) and not exists(
 select 1 from private.season_weeks w where w.id=p_week and w.state='PLANNED'
 and (private.automation_week_enrolled(w.season_id,w.nfl_week) or exists(select 1 from private.season_automation_week_plans where week_id=w.id))
 and not exists(select 1 from private.player_prop_progressive_activations where week_id=w.id));
$$;
do $$ declare signature text;d text;begin
 foreach signature in array array['api.enqueue_player_catalog(text)','api.claim_player_catalog_job(uuid)',
 'api.record_player_catalog_nominations(uuid,jsonb)','private.player_catalog_quote_scope(uuid)',
 'private.player_catalog_discovery_families(uuid)','private.player_catalog_discovery_evidence_current(uuid,uuid,text)',
 'private.progressive_player_catalog_next_attempt(uuid)','api.claim_player_catalog_quote(uuid)',
 'api.complete_player_catalog_job(uuid,text,integer,text)'] loop
 d:=pg_get_functiondef(signature::regprocedure);
 if strpos(d,'private.is_progressive_player_props_week(')=0 then raise exception 'Catalog baseline changed: %',signature;end if;
 execute replace(d,'private.is_progressive_player_props_week(','private.catalog_uses_progressive_continuation(');
 end loop;
end $$;
revoke all on function private.player_catalog_staged_week_before_automation(uuid,integer),private.catalog_uses_progressive_continuation(uuid),private.player_catalog_staged_week(uuid,integer) from public,anon,authenticated,service_role;

-- Shared commands and nested postseason helpers retain their original rows.
-- Nullable human actor is allowed only with an authenticated private run audit.
create function private.record_lifecycle_provenance() returns trigger
language plpgsql set search_path='' as $$
declare r private.season_automation_runs%rowtype; actor text;
begin
 actor:=to_jsonb(new)->>tg_argv[0];
 if actor is null then
 select * into strict r from private.season_automation_runs where execution_xid=pg_current_xact_id() and state='CLAIMED';
 perform private.assert_season_automation_run(r.id);
 if (to_jsonb(new)->>'league_id')::uuid is distinct from (select league_id from private.seasons where id=r.season_id)
 or (to_jsonb(new)?'season_id' and (to_jsonb(new)->>'season_id')::uuid<>r.season_id) then
 raise exception using errcode='42501',message='SYSTEM publication scope mismatch.';end if;
 new.automation_run_id:=r.id;new.execution_kind:='SYSTEM';
 elsif new.automation_run_id is not null or new.execution_kind<>'HUMAN' then
 raise exception using errcode='42501',message='Human and SYSTEM provenance cannot be mixed.';
 end if;
 return new;
end $$;
do $$ declare t text; col text; begin
 for t,col in select * from (values ('command_receipts','actor_user_id'),('live_odds_imports','imported_by'),('playoff_publications','created_by'),('playoff_round_publications','created_by'),('season_archive_versions','published_by')) fields loop
 execute format('alter table private.%I alter column %I drop not null, add column automation_run_id uuid references private.season_automation_runs(id), add column execution_kind text not null default ''HUMAN'' check(execution_kind in(''HUMAN'',''SYSTEM''))',t,col);
 execute format('alter table private.%I add constraint %I check((execution_kind=''HUMAN'' and %I is not null and automation_run_id is null) or (execution_kind=''SYSTEM'' and %I is null and automation_run_id is not null))',t,t||'_execution_actor',col,col);
 execute format('create index %I on private.%I(automation_run_id) where automation_run_id is not null',t||'_automation_run_idx',t);
 execute format('create trigger lifecycle_provenance before insert on private.%I for each row execute function private.record_lifecycle_provenance(%L)',t,col);
 end loop;
end $$;
create unique index automation_command_receipt_unique on private.command_receipts(league_id,command_name,idempotency_key) where execution_kind='SYSTEM';

-- Existing actual human reviews are unchanged. Either one human review or one
-- content-bound SYSTEM validation authorizes each activation and empty allowlist.
alter table private.player_prop_progressive_activations alter column review_id drop not null,
 add column system_validation_id uuid unique references private.player_prop_system_validations(id),
 add constraint progressive_activation_authority check(num_nonnulls(review_id,system_validation_id)=1);
alter table private.player_prop_empty_slots alter column review_id drop not null,
 add column system_validation_id uuid references private.player_prop_system_validations(id),
 add constraint progressive_empty_authority check(num_nonnulls(review_id,system_validation_id)=1);
create index progressive_empty_system_validation_idx on private.player_prop_empty_slots(system_validation_id);

create table private.season_automation_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 release_sha text check(release_sha ~ '^[0-9a-f]{40}$')
);
insert into private.season_automation_settings(singleton) values(true);
alter table private.season_automation_settings enable row level security;
revoke all on private.season_automation_settings from public,anon,authenticated,service_role;

create function api.configure_season_automation(p_league_slug text,p_command text,p_effective_week integer default null,p_slate_preset text default null,p_policy_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l private.leagues%rowtype;s private.seasons%rowtype;a private.season_automation%rowtype;c private.season_automation_consents%rowtype;minimum_week integer;
begin
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 perform private.assert_lifecycle_actor(l.id,null);
 select * into strict s from private.seasons where league_id=l.id order by created_at desc limit 1 for update;
 if s.mode<>'LIVE' or s.roster_locked_at is null or s.lifecycle not in('REGULAR','PLAYOFFS','CHAMPION_FINAL','WEEK_18_EXHIBITION')
 or exists(select 1 from private.owner_rehearsals where league_id=l.id) then
 raise exception using errcode='55000',message='Start a Live season before enabling automation.';end if;
 select * into a from private.season_automation where season_id=s.id for update;
 if p_command='ENABLE' then
 select coalesce(max(nfl_week) filter(where state<>'PLANNED'),1)+1 into minimum_week from private.season_weeks where season_id=s.id;
 if p_effective_week is null or p_effective_week<minimum_week or p_effective_week>18
 or p_slate_preset is null or p_slate_preset not in('ALL_NFL_GAMES','SUNDAY_AFTERNOON_AND_MONDAY')
 or p_policy_hash is distinct from private.season_automation_policy_hash() then
 raise exception using errcode='22023',message='Choose an unopened week and acknowledge the current season policy.';end if;
 -- An existing preparation carries immutable scope; resolve it before changing
 -- the season policy or preset. Exact duplicate consent is harmless.
 if a.season_id is not null then
 select * into strict c from private.season_automation_consents where id=a.consent_id;
 if not a.revoked and c.effective_week=p_effective_week and c.slate_preset=p_slate_preset and c.policy_hash=p_policy_hash then
 return jsonb_build_object('status',case when a.enabled then 'ENABLED' else 'PAUSED' end,'consentId',c.id);end if;
 if exists(select 1 from private.season_automation_week_plans p join private.season_weeks w on w.id=p.week_id where w.season_id=s.id and w.state='PLANNED') and not (a.revoked and c.slate_preset=p_slate_preset and c.policy_hash=p_policy_hash and c.effective_week=p_effective_week) then
 raise exception using errcode='55000',message='Resolve the prepared week before changing its approved policy.';end if;
 end if;
 insert into private.season_automation_consents(season_id,league_id,approved_by,effective_week,slate_preset,policy,policy_hash)
 values(s.id,l.id,auth.uid(),p_effective_week,p_slate_preset,private.season_automation_policy(),p_policy_hash) returning * into c;
 insert into private.season_automation(season_id,consent_id,enabled) values(s.id,c.id,true)
 on conflict(season_id) do update set consent_id=excluded.consent_id,enabled=true,revoked=false,revision=private.season_automation.revision+1,
 lease_id=null,lease_until=null,attempts=0,suspended=false,next_attempt_at=clock_timestamp(),blocker=null,operation_key=null;
 elsif p_command in('PAUSE','RESUME','REVOKE','RETRY') and a.season_id is not null then
 if p_command in('RESUME','RETRY') and a.revoked then raise exception using errcode='55000',message='Renew the season policy after revocation.';end if;
 if p_command='RETRY' and a.last_retry_at>clock_timestamp()-interval '5 minutes' then
 raise exception using errcode='55000',message='Wait five minutes before retrying automation.';end if;
 update private.season_automation_runs set state='STALE',finished_at=clock_timestamp() where id=a.lease_id and state='CLAIMED';
 update private.season_automation set enabled=case when p_command in('PAUSE','REVOKE') then false when p_command='RESUME' then true else enabled end,
 revoked=revoked or p_command='REVOKE',revision=revision+1,lease_id=null,lease_until=null,
 attempts=0,suspended=false,next_attempt_at=clock_timestamp(),blocker=null,
 last_retry_at=case when p_command='RETRY' then clock_timestamp() else last_retry_at end where season_id=s.id;
 else raise exception using errcode='22023',message='Invalid automation control.';end if;
 return jsonb_build_object('status','SAVED');
end $$;
revoke all on function api.configure_season_automation(text,text,integer,text,text) from public,anon,service_role;
grant execute on function api.configure_season_automation(text,text,integer,text,text) to authenticated;

-- Renewal is a new real human consent. Retain the original plan audit; only
-- an identical preset/policy and covered week can reuse that preparation.
create function private.automation_plan_authorized(p_week uuid,p_consent uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.season_automation_week_plans p
 join private.season_weeks w on w.id=p.week_id
 join private.season_automation_consents original on original.id=p.consent_id
 join private.season_automation_consents current on current.id=p_consent
 where w.id=p_week and current.season_id=w.season_id and current.league_id=w.league_id
 and current.effective_week<=w.nfl_week and current.slate_preset=original.slate_preset
 and current.policy=original.policy and current.policy_hash=original.policy_hash);
$$;
create function private.automation_expected_games(p_season uuid,p_week integer) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(g order by g->>'gameId'),'[]'::jsonb)
 from private.season_automation a join private.season_automation_consents c on c.id=a.consent_id
 cross join lateral jsonb_array_elements(a.schedule) g
 where a.season_id=p_season and (g->>'week')::integer=p_week
 and (c.slate_preset='ALL_NFL_GAMES' or
  (extract(isodow from (g->>'gameDate')::date)=7 and (g->>'gameTime' is null or (g->>'gameTime')::time>=time '13:00'))
  or extract(isodow from (g->>'gameDate')::date)=1);
$$;
create function private.automation_open_time(p_season uuid,p_week integer) returns timestamptz
language sql stable set search_path='' as $$
 -- Monday games belong to the week whose Tuesday was six days earlier.
 select ((min((g->>'gameDate')::date)-((extract(isodow from min((g->>'gameDate')::date))::integer+5)%7))::timestamp+interval '10 hours') at time zone 'America/New_York'
 from private.season_automation a cross join lateral jsonb_array_elements(a.schedule) g
 where a.season_id=p_season and (g->>'week')::integer=p_week;
$$;
create function private.automation_menu_evidence(p_week uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('generation',h.generation_id,'nominationHash',g.content_hash,'sourceValidation',p.source_validation_id,
 'sourcePolicy',p.source_policy,'selectionPolicy',p.selection_policy,
 'mappings',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from private.player_provider_mappings m
 join private.sports_events e on e.fixture_event_key=m.external_event_id where e.week_id=p_week),'[]'::jsonb),
 'observations',coalesce((select jsonb_agg(to_jsonb(o) order by o.mapping_id,o.verified_at,o.evidence_hash)
 from private.player_provider_mapping_observations o join private.player_provider_mappings m on m.id=o.mapping_id
 join private.sports_events e on e.fixture_event_key=m.external_event_id where e.week_id=p_week),'[]'::jsonb))
 from private.player_result_policy p left join private.player_catalog_nomination_heads h on h.week_id=p_week
 left join private.player_catalog_nomination_generations g on g.id=h.generation_id where p.singleton;
$$;
create function private.automation_system_validation(p_week uuid) returns uuid
language sql stable set search_path='' as $$
 select v.id from private.player_prop_system_validations v
 join private.season_weeks w on w.id=v.week_id
 join private.season_automation a on a.season_id=w.season_id and a.consent_id=v.consent_id
 join private.season_automation_consents c on c.id=a.consent_id
 where v.week_id=p_week and w.state='PLANNED' and a.enabled and not a.revoked
 and c.policy_hash=private.season_automation_policy_hash() and c.policy=private.season_automation_policy()
 and c.season_id=w.season_id and c.league_id=w.league_id and w.nfl_week>=c.effective_week
 and v.policy_hash=c.policy_hash and v.menu_hash=private.week2_props_menu_hash(w.id)
 and v.evidence_hash=encode(extensions.digest(private.automation_menu_evidence(w.id)::text,'sha256'),'hex')
 and v.rules_hash=(select sha256_hash from private.prepared_progressive_player_props_rulesets where mode='LIVE')
 and exists(select 1 from private.player_prop_controls where offers_enabled)
 and exists(select 1 from private.player_prop_leagues where season_id=w.season_id and enabled and rules_enabled and catalog_enabled)
 and exists(select 1 from private.player_result_policy where singleton and metadata_enabled and processing_enabled
  and source_policy='NFLVERSE_PRIMARY' and selection_policy='FEATURED_HIGHEST_STANDARD_LINES' and private.player_source_policy_validated())
 and not exists(select 1 from private.week_player_menu m where m.week_id=w.id and m.subject_id is not null
 and not exists(select 1 from private.player_menu_candidates(m.event_id,m.team,m.slot) x where x.subject_id=m.subject_id))
 order by v.validated_at desc limit 1;
$$;
alter function private.player_props_menu_reviewed(uuid) rename to player_props_menu_human_reviewed;
create function private.player_props_menu_reviewed(p_week_id uuid) returns boolean
language sql stable set search_path='' as $$
 select case when exists(select 1 from private.season_automation_week_plans where week_id=p_week_id) then
 private.automation_system_validation(p_week_id) is not null or exists(select 1 from private.player_prop_progressive_activations where week_id=p_week_id and system_validation_id is not null)
 else private.player_props_menu_human_reviewed(p_week_id) end;
$$;
alter function private.progressive_initial_menu_ready(uuid) rename to progressive_human_menu_ready;
create function private.progressive_initial_menu_ready(p_week_id uuid) returns boolean
language sql stable set search_path='' as $$
 select case when exists(select 1 from private.season_automation_week_plans where week_id=p_week_id)
 then private.automation_system_validation(p_week_id) is not null else private.progressive_human_menu_ready(p_week_id) end;
$$;

-- Scope authorization may be prepared from genuine season consent; it is never
-- a human review. Preserve the installed Week 2 and manual-season paths.
alter function private.ensure_progressive_week_authorized(uuid) rename to ensure_progressive_week_authorized_manually;
create function private.ensure_progressive_week_authorized(p_week_id uuid) returns void
language plpgsql set search_path='' as $$
declare w private.season_weeks%rowtype;c private.season_automation_consents%rowtype;p private.player_result_policy%rowtype;sha text;
begin
 select * into strict w from private.season_weeks where id=p_week_id;
 if not private.automation_week_enrolled(w.season_id,w.nfl_week) then perform private.ensure_progressive_week_authorized_manually(w.id);return;end if;
 if exists(select 1 from private.player_prop_progressive_authorizations where week_id=w.id) then return;end if;
 select c0.* into strict c from private.season_automation a join private.season_automation_consents c0 on c0.id=a.consent_id where a.season_id=w.season_id and a.enabled;
 select * into strict p from private.player_result_policy where singleton;
 select release_sha into sha from private.season_automation_settings where singleton;
 if w.state<>'PLANNED' or sha is null or not private.player_source_policy_validated() or p.source_policy<>'NFLVERSE_PRIMARY'
 or c.policy_hash<>private.season_automation_policy_hash() then raise exception using errcode='55000',message='Season props policy or release readiness is unavailable.';end if;
 insert into private.player_prop_progressive_authorizations(week_id,source_validation_id,release_sha,approval_reference)
 values(w.id,p.source_validation_id,sha,'Season policy consent '||c.id::text);
end $$;
-- An activated all-unavailable menu has no frozen subject yet. Re-entering
-- preparation during ordinary card acceptance must not attempt structural
-- INSERTs (whose BEFORE trigger correctly rejects even an upsert). Late slots
-- remain exclusively under the existing progressive publication authority.
do $$ declare d text;old text;begin
 d:=pg_get_functiondef('private.prepare_player_menu(uuid)'::regprocedure);
 old:=' if not private.player_props_menu_eligible(p_week_id) then return; end if;';
 if strpos(d,old)=0 then raise exception 'Player menu preparation baseline changed';end if;
 execute replace(d,old,old||chr(10)||' if exists(select 1 from private.player_prop_progressive_activations where week_id=p_week_id) then return;end if;');
end $$;
do $$ declare d text;old text;begin
 d:=pg_get_functiondef('private.pin_week_rules()'::regprocedure);
 old:='exists(select 1 from private.player_prop_progressive_seasons where season_id=v_season.id and league_id=v_season.league_id)';
 if strpos(d,old)=0 then raise exception 'Progressive rules authority changed';end if;
 execute replace(d,old,'('||old||' or private.automation_week_enrolled(v_season.id,new.nfl_week))');
end $$;

-- Hold mutable evidence through validation/opening. Directory observations use
-- mapping foreign keys; FOR UPDATE also fences their concurrent insertion.
create function private.lock_automation_validation_inputs(p_week uuid) returns void
language plpgsql set search_path='' as $$
begin
 perform 1 from private.sports_events where week_id=p_week order by id for update;
 perform 1 from private.player_prop_controls for share;
 perform 1 from private.player_prop_leagues where season_id=(select season_id from private.season_weeks where id=p_week) for share;
 perform 1 from private.prepared_progressive_player_props_rulesets where mode='LIVE' for share;
 if not exists(select 1 from private.player_prop_controls where offers_enabled)
 or not exists(select 1 from private.player_prop_leagues where season_id=(select season_id from private.season_weeks where id=p_week) and enabled and rules_enabled and catalog_enabled) then
 raise exception using errcode='55000',message='The approved season offer scope is unavailable.';end if;
 perform 1 from private.player_result_policy where singleton for share;
 perform 1 from private.player_catalog_jobs where week_id=p_week for update;
 if exists(select 1 from private.player_catalog_jobs where week_id=p_week and lease_until>clock_timestamp()) then
 raise exception using errcode='40001',message='Initial catalog acquisition is still running.';end if;
 perform 1 from private.player_catalog_nomination_heads where week_id=p_week for share;
 perform 1 from private.player_provider_mappings m where exists(select 1 from private.sports_events e where e.week_id=p_week and e.fixture_event_key=m.external_event_id) order by m.id for update;
end $$;
revoke all on function private.lock_automation_validation_inputs(uuid) from public,anon,authenticated,service_role;

create function private.validate_automated_player_menu(p_week uuid,p_run uuid) returns uuid
language plpgsql set search_path='' as $$
declare r private.season_automation_runs%rowtype;w private.season_weeks%rowtype;e jsonb;v uuid;h text;t timestamptz:=clock_timestamp();
begin
 r:=private.assert_season_automation_run(p_run);
 select * into strict w from private.season_weeks where id=p_week and season_id=r.season_id and nfl_week=r.nfl_week and state='PLANNED' for update;
 if not private.automation_plan_authorized(w.id,r.consent_id)
 or not exists(select 1 from private.player_catalog_nomination_heads where week_id=w.id)
 or exists(select 1 from private.player_catalog_jobs where week_id=w.id and lease_until>clock_timestamp()) then
 raise exception using errcode='55000',message='The initial props evidence is still being prepared.';end if;
 perform private.lock_automation_validation_inputs(w.id);
 perform private.require_week2_props_readiness(true);
 v:=private.automation_system_validation(w.id);if v is not null then return v;end if;
 -- No offered identity changes: this is exclusively an unopened, unactivated
 -- proposal. Missing/stale/ambiguous nominees resolve to unavailable slots.
 if exists(select 1 from private.player_prop_progressive_activations where week_id=w.id)
 or exists(select 1 from private.effective_position_receipts where week_id=w.id) then
 raise exception using errcode='55000',message='An offered player menu cannot be reselected.';end if;
 update private.week_player_menu set subject_id=null,confirmed_at=null,confirmed_by=null,unavailable_reason='PLAYER_IDENTITY_UNRESOLVED' where week_id=w.id;
 perform private.prepare_player_menu(w.id);
 if (select count(*) from private.week_player_menu where week_id=w.id)<>6*(select jsonb_array_length(expected_games) from private.season_automation_week_plans where week_id=w.id)
 or not exists(select 1 from private.week_player_menu where week_id=w.id) then
 raise exception using errcode='55000',message='Every expected game needs all six structural player slots.';end if;
 -- confirmed_at is the existing operational authorization timestamp. Null
 -- confirmed_by and the SYSTEM audit explicitly distinguish it from a person.
 update private.week_player_menu set confirmed_at=t,confirmed_by=null,
 unavailable_reason=case when subject_id is null then 'PLAYER_IDENTITY_UNRESOLVED' else null end where week_id=w.id;
 e:=private.automation_menu_evidence(w.id);h:=encode(extensions.digest(e::text,'sha256'),'hex');
 insert into private.player_prop_system_validations(week_id,consent_id,run_id,policy_hash,menu_hash,menu_snapshot,evidence_hash,evidence,rules_hash)
 select w.id,r.consent_id,r.id,private.season_automation_policy_hash(),private.week2_props_menu_hash(w.id),
 jsonb_agg(to_jsonb(m) order by m.event_id,m.team,m.slot),h,e,
 (select sha256_hash from private.prepared_progressive_player_props_rulesets where mode='LIVE')
 from private.week_player_menu m where week_id=w.id returning id into v;
 perform private.assert_season_automation_run(r.id);
 return v;
end $$;
alter function private.activate_progressive_player_menu(uuid) rename to activate_progressive_human_menu;
create function private.activate_progressive_player_menu(p_week_id uuid) returns void
language plpgsql set search_path='' as $$
declare w private.season_weeks%rowtype;v private.player_prop_system_validations%rowtype;t timestamptz:=clock_timestamp();
begin
 if not exists(select 1 from private.season_automation_week_plans where week_id=p_week_id) then perform private.activate_progressive_human_menu(p_week_id);return;end if;
 if exists(select 1 from private.player_prop_progressive_activations where week_id=p_week_id) then return;end if;
 select * into strict w from private.season_weeks where id=p_week_id for update;
 -- Called before the OPEN state transition, after the canonical rules pin is
 -- prepared. The same transaction freezes identities and the empty allowlist.
 select * into strict v from private.player_prop_system_validations where id=private.automation_system_validation(w.id);
 if not private.is_progressive_player_props_week(w.id) then raise exception using errcode='55000',message='Automation requires the approved progressive rules.';end if;
 insert into private.player_prop_progressive_activations(week_id,system_validation_id,ruleset_snapshot_id,activated_at) values(w.id,v.id,w.ruleset_snapshot_id,t);
 insert into private.player_prop_empty_slots(week_id,event_id,team,slot,system_validation_id,initial_menu)
 select w.id,m.event_id,m.team,m.slot,v.id,to_jsonb(m) from private.week_player_menu m where m.week_id=w.id and m.subject_id is null;
 update private.week_player_menu set frozen_at=t where week_id=w.id and subject_id is not null and frozen_at is null;
 insert into private.player_catalog_jobs(week_id) values(w.id) on conflict(week_id) do update set state='PENDING',completed_at=null;
end $$;

create function private.allocate_open_week_cards(p_week uuid) returns void
language plpgsql set search_path='' as $$
declare w private.season_weeks%rowtype;n integer;
begin
 select * into strict w from private.season_weeks where id=p_week for update;
 insert into private.weekly_cards(week_id,season_id,league_id,entry_id,owner_user_id,granted_credits,granted_at)
 select w.id,w.season_id,w.league_id,e.id,e.user_id,1000,clock_timestamp() from private.season_entries e where e.season_id=w.season_id
 on conflict(week_id,entry_id) do nothing;
 select count(*) into n from private.season_entries where season_id=w.season_id;
 if n not in(4,6,8,10,12,14,16) or (select count(*) from private.weekly_cards where week_id=w.id)<>n then
 raise exception using errcode='55000',message='One weekly card is required for every member.';end if;
end $$;

-- Extract the final installed operation bodies once. Public human wrappers keep
-- exactly their existing signatures, grants and authentication. Private shared
-- operations add only claimed-run authorization and honest actor provenance.
do $shared_lifecycle$
declare name text;sig text;args text;arg_names text;types text;d text;old text;new text;allowed text;
begin
 for name,sig,allowed in select * from (values
 ('store_live_odds_import','uuid,jsonb,text','PREPARE'),
 ('publish_next_live_week_slate','uuid,uuid,text[],text','PREPARE'),
 ('publish_postseason_week','uuid,uuid,text[],text','PREPARE'),
 ('publish_week18_exhibition','uuid,uuid,text[],text','PREPARE'),
 ('publish_playoff_qualification','uuid,text','QUALIFY'),
 ('finalize_champion_bracket','uuid,text','CHAMPION'),
 ('finalize_season_archive','uuid,text','ARCHIVE'),
 ('open_reviewed_player_prop_week','text,text','OPEN')) operations loop
 select pg_get_function_arguments(p.oid),array_to_string(p.proargnames,','),pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)
 into args,arg_names,types,d from pg_proc p where p.oid=('api.'||name||'('||sig||')')::regprocedure;
 d:=replace(d,'FUNCTION api.'||name||'('||args||')','FUNCTION private.lifecycle_'||name||'('||args||', p_automation_run uuid DEFAULT NULL)');
 d:=replace(d,' SECURITY DEFINER',' SECURITY INVOKER');
 d:=replace(d,'v_user_id uuid := (select auth.uid());','v_user_id uuid := case when p_automation_run is null then (select auth.uid()) else null end;');
 d:=replace(d,'u uuid:=(select auth.uid());','u uuid:=case when p_automation_run is null then (select auth.uid()) else null end;');
 if name='open_reviewed_player_prop_week' then
 old:=$old$if u is null or not private.is_league_commissioner(l.id) then raise exception using errcode='42501',message='Commissioner access required.'; end if;$old$;
 new:='perform private.assert_lifecycle_actor(l.id,p_automation_run);';
 else
 old:=E'if v_user_id is null or not private.is_league_commissioner(p_league_id) then\n    raise exception using errcode = ''42501'', message = ''Commissioner membership required.'';\n  end if;';
 new:='perform private.assert_lifecycle_actor(p_league_id,p_automation_run);';
 end if;
 if strpos(d,old)=0 then raise exception 'Lifecycle authentication baseline changed: %',name;end if;
 d:=replace(d,old,new||format(' if p_automation_run is not null and (select operation from private.season_automation_runs where id=p_automation_run)<>%L then raise exception using errcode=''42501'',message=''Wrong automation operation.'';end if;',allowed));
 d:=replace(d,'command.actor_user_id = v_user_id','(command.actor_user_id = v_user_id or (p_automation_run is not null and command.execution_kind=''SYSTEM'' and command.league_id=p_league_id))');
 d:=replace(d,'actor_user_id=u and command_name=', '(actor_user_id=u or (p_automation_run is not null and execution_kind=''SYSTEM'' and league_id=l.id)) and command_name=');
 if name='publish_week18_exhibition' then
 d:=replace(d,'api.publish_postseason_week(','private.lifecycle_publish_postseason_week(');
 d:=replace(d,E'    p_idempotency_key\n  );',E'    p_idempotency_key, p_automation_run\n  );');
 end if;
 if name in('publish_next_live_week_slate','publish_postseason_week') then
 -- A human recovery can open an already validated plan via the same authority.
 -- Preparation belongs to the claimed run while enrolled; revoke before manual staging.
 old:='  insert into private.season_weeks (';
 if strpos(d,old)=0 then raise exception 'Week publication baseline changed';end if;
 d:=replace(d,old,'  if p_automation_run is null and private.automation_week_enrolled(v_season.id,v_next_week) then raise exception using errcode=''55000'',message=''Season automation manages preparation; use retry or revoke before manual preparation.'';end if;'||chr(10)||old);
 -- Withhold cards/credits for automatic staging. Actual opening grants once.
 old:='  insert into private.weekly_cards (';
 if strpos(d,old)=0 then raise exception 'Card allocation baseline changed';end if;
 d:=replace(d,old,'  if not private.automation_week_enrolled(v_season.id,v_next_week) then'||chr(10)||old);
 if name='publish_next_live_week_slate' then
 old:=E'  perform private.prepare_player_menu(v_week_id);';
 d:=replace(d,old,'  else v_card_count:=0; end if;'||chr(10)||old);
 else
 old:='  select count(*) into v_card_count from private.weekly_cards as card where card.week_id = v_week_id;';
 d:=replace(d,old,'  end if;'||chr(10)||old);
 d:=replace(d,'or v_card_count <> v_publication.roster_size','or (not private.automation_week_enrolled(v_season.id,v_next_week) and v_card_count <> v_publication.roster_size)');
 end if;
 d:=replace(d,'''grantedCreditsPerEntry'', 1000','''grantedCreditsPerEntry'', case when v_card_count=0 then 0 else 1000 end');
 end if;
 -- Final commit-time fencing, including execution time crossing lease expiry.
 d:=replace(d,'  return v_response;', '  if p_automation_run is not null then perform private.assert_season_automation_run(p_automation_run);end if;'||chr(10)||'  return v_response;');
 execute d;
 execute format('revoke all on function private.lifecycle_%I(%s,uuid) from public,anon,authenticated,service_role',name,sig);
 execute format('create or replace function api.%I(%s) returns jsonb language plpgsql security definer set search_path='''' as $wrapper$ begin return private.lifecycle_%I(%s,null); end $wrapper$;',name,args,name,arg_names);
 end loop;
end $shared_lifecycle$;

create function private.assert_automated_week_openable(p_week uuid) returns void
language plpgsql set search_path='' as $$
declare w private.season_weeks%rowtype;p private.season_automation_week_plans%rowtype;a private.season_automation%rowtype;
begin
 select * into strict w from private.season_weeks where id=p_week for update;
 select * into p from private.season_automation_week_plans where week_id=w.id;
 if not found then return;end if;
 select * into strict a from private.season_automation where season_id=w.season_id for update;
 if not a.enabled or a.revoked or not private.automation_plan_authorized(w.id,a.consent_id) or clock_timestamp()<p.opens_at
 or not exists(select 1 from private.season_weeks prev where prev.season_id=w.season_id and prev.nfl_week=w.nfl_week-1 and prev.state='FINAL')
 or w.state<>'PLANNED' or w.common_lock_at<=clock_timestamp()
 or exists(select 1 from private.sports_events where week_id=w.id and (scheduled_start_at-interval '5 minutes'<=clock_timestamp() or actual_started_at is not null or state<>'SCHEDULED')) then
 raise exception using errcode='55000',message='The approved week is not ready for its scheduled opening.';end if;
 if (select count(*) from private.sports_events where week_id=w.id)<>jsonb_array_length(p.expected_games)
 or exists(select 1 from jsonb_array_elements(p.expected_games) g where not exists(select 1 from private.sports_events e where e.week_id=w.id
 and e.away_team=g->>'awayTeam' and e.home_team=g->>'homeTeam' and e.scheduled_start_at=(g->>'scheduledStartAt')::timestamptz
 and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id)))) then
 raise exception using errcode='55000',message='The prepared slate does not contain every expected game.';end if;
 perform private.lock_automation_validation_inputs(w.id);
 perform private.require_week2_props_readiness(true);
 if private.automation_system_validation(w.id) is null then
 raise exception using errcode='40001',message='The menu evidence changed and will be validated automatically.';end if;
end $$;
do $$ declare d text;old text;begin
 d:=pg_get_functiondef('private.automation_system_validation(uuid)'::regprocedure);
 execute replace(d,'w.state=''PLANNED''','w.state in(''PLANNED'',''OPEN'')');
 d:=pg_get_functiondef('private.lifecycle_open_reviewed_player_prop_week(text,text,uuid)'::regprocedure);
 old:=' if exists(select 1 from private.player_prop_progressive_authorizations where week_id=w.id)';
 if strpos(d,old)=0 then raise exception 'Shared opening baseline changed';end if;
 d:=replace(d,old,' perform private.assert_automated_week_openable(w.id);'||chr(10)||old);
 old:=' if private.is_progressive_player_props_week(w.id) then perform private.activate_progressive_player_menu(w.id);end if;';
 d:=replace(d,old,old||chr(10)||' if exists(select 1 from private.season_automation_week_plans where week_id=w.id) then perform private.allocate_open_week_cards(w.id);end if;');
 d:=replace(d,' return j;', ' if p_automation_run is not null then perform private.assert_season_automation_run(p_automation_run);end if; return j;');
 execute d;
end $$;

-- Enrolled exact-menu authorization is automatic. A normal authenticated menu
-- confirmation cannot turn a changed automatic proposal into a manual override.
do $$ declare d text;old text;begin
 d:=pg_get_functiondef('api.confirm_progressive_player_prop_menu(text,jsonb,text)'::regprocedure);
 old:=' answer:=private.confirm_player_prop_menu_before_progressive(p_league_slug,p_choices);';
 if strpos(d,old)=0 then raise exception 'Manual progressive review baseline changed';end if;
 execute replace(d,old,' if exists(select 1 from private.season_automation_week_plans where week_id=wk) then raise exception using errcode=''55000'',message=''This week uses automatic season-policy validation.'';end if;'||chr(10)||old);
end $$;

create function private.automation_dependency_hash(p_season uuid) returns text
language sql stable set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object(
 'weeks',(select jsonb_agg(jsonb_build_array(w.id,w.state,w.correction_window_closes_at,w.ruleset_snapshot_id) order by w.nfl_week) from private.season_weeks w where w.season_id=p_season),
 'source',(select jsonb_build_array(metadata_enabled,processing_enabled,source_policy,selection_policy,source_validation_id,nflverse_contract_validated,api_sports_contract_validated,results_daily_limit,metadata_daily_limit,requests_per_minute) from private.player_result_policy where singleton),
 'offerControls',(select to_jsonb(c) from private.player_prop_controls c),
 'scope',(select to_jsonb(l) from private.player_prop_leagues l where season_id=p_season),
 'budget',(select jsonb_build_array(enabled,daily_credit_limit,monthly_credit_limit,protected_core_daily_credits,protected_core_monthly_credits,provider_entitlement_credits,next_quota_reset_at,provider_cycle_verified_at) from private.odds_refresh_policy where singleton),
 'budgetDay',(clock_timestamp() at time zone 'UTC')::date,
 'entitlementFresh',exists(select 1 from private.odds_refresh_policy p where p.singleton and (p.provider_cycle_verified_at between clock_timestamp()-interval '10 minutes' and clock_timestamp() or exists(select 1 from private.odds_entitlement_probes proof where proof.state='SUCCEEDED' and proof.completed_at between clock_timestamp()-interval '10 minutes' and clock_timestamp() and proof.started_at>=p.provider_cycle_verified_at and proof.remaining::bigint+proof.used::bigint=p.provider_entitlement_credits))),
 'evidence',private.automation_menu_evidence((select id from private.season_weeks where season_id=p_season order by nfl_week desc limit 1)),
 'release',(select to_jsonb(r) from private.season_automation_settings r where singleton),
 'schedule',(select schedule_hash from private.season_automation where season_id=p_season),
 'lifecycle',(select lifecycle from private.seasons where id=p_season),
 'closure',(select jsonb_build_array(private.rolling_week_entries_closed(w.id),w.correction_window_closes_at<=clock_timestamp()) from private.season_weeks w where w.season_id=p_season order by w.nfl_week desc limit 1),
 'results',(select jsonb_agg(r.id order by r.id) from private.event_result_versions r join private.season_weeks w on w.id=r.week_id where w.season_id=p_season and not exists(select 1 from private.event_result_versions child where child.supersedes_id=r.id)),
 'scores',(select jsonb_agg(r.id order by r.id) from private.weekly_score_versions r join private.season_weeks w on w.id=r.week_id where w.season_id=p_season and not exists(select 1 from private.weekly_score_versions child where child.supersedes_id=r.id))
 )::text,'sha256'),'hex');
$$;
-- A stored-state projection only: no provider calls, claims or domain writes.
create function private.next_season_automation_action(p_season uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare s private.seasons%rowtype;a private.season_automation%rowtype;c private.season_automation_consents%rowtype;
 w private.season_weeks%rowtype;n integer;t timestamptz:=clock_timestamp();due timestamptz;op text;blocker text;games jsonb;
begin
 select * into s from private.seasons where id=p_season;
 select * into a from private.season_automation where season_id=s.id;
 if a.season_id is null then return jsonb_build_object('status','NOT_ENROLLED');end if;
 select * into strict c from private.season_automation_consents where id=a.consent_id;
 if not a.enabled or a.revoked then return jsonb_build_object('status',case when a.revoked then 'REVOKED' else 'PAUSED' end);end if;
 if s.mode<>'LIVE' or s.roster_locked_at is null or exists(select 1 from private.owner_rehearsals where league_id=s.league_id)
 or c.season_id<>s.id or c.league_id<>s.league_id or c.policy_hash<>private.season_automation_policy_hash() or c.policy<>private.season_automation_policy() then
 return jsonb_build_object('status','BLOCKED','blocker','POLICY_UNAVAILABLE');end if;
 select * into w from private.season_weeks where season_id=s.id order by nfl_week desc limit 1;
 if w.id is null then return jsonb_build_object('status','BLOCKED','blocker','START_SEASON');end if;
 if s.lifecycle='FINAL' then return jsonb_build_object('status','COMPLETE');end if;
 n:=case when w.state='PLANNED' then w.nfl_week else least(w.nfl_week+1,18) end;
 if w.nfl_week<c.effective_week-1 then return jsonb_build_object('status','WAITING','week',c.effective_week,'blocker','BEFORE_EFFECTIVE_WEEK');end if;
 if a.schedule is null or (w.state='FINAL' and w.nfl_week<18 and a.schedule_fetched_at<t-interval '24 hours'
 and private.automation_open_time(s.id,n)-interval '2 hours'<=t) then op:='SYNC_SCHEDULE';due:=t;
 elsif w.state='PLANNED' then
 n:=w.nfl_week;
 select p.opens_at into due from private.season_automation_week_plans p where p.week_id=w.id;
 if not found then return jsonb_build_object('status','BLOCKED','week',n,'blocker','MANUAL_PREPARATION');end if;
 if w.common_lock_at<=t then return jsonb_build_object('status','BLOCKED','week',n,'blocker','ENTRY_CUTOFF_PASSED');end if;
 if not exists(select 1 from private.season_weeks prev where prev.season_id=s.id and prev.nfl_week=n-1 and prev.state='FINAL') then
 return jsonb_build_object('status','WAITING','week',n,'blocker','PREVIOUS_WEEK_RESULTS');end if;
 if private.automation_system_validation(w.id) is null then
 if not exists(select 1 from private.player_catalog_nomination_heads where week_id=w.id)
 or exists(select 1 from private.player_catalog_jobs where week_id=w.id and lease_until>t) then
 return jsonb_build_object('status','WAITING','week',n,'blocker','PROPS_PREPARING','dueAt',due);end if;
 op:='VALIDATE';due:=t;
 else op:='OPEN';end if;
 elsif w.state<>'FINAL' then
 -- Reuse canonical recomputation for due deadline/finality recovery; it never
 -- manufactures an event result or treats an empty prop slot as an obligation.
 if w.common_lock_at<=t and (w.state='OPEN' or private.rolling_week_entries_closed(w.id)) then op:='RECONCILE';n:=w.nfl_week;due:=t;
 else return jsonb_build_object('status','WAITING','week',n,'blocker','PREVIOUS_WEEK_RESULTS');end if;
 elsif w.nfl_week=14 and s.lifecycle='REGULAR' then
 op:='QUALIFY';n:=15;due:=w.correction_window_closes_at;
 elsif w.nfl_week=17 and s.lifecycle='PLAYOFFS' then
 op:='CHAMPION';n:=17;due:=w.correction_window_closes_at;
 elsif w.nfl_week=18 then op:='ARCHIVE';n:=18;due:=w.correction_window_closes_at;
 else
 op:='PREPARE';due:=private.automation_open_time(s.id,n)-interval '2 hours';
 games:=private.automation_expected_games(s.id,n);
 if jsonb_array_length(games)=0 then return jsonb_build_object('status','BLOCKED','week',n,'blocker','SCHEDULE_INCOMPLETE');end if;
 if exists(select 1 from jsonb_array_elements(games) g where g->>'scheduledStartAt' is null) then
 return jsonb_build_object('status','BLOCKED','week',n,'blocker','SCHEDULE_TIME_PENDING');end if;
 if exists(select 1 from jsonb_array_elements(games) g where (g->>'scheduledStartAt')::timestamptz-interval '5 minutes'<=t) then
 return jsonb_build_object('status','BLOCKED','week',n,'blocker','ENTRY_CUTOFF_PASSED');end if;
 if w.nfl_week>=15 then due:=greatest(due,w.correction_window_closes_at);end if;
 end if;
 if due is null then return jsonb_build_object('status','WAITING','week',n,'blocker','REVIEW_WINDOW');end if;
 if op='RECONCILE' and a.last_success_operation_key=op||':'||n and a.last_success_dependency_hash=private.automation_dependency_hash(s.id) then
 return jsonb_build_object('status','WAITING','week',n,'blocker','PREVIOUS_WEEK_RESULTS');end if;
 if a.suspended and a.operation_key=op||':'||n and a.failure_dependency_hash=private.automation_dependency_hash(s.id) then return jsonb_build_object('status','SUSPENDED','operation',op,'week',n,'blocker',coalesce(a.blocker,'OPERATION_FAILED'));end if;
 if a.failure_dependency_hash is null or a.failure_dependency_hash=private.automation_dependency_hash(s.id) then due:=greatest(due,a.next_attempt_at);end if;
 if a.lease_until>t then due:=greatest(due,a.lease_until);end if;
 return jsonb_build_object('status',case when due<=t then 'DUE' else 'WAITING' end,'operation',op,'week',n,'dueAt',due);
end $$;

create function api.get_season_automation(p_league_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l private.leagues%rowtype;s private.seasons%rowtype;a private.season_automation%rowtype;c private.season_automation_consents%rowtype;
begin
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 if auth.uid() is null or not private.is_league_commissioner(l.id) then raise exception using errcode='42501',message='Commissioner membership required.';end if;
 select * into strict s from private.seasons where league_id=l.id order by created_at desc limit 1;
 if s.mode<>'LIVE' or exists(select 1 from private.owner_rehearsals where league_id=l.id) then return null;end if;
 select * into a from private.season_automation where season_id=s.id;
 select * into c from private.season_automation_consents where id=a.consent_id;
 return jsonb_build_object('seasonId',s.id,'eligible',s.roster_locked_at is not null and s.lifecycle<>'FINAL',
 'minimumWeek',(select least(18,coalesce(max(nfl_week) filter(where state<>'PLANNED'),1)+1) from private.season_weeks where season_id=s.id),
 'enabled',coalesce(a.enabled,false),'revoked',coalesce(a.revoked,false),'enrolled',a.season_id is not null,
 'effectiveWeek',c.effective_week,'preset',c.slate_preset,'policyRevision','SEASON_AUTOMATION_V1','policyHash',private.season_automation_policy_hash(),
 'approvedAt',c.approved_at,'lastOutcome',a.last_outcome,'blocker',a.blocker,'next',private.next_season_automation_action(s.id),
 'workerReady',exists(select 1 from private.season_automation_settings where enabled and release_sha is not null),
 'automaticMenuWeek',(select max(w.nfl_week) from private.season_automation_week_plans p join private.season_weeks w on w.id=p.week_id where w.season_id=s.id),
 'validatedWeek',(select max(w.nfl_week) from private.player_prop_system_validations v join private.season_weeks w on w.id=v.week_id where w.season_id=s.id));
end $$;
revoke all on function api.get_season_automation(text) from public,anon,service_role;
grant execute on function api.get_season_automation(text) to authenticated;

create function api.claim_season_automation() returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record;a private.season_automation%rowtype;c private.season_automation_consents%rowtype;r private.season_automation_runs%rowtype;j jsonb;
begin
 if not exists(select 1 from private.season_automation_settings where enabled and release_sha is not null) then return jsonb_build_object('status','DISABLED');end if;
 for candidate in select a0.season_id from private.season_automation a0 join private.seasons s on s.id=a0.season_id
 where a0.enabled and not a0.revoked and s.mode='LIVE' and s.lifecycle<>'FINAL'
 and not exists(select 1 from private.owner_rehearsals where league_id=s.league_id)
 and (a0.lease_until is null or a0.lease_until<=clock_timestamp())
 order by a0.last_checked_at nulls first,a0.season_id limit 20 loop
 -- Use the established season lock order. Never retain it over HTTP work.
 perform 1 from private.seasons where id=candidate.season_id for update skip locked;
 if not found then continue;end if;
 select * into a from private.season_automation where season_id=candidate.season_id for update skip locked;
 if not found then continue;end if;
 j:=private.next_season_automation_action(a.season_id);
 update private.season_automation set last_checked_at=clock_timestamp() where season_id=a.season_id;
 if j->>'status'<>'DUE' then continue;end if;
 select * into strict c from private.season_automation_consents where id=a.consent_id;
 if a.lease_id is not null then update private.season_automation_runs set state='STALE',finished_at=clock_timestamp() where id=a.lease_id and state='CLAIMED';end if;
 insert into private.season_automation_runs(season_id,consent_id,revision,generation,operation,nfl_week,operation_key,lease_until)
 values(a.season_id,a.consent_id,a.revision,a.generation+1,j->>'operation',(j->>'week')::integer,(j->>'operation')||':'||(j->>'week'),clock_timestamp()+interval '90 seconds') returning * into r;
 update private.season_automation set generation=r.generation,lease_id=r.id,lease_until=r.lease_until,
 attempts=case when operation_key=r.operation_key and (failure_dependency_hash is null or failure_dependency_hash=private.automation_dependency_hash(a.season_id)) then attempts else 0 end,suspended=false,
 operation_key=r.operation_key,next_attempt_at=date_bin(interval '5 minutes',clock_timestamp(),timestamptz '2000-01-01')+interval '5 minutes' where season_id=a.season_id;
 return jsonb_build_object('status','CLAIMED','runId',r.id,'operation',r.operation,'week',r.nfl_week,
 'season',(select nfl_year from private.seasons where id=r.season_id),'preset',c.slate_preset);
 end loop;
 return jsonb_build_object('status','IDLE');
end $$;
revoke all on function api.claim_season_automation() from public,anon,authenticated;
grant execute on function api.claim_season_automation() to service_role;

create function private.record_automation_schedule(p_run uuid,p_schedule jsonb) returns void
language plpgsql set search_path='' as $$
declare r private.season_automation_runs%rowtype;s private.seasons%rowtype;g jsonb;h text;
begin
 r:=private.assert_season_automation_run(p_run);select * into strict s from private.seasons where id=r.season_id;
 if r.operation not in('SYNC_SCHEDULE','PREPARE') or jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)<>272 then
 raise exception using errcode='22023',message='A complete official regular-season schedule is required.';end if;
 if (select count(distinct g->>'gameId') from jsonb_array_elements(p_schedule)g)<>272
 or (select count(distinct (g->>'week')::integer) from jsonb_array_elements(p_schedule)g)<>18
 or (select count(distinct team) from jsonb_array_elements(p_schedule)g cross join lateral unnest(array[g->>'awayTeam',g->>'homeTeam'])team)<>32
 or exists(select 1 from jsonb_array_elements(p_schedule)g cross join lateral unnest(array[g->>'awayTeam',g->>'homeTeam'])team group by team having count(*)<>17)
 or exists(select 1 from jsonb_array_elements(p_schedule)g cross join lateral unnest(array[g->>'awayTeam',g->>'homeTeam'])team group by g->>'week',team having count(*)<>1) then
 raise exception using errcode='22023',message='The official schedule is incomplete or ambiguous.';end if;
 for g in select value from jsonb_array_elements(p_schedule) loop
 if g->>'season' is null or (g->>'season')::integer<>s.nfl_year or g->>'gameType' is distinct from 'REG'
 or g->>'week' is null or (g->>'week')::integer not between 1 and 18 or g->>'gameId' is null
 or g->>'awayTeam' is null or g->>'homeTeam' is null or g->>'awayTeam'=g->>'homeTeam'
 or g->>'gameDate' is null or extract(year from (g->>'gameDate')::date) not in(s.nfl_year,s.nfl_year+1)
 or (g->>'scheduledStartAt' is not null and (((g->>'scheduledStartAt')::timestamptz at time zone 'America/New_York')::date<>(g->>'gameDate')::date
 or ((g->>'scheduledStartAt')::timestamptz at time zone 'America/New_York')::time<>(g->>'gameTime')::time)) then
 raise exception using errcode='22023',message='Official game identity or season is invalid.';end if;
 end loop;
 select encode(extensions.digest(jsonb_agg(g order by g->>'gameId')::text,'sha256'),'hex') into h from jsonb_array_elements(p_schedule)g;
 update private.season_automation set schedule=p_schedule,schedule_hash=h,schedule_fetched_at=clock_timestamp() where season_id=s.id;
end $$;

create function api.claim_season_automation_odds(p_run uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r private.season_automation_runs%rowtype;id uuid;l uuid;
begin
 r:=private.assert_season_automation_run(p_run);
 if r.operation<>'PREPARE' then raise exception using errcode='42501',message='Only due preparation can acquire markets.';end if;
 select league_id into l from private.seasons where id=r.season_id;
 perform 1 from private.odds_refresh_policy for update;
 perform private.require_week2_props_readiness(true);
 if exists(select 1 from private.provider_requests where kind='ODDS' and league_id=l and attempted_at>clock_timestamp()-interval '60 seconds') then raise exception 'QUOTE_REFRESH_COOLDOWN';end if;
 perform private.reserve_provider_credits(3);
 insert into private.provider_requests(kind,league_id,actor_user_id) values('ODDS',l,null) returning provider_requests.id into id;
 return id;
end $$;
revoke all on function api.claim_season_automation_odds(uuid) from public,anon,authenticated;
grant execute on function api.claim_season_automation_odds(uuid) to service_role;

create function api.complete_season_automation(p_run uuid,p_schedule jsonb default null,p_import jsonb default null,p_failure text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.season_automation_runs%rowtype;s private.seasons%rowtype;a private.season_automation%rowtype;
 j jsonb;answer jsonb;games jsonb;ids text[];wk uuid;v uuid;key text;failure text;attempt integer;
begin
 select * into strict r from private.season_automation_runs where id=p_run;
 if r.state='SUCCEEDED' then return r.response||jsonb_build_object('replayed',true);end if;
 r:=private.assert_season_automation_run(p_run);select * into strict s from private.seasons where id=r.season_id;
 if p_failure is not null and p_failure not in('SCHEDULE_UNAVAILABLE','MARKETS_UNAVAILABLE','PROVIDER_BUDGET','WORKER_UNAVAILABLE') then
 raise exception using errcode='22023',message='Unknown automation failure code.';end if;
 failure:=p_failure;
 if failure is null then
 begin
 key:='automation:'||s.id::text||':'||r.operation_key;
 case r.operation
 when 'SYNC_SCHEDULE' then
 perform private.record_automation_schedule(r.id,p_schedule);answer:=jsonb_build_object('status','SCHEDULE_READY');
 when 'PREPARE' then
 perform private.require_week2_props_readiness(true);
 if not private.player_props_target_week(s.id,r.nfl_week) or not private.player_catalog_staged_week(s.id,r.nfl_week) then
 raise exception using errcode='55000',message='Props season release scope is unavailable.';end if;
 perform private.record_automation_schedule(r.id,p_schedule);
 games:=private.automation_expected_games(s.id,r.nfl_week);
 if clock_timestamp()<private.automation_open_time(s.id,r.nfl_week)-interval '2 hours' or jsonb_array_length(games)=0
 or jsonb_array_length(p_import->'events') is distinct from jsonb_array_length(games)
 or exists(select 1 from jsonb_array_elements(games)g where
 (select count(*) from jsonb_array_elements(p_import->'events')e where e->>'awayTeam'=g->>'awayTeam' and e->>'homeTeam'=g->>'homeTeam'
 and (e->>'scheduledStartAt')::timestamptz=(g->>'scheduledStartAt')::timestamptz)<>1) then
 raise exception using errcode='22023',message='Every selected official game needs complete current markets.';end if;
 j:=private.lifecycle_store_live_odds_import(s.league_id,p_import,key||':import',r.id);
 select array_agg(e->>'externalEventId' order by e->>'externalEventId') into ids from jsonb_array_elements(p_import->'events')e;
 if r.nfl_week<=14 then answer:=private.lifecycle_publish_next_live_week_slate(s.league_id,(j->>'importId')::uuid,ids,key,r.id);
 elsif r.nfl_week=18 then answer:=private.lifecycle_publish_week18_exhibition(s.league_id,(j->>'importId')::uuid,ids,key,r.id);
 else answer:=private.lifecycle_publish_postseason_week(s.league_id,(j->>'importId')::uuid,ids,key,r.id);end if;
 wk:=(answer->>'weekId')::uuid;
 if not exists(select 1 from private.season_weeks where id=wk and season_id=s.id and nfl_week=r.nfl_week and state='PLANNED') then
 raise exception using errcode='40001',message='Prepared week scope changed.';end if;
 insert into private.season_automation_week_plans(week_id,consent_id,run_id,expected_games,schedule_hash,opens_at)
 select wk,r.consent_id,r.id,games,schedule_hash,private.automation_open_time(s.id,r.nfl_week) from private.season_automation where season_id=s.id;
 answer:=answer||jsonb_build_object('status','PREPARED');
 when 'VALIDATE' then
 select id into strict wk from private.season_weeks where season_id=s.id and nfl_week=r.nfl_week;
 v:=private.validate_automated_player_menu(wk,r.id);answer:=jsonb_build_object('status','VALIDATED','weekId',wk,'validationId',v);
 when 'OPEN' then
 select id into strict wk from private.season_weeks where season_id=s.id and nfl_week=r.nfl_week and state='PLANNED';
 answer:=private.lifecycle_open_reviewed_player_prop_week((select slug from private.leagues where id=s.league_id),key,r.id)||jsonb_build_object('status','OPENED');
 when 'RECONCILE' then
 select id into strict wk from private.season_weeks where season_id=s.id and nfl_week=r.nfl_week;
 perform private.reconcile_rolling_week_closures(s.league_id);
 -- Legacy lock compatibility remains with the installed score authority. The
 -- current progressive package uses rolling closure and canonical recompute.
 if exists(select 1 from private.season_weeks where id=wk and state in('LOCKED','PROVISIONAL')) then perform private.recompute_stage1_week(wk,null);end if;
 answer:=jsonb_build_object('status','RECONCILED','weekId',wk);
 when 'QUALIFY' then answer:=private.lifecycle_publish_playoff_qualification(s.league_id,key,r.id)||jsonb_build_object('status','QUALIFIED');
 when 'CHAMPION' then answer:=private.lifecycle_finalize_champion_bracket(s.league_id,key,r.id)||jsonb_build_object('status','CHAMPION_FINAL');
 when 'ARCHIVE' then answer:=private.lifecycle_finalize_season_archive(s.league_id,key,r.id)||jsonb_build_object('status','ARCHIVED');
 else raise exception 'Unsupported lifecycle action';
 end case;
 perform private.assert_season_automation_run(r.id);
 exception when others then
 -- This subtransaction rolls back every partial domain effect. Record a
 -- sanitized failure, never a successful receipt for a failed command.
 failure:=case when sqlstate='40001' then 'STATE_CHANGED' when sqlstate='22023' then 'SLATE_OR_EVIDENCE_INCOMPLETE'
 when sqlstate='55000' then 'READINESS_UNAVAILABLE' else 'OPERATION_FAILED' end;
 end;
 end if;
 -- A revoked/expired claim cannot even commit a successful completion marker.
 perform private.assert_season_automation_run(r.id);
 if failure is null then
 update private.season_automation_runs set state='SUCCEEDED',response=answer,finished_at=clock_timestamp() where id=r.id;
 update private.season_automation set lease_id=null,lease_until=null,attempts=0,suspended=false,last_outcome=answer->>'status',blocker=null,failure_dependency_hash=null,last_success_operation_key=r.operation_key,last_success_dependency_hash=private.automation_dependency_hash(s.id),
 next_attempt_at=date_bin(interval '5 minutes',clock_timestamp(),timestamptz '2000-01-01')+interval '5 minutes' where season_id=s.id;
 return answer;
 end if;
 select * into strict a from private.season_automation where season_id=s.id;
 attempt:=least(a.attempts+1,4);
 update private.season_automation_runs set state='FAILED',response=jsonb_build_object('status','FAILED','blocker',failure),finished_at=clock_timestamp() where id=r.id;
 update private.season_automation set lease_id=null,lease_until=null,attempts=attempt,suspended=attempt>=4,last_outcome='FAILED',blocker=failure,failure_dependency_hash=private.automation_dependency_hash(s.id),
 next_attempt_at=clock_timestamp()+case attempt when 1 then interval '5 minutes' when 2 then interval '15 minutes' else interval '60 minutes' end where season_id=s.id;
 return jsonb_build_object('status','FAILED','blocker',failure);
end $$;
revoke all on function api.complete_season_automation(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function api.complete_season_automation(uuid,jsonb,jsonb,text) to service_role;

create function private.dispatch_season_automation() returns bigint
language plpgsql security definer set search_path='' as $$
declare secret text;target text;request_id bigint;
begin
 if not exists(select 1 from private.season_automation_settings where enabled and release_sha is not null)
 or not exists(select 1 from private.season_automation a where a.enabled and not a.revoked and private.next_season_automation_action(a.season_id)->>'status'='DUE') then return null;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='score_job_secret';
 select decrypted_secret into target from vault.decrypted_secrets where name='score_job_url';
 if target is distinct from 'https://www.ledgerleagues.com/api/operations/scores' or coalesce(length(secret),0)<32 then raise exception 'Lifecycle dispatcher configuration unavailable';end if;
 select net.http_post(url:='https://www.ledgerleagues.com/api/operations/season-automation',
 headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}',timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;
create function private.attach_season_automation_dispatch_hook() returns boolean
language plpgsql set search_path='' as $$
declare d text;anchor text:=E'begin\n';pos integer;
begin
 d:=pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure);
 if strpos(d,'perform private.dispatch_season_automation();')>0 then return false;end if;
 pos:=strpos(d,anchor);if pos=0 then raise exception 'Score dispatcher baseline changed';end if;
 execute overlay(d placing anchor||E'  begin\n    perform private.dispatch_season_automation();\n  exception when others then\n    raise warning ''Lifecycle dispatch unavailable (%).'',SQLSTATE;\n  end;\n' from pos for length(anchor));
 return true;
end $$;
select private.attach_season_automation_dispatch_hook();

-- Never grant internal shared actors, validation, claim fencing or scheduler
-- helpers to participant roles (nor direct invocation by the HTTP service).
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and (p.proname like '%season_automation%' or p.proname like 'automation_%'
 or p.proname in('assert_lifecycle_actor','record_lifecycle_provenance','validate_automated_player_menu','allocate_open_week_cards','assert_automated_week_openable',
 'progressive_human_menu_ready','progressive_initial_menu_ready','player_props_menu_human_reviewed','player_props_menu_reviewed','activate_progressive_player_menu','activate_progressive_human_menu','ensure_progressive_week_authorized','ensure_progressive_week_authorized_manually')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;

-- Truthful UI provenance: a SYSTEM validation is never labelled commissioner
-- review. Automated menus remain viewable with no weekly confirmation button.
alter function api.get_player_prop_menu(text) rename to get_player_prop_menu_before_automation;
alter function api.get_player_prop_menu_before_automation(text) set schema private;
revoke all on function private.get_player_prop_menu_before_automation(text) from public,anon,authenticated,service_role;
create function api.get_player_prop_menu(p_league_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j jsonb;wk uuid;automated boolean;
begin
 j:=private.get_player_prop_menu_before_automation(p_league_slug);wk:=(j->>'weekId')::uuid;
 automated:=exists(select 1 from private.season_automation_week_plans where week_id=wk);
 if automated then
 j:=jsonb_set(j,'{slots}',coalesce((select jsonb_agg(slot||jsonb_build_object('publicationMode',case when slot->>'subjectId' is not null and (slot->>'confirmed')::boolean then 'AUTOMATIC' else null end) order by ord)
 from jsonb_array_elements(j->'slots') with ordinality original(slot,ord)),'[]'));
 end if;
 return j||jsonb_build_object('automaticValidation',automated,'canOpen',case when automated then false else coalesce((j->>'canOpen')::boolean,false) end);
end $$;
revoke all on function api.get_player_prop_menu(text) from public,anon;
grant execute on function api.get_player_prop_menu(text) to authenticated;
