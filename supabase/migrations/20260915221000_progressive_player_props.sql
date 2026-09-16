-- Additive Ruleset 1.5 / Bible 3.4: reviewed empty slots may publish once before
-- their event cutoff. Existing 1.4 packages, global catalogs and receipts stay
-- unchanged. This migration grants no hosted authorization and enables nothing.
create table private.prepared_progressive_player_props_rulesets (
 mode text primary key check(mode in('LIVE','SIMULATION')),canonical_json jsonb not null,
 sha256_hash text not null check(sha256_hash ~ '^[0-9a-f]{64}$')
);
insert into private.prepared_progressive_player_props_rulesets
 select mode,j,encode(extensions.digest(private.canonical_ruleset_json(j),'sha256'),'hex') from (
 select mode,jsonb_set(jsonb_set(jsonb_set(jsonb_set(canonical_json,'{version}','"1.5"'),'{productBibleVersion}','"3.4"'),
 '{markets,playerProps,menuFreeze}','"FIRST_PUBLICATION_PER_SLOT"'),'{markets,playerProps,emptySlotPublication}','"AUTOMATIC_BEFORE_EVENT_CUTOFF"') j
 from private.prepared_player_props_rulesets) packages;
do $canonical_parity$
begin
 if (select sha256_hash from private.prepared_progressive_player_props_rulesets where mode='LIVE')<>'51895827d841c6e3cbb9a98174f2f12a4fb2a16627621b28b991b0c8e7221b5f'
 or (select sha256_hash from private.prepared_progressive_player_props_rulesets where mode='SIMULATION')<>'23a9a4a3ae84dbd79e29137dde749b4ce0fe2ac685278e45007b4a8bc189ad17' then
 raise exception 'Progressive Ruleset 1.5 canonical package differs from the validated application contract';end if;
end; $canonical_parity$;
alter table private.prepared_progressive_player_props_rulesets enable row level security;
revoke all on private.prepared_progressive_player_props_rulesets from public,anon,authenticated,service_role;
create trigger prepared_progressive_props_immutable before update or delete on private.prepared_progressive_player_props_rulesets
 for each row execute function private.reject_competitive_mutation();
create function private.progressive_player_props_ruleset_package(p_mode text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select canonical_json from private.prepared_progressive_player_props_rulesets where mode=p_mode;
$$;
create function private.is_progressive_player_props_week(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select r.ruleset_version='1.5' and r.canonical_json=private.progressive_player_props_ruleset_package(r.mode)
 from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.id=p_week_id),false);
$$;
create or replace function private.is_player_props_week(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.is_progressive_player_props_week(p_week_id) or coalesce((select r.ruleset_version='1.4' and r.canonical_json=private.player_props_ruleset_package(r.mode)
 from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.id=p_week_id),false);
$$;
create or replace function private.is_rolling_week(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.is_player_props_week(p_week_id) or coalesce((select r.ruleset_version='1.3' and r.canonical_json=private.rolling_ruleset_package(r.mode)
 from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.id=p_week_id),false);
$$;
do $card_rules$
declare d text;
begin
 d:=pg_get_functiondef('private.season_card_rules(uuid,text)'::regprocedure);
 if strpos(d,$old$in ('1.0','1.1','1.2','1.3','1.4')$old$)=0 then raise exception 'Progressive card version baseline changed';end if;
 d:=replace(d,$old$in ('1.0','1.1','1.2','1.3','1.4')$old$,$new$in ('1.0','1.1','1.2','1.3','1.4','1.5')$new$);
 d:=replace(d,$old$when '1.4' then '3.3'$old$,$new$when '1.5' then '3.4' when '1.4' then '3.3'$new$);
 d:=replace(d,$old$  if v_snapshot.ruleset_version='1.4' then$old$,$new$  if v_snapshot.ruleset_version='1.5' then
    if v_json is distinct from private.progressive_player_props_ruleset_package(p_mode) then
      raise exception using errcode='22023',message='UNSUPPORTED_SEASON_CARD_RULES';end if;
    return jsonb_build_object('card',v_json->'card','concentration',v_json->'concentration','markets',v_json->'markets');
  end if;
  if v_snapshot.ruleset_version='1.4' then$new$);execute d;
end; $card_rules$;

create table private.player_prop_progressive_authorizations (
 week_id uuid primary key references private.season_weeks(id),
 source_validation_id uuid not null references private.player_source_validations(id),
 release_sha text not null check(release_sha ~ '^[0-9a-f]{40}$'),
 approval_reference text not null check(char_length(btrim(approval_reference)) between 8 and 500),
 authorized_at timestamptz not null default clock_timestamp()
);
create table private.player_prop_progressive_reviews (
 id uuid primary key default gen_random_uuid(),week_id uuid not null references private.player_prop_progressive_authorizations(week_id),
 reviewed_by uuid not null references private.profiles(id),menu_hash text not null check(menu_hash ~ '^[0-9a-f]{64}$'),
 menu_snapshot jsonb not null check(jsonb_typeof(menu_snapshot)='array'),
 reviewed_at timestamptz not null default clock_timestamp(),unique(week_id,menu_hash)
);
create table private.player_prop_empty_slots (
 week_id uuid not null references private.season_weeks(id),event_id uuid not null references private.sports_events(id),
 team text not null,slot text not null check(slot in('QB_PASS','RB_RUSH','RECEIVER')),
 review_id uuid not null references private.player_prop_progressive_reviews(id),initial_menu jsonb not null,
 primary key(event_id,team,slot)
);
create table private.player_prop_slot_publications (
 week_id uuid not null references private.season_weeks(id),event_id uuid not null,team text not null,slot text not null,
 subject_id uuid not null references private.player_subjects(id),source_validation_id uuid not null references private.player_source_validations(id),
 nomination jsonb not null,evidence_hash text not null check(evidence_hash ~ '^[0-9a-f]{64}$'),
 published_at timestamptz not null default clock_timestamp(),publication_transaction_id xid8 not null default pg_current_xact_id(),
 primary key(event_id,team,slot),foreign key(event_id,team,slot) references private.player_prop_empty_slots(event_id,team,slot)
);
create table private.player_prop_progressive_seasons (
 season_id uuid primary key references private.seasons(id),league_id uuid not null references private.leagues(id),
 initial_week_id uuid not null unique references private.player_prop_progressive_authorizations(week_id),
 source_validation_id uuid not null references private.player_source_validations(id),
 release_sha text not null check(release_sha ~ '^[0-9a-f]{40}$'),approval_reference text not null,
 activated_at timestamptz not null default clock_timestamp()
);
create table private.player_prop_progressive_activations (
 week_id uuid primary key references private.player_prop_progressive_authorizations(week_id),
 review_id uuid not null unique references private.player_prop_progressive_reviews(id),
 ruleset_snapshot_id uuid not null references private.season_ruleset_snapshots(id),
 activated_at timestamptz not null default clock_timestamp(),activation_transaction_id xid8 not null default pg_current_xact_id()
);
create index progressive_season_league_idx on private.player_prop_progressive_seasons(league_id);
create index progressive_season_validation_idx on private.player_prop_progressive_seasons(source_validation_id);
create index progressive_activation_rules_idx on private.player_prop_progressive_activations(ruleset_snapshot_id);
create index progressive_authorization_validation_idx on private.player_prop_progressive_authorizations(source_validation_id);
create index progressive_review_actor_idx on private.player_prop_progressive_reviews(reviewed_by);
create index progressive_empty_week_idx on private.player_prop_empty_slots(week_id);
create index progressive_empty_review_idx on private.player_prop_empty_slots(review_id);
create index progressive_publication_week_idx on private.player_prop_slot_publications(week_id);
create index progressive_publication_subject_idx on private.player_prop_slot_publications(subject_id);
create index progressive_publication_validation_idx on private.player_prop_slot_publications(source_validation_id);
do $private_audits$
declare name text;
begin
 foreach name in array array['player_prop_progressive_authorizations','player_prop_progressive_reviews','player_prop_empty_slots','player_prop_slot_publications','player_prop_progressive_seasons','player_prop_progressive_activations'] loop
 execute format('alter table private.%I enable row level security',name);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',name);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_competitive_mutation()',name||'_immutable',name);
 end loop;
end; $private_audits$;
create function private.authorize_progressive_player_props(p_week_id uuid,p_release_sha text,p_approval_reference text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w private.season_weeks%rowtype;p private.player_result_policy%rowtype;a private.player_prop_progressive_authorizations%rowtype;
begin
 if p_release_sha is null or p_release_sha !~ '^[0-9a-f]{40}$' or p_approval_reference is null or char_length(btrim(p_approval_reference)) not between 8 and 500 then
 raise exception using errcode='22023',message='Verified release and explicit progressive availability approval are required.';end if;
 select * into strict w from private.season_weeks where id=p_week_id;
 perform 1 from private.seasons where id=w.season_id for update;
 perform 1 from private.season_weeks where id=w.id for update;
 select * into strict p from private.player_result_policy where singleton for share;
 select * into a from private.player_prop_progressive_authorizations where week_id=w.id;
 if found then
 if a.release_sha<>p_release_sha or a.approval_reference<>btrim(p_approval_reference) or a.source_validation_id<>p.source_validation_id then
 raise exception using errcode='22000',message='Different progressive availability approval is already recorded.';end if;
 return jsonb_build_object('weekId',w.id,'replayed',true);end if;
 if not private.week2_props_stage_current(w.id) or private.week2_props_matching_reset(w.id) is null
 or exists(select 1 from private.effective_position_receipts where week_id=w.id)
 or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null)
 or exists(select 1 from private.player_prop_controls where offers_enabled)
 or p.source_policy<>'NFLVERSE_PRIMARY' or not private.player_source_policy_validated() then
 raise exception using errcode='55000',message='The unstarted reset Week 2 and validated primary source must remain unchanged.';end if;
 insert into private.player_prop_progressive_authorizations(week_id,source_validation_id,release_sha,approval_reference)
 values(w.id,p.source_validation_id,p_release_sha,btrim(p_approval_reference));
 return jsonb_build_object('weekId',w.id,'rulesetVersion','1.5','replayed',false);
end; $$;

-- Full initial human review explicitly includes the standing empty-slot policy.
alter function api.confirm_player_prop_menu(text,jsonb) set schema private;
alter function private.confirm_player_prop_menu(text,jsonb) rename to confirm_player_prop_menu_before_progressive;
revoke all on function private.confirm_player_prop_menu_before_progressive(text,jsonb) from public,anon,authenticated,service_role;
create function api.confirm_player_prop_menu(p_league_slug text,p_choices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from private.leagues l where l.slug=lower(p_league_slug) and private.is_league_commissioner(l.id)) then
 raise exception using errcode='42501',message='Commissioner access required.';end if;
 if exists(select 1 from private.player_prop_progressive_authorizations a join private.season_weeks w on w.id=a.week_id
 join private.leagues l on l.id=w.league_id where l.slug=lower(p_league_slug)
 and w.id=(select latest.id from private.season_weeks latest join private.seasons s on s.id=latest.season_id where s.league_id=l.id order by s.created_at desc,latest.nfl_week desc limit 1)) then
 raise exception using errcode='55000',message='Explicit automatic empty-slot policy acknowledgment is required.';end if;
 return private.confirm_player_prop_menu_before_progressive(p_league_slug,p_choices);
end; $$;
create function api.confirm_progressive_player_prop_menu(p_league_slug text,p_choices jsonb,p_empty_slot_publication text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;wk uuid;
begin
 if auth.uid() is null or not exists(select 1 from private.leagues l where l.slug=lower(p_league_slug) and private.is_league_commissioner(l.id)) then
 raise exception using errcode='42501',message='Commissioner access required.';end if;
 if p_empty_slot_publication is distinct from 'AUTOMATIC_BEFORE_EVENT_CUTOFF' then
 raise exception using errcode='22023',message='Explicit automatic empty-slot policy acknowledgment is required.';end if;
 select w.id into wk from private.season_weeks w join private.seasons s on s.id=w.season_id join private.leagues l on l.id=s.league_id
 where l.slug=lower(p_league_slug) order by s.created_at desc,w.nfl_week desc limit 1;
 if not exists(select 1 from private.player_prop_progressive_authorizations where week_id=wk) then
 raise exception using errcode='55000',message='This week has no recorded progressive availability authorization.';end if;
 answer:=private.confirm_player_prop_menu_before_progressive(p_league_slug,p_choices);
 if (answer->>'weekId')::uuid is distinct from wk then raise exception using errcode='55000',message='The review scope changed; refresh this week before confirming.';end if;
 insert into private.player_prop_progressive_reviews(week_id,reviewed_by,menu_hash,menu_snapshot)
 select wk,auth.uid(),private.week2_props_menu_hash(wk),jsonb_agg(to_jsonb(m) order by m.event_id,m.team,m.slot)
 from private.week_player_menu m where week_id=wk on conflict(week_id,menu_hash) do nothing;
 return api.get_player_prop_menu(p_league_slug);
end; $$;
revoke all on function api.confirm_player_prop_menu(text,jsonb),api.confirm_progressive_player_prop_menu(text,jsonb,text) from public,anon;
grant execute on function api.confirm_player_prop_menu(text,jsonb),api.confirm_progressive_player_prop_menu(text,jsonb,text) to authenticated;

create function private.progressive_initial_menu_ready(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.player_prop_progressive_authorizations a
 join private.player_prop_progressive_reviews r on r.week_id=a.week_id
 where a.week_id=p_week_id and r.menu_hash=private.week2_props_menu_hash(p_week_id))
 and private.player_props_menu_reviewed(p_week_id)

 and not exists(select 1 from private.week_player_menu m where m.week_id=p_week_id and m.subject_id is not null
 and not exists(select 1 from private.player_menu_candidates(m.event_id,m.team,m.slot)c where c.subject_id=m.subject_id));
$$;
-- The existing tested cutover remains the only reset/binding/offer authority.
-- Only an explicitly authorized, actually reviewed 1.5 scope admits empty slots.
do $progressive_cutover$
declare d text;
begin
 d:=pg_get_functiondef('private.cutover_open_week2_props(uuid,text,text,text,text,text)'::regprocedure);
 if strpos(d,'package private.prepared_player_props_rulesets%rowtype;')=0
 or strpos(d,'if not private.player_catalog_complete(w.id) or not private.player_props_menu_reviewed(w.id)')=0 then
 raise exception 'Progressive cutover baseline changed';end if;
 d:=replace(d,'package private.prepared_player_props_rulesets%rowtype;','package record;progressive boolean;review_id uuid;');
 d:=replace(d,'perform private.require_week2_props_readiness(true);',
 'perform private.require_week2_props_readiness(true); progressive:=exists(select 1 from private.player_prop_progressive_authorizations where week_id=w.id);');
 d:=replace(d,'if not private.player_catalog_complete(w.id) or not private.player_props_menu_reviewed(w.id)',
 'if (case when progressive then not private.progressive_initial_menu_ready(w.id) else not private.player_catalog_complete(w.id) end) or not private.player_props_menu_reviewed(w.id)');
 d:=replace(d,$replace$select * into strict package from private.prepared_player_props_rulesets where mode='LIVE';$replace$,
 $replace$if progressive then select * into strict package from private.prepared_progressive_player_props_rulesets where mode='LIVE'; else select * into strict package from private.prepared_player_props_rulesets where mode='LIVE'; end if;$replace$);
 d:=replace(d,$replace$package.sha256_hash<>'7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5'$replace$,
 $replace$(not progressive and package.sha256_hash<>'7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5')$replace$);
 d:=replace(d,$replace$values(package.canonical_json->>'id','1.4',package.canonical_json->>'productBibleId','3.3','LIVE'$replace$,
 $replace$values(package.canonical_json->>'id',package.canonical_json->>'version',package.canonical_json->>'productBibleId',package.canonical_json->>'productBibleVersion','LIVE'$replace$);
 d:=replace(d,'update private.week_player_menu set frozen_at=n where week_id=w.id;',
 $new$if progressive then
 perform private.activate_progressive_player_menu(w.id);
 end if;
 update private.week_player_menu set frozen_at=n where week_id=w.id and not progressive;$new$);
 d:=replace(d,$replace$'rulesetVersion','1.4','replayed',true$replace$, $replace$'rulesetVersion',(select ruleset_version from private.season_ruleset_snapshots where id=prior.new_ruleset_snapshot_id),'replayed',true$replace$);
 d:=replace(d,$replace$'rulesetVersion','1.4','replayed',false$replace$, $replace$'rulesetVersion',package.canonical_json->>'version','replayed',false$replace$);
 execute d;
end; $progressive_cutover$;

create function private.player_catalog_pending_slots(p_week_id uuid)
returns table(event_id uuid,external_event_id text,team text,slot text)
language sql volatile security invoker set search_path='' as $$
 select empty.event_id,e.fixture_event_key,empty.team,empty.slot
 from private.player_prop_empty_slots empty join private.week_player_menu m using(event_id,team,slot)
 join private.sports_events e on e.id=empty.event_id
 join private.player_prop_progressive_authorizations a on a.week_id=empty.week_id
 join private.player_prop_progressive_activations activation on activation.week_id=a.week_id
 where empty.week_id=p_week_id and private.is_progressive_player_props_week(p_week_id)
 and m.subject_id is null and m.frozen_at is null and m.confirmed_at is not null
 and not exists(select 1 from private.player_prop_slot_publications published where published.event_id=empty.event_id and published.team=empty.team and published.slot=empty.slot)
 and e.state='SCHEDULED' and e.actual_started_at is null and e.scheduled_start_at>clock_timestamp()
 and private.event_accepts_entries(e.id)
 and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id));
$$;
-- Initial reviewed identities freeze at cutover. Later game submissions cannot
-- prematurely close never-published 1.5 slots, including other future games.
do $submission_freeze$
declare d text;old text:='where week_id=v_week.id and frozen_at is null;';
begin
 d:=pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure);
 if strpos(d,old)=0 then raise exception 'Progressive submission freeze baseline changed';end if;
 execute replace(d,old,'where week_id=v_week.id and frozen_at is null and (not private.is_progressive_player_props_week(v_week.id) or subject_id is not null);');
end; $submission_freeze$;

-- The only post-cutover null-to-player transition is backed by an immutable
-- publication in this same transaction. No existing subject can be substituted.
do $publication_guard$
declare d text;old text:=' select * into strict e from private.sports_events where id=new.event_id;';
begin
 d:=pg_get_functiondef('private.guard_player_menu()'::regprocedure);
 d:=replace(d,'begin','begin if tg_op=''DELETE'' and exists(select 1 from private.player_prop_progressive_activations where week_id=old.week_id) then raise exception using errcode=''55000'',message=''The activated progressive menu cannot lose structural slots.'';end if; if tg_op=''INSERT'' and exists(select 1 from private.player_prop_progressive_activations where week_id=new.week_id) then raise exception using errcode=''55000'',message=''The activated progressive menu cannot add structural slots.'';end if;');
 if strpos(d,old)=0 then raise exception 'Progressive menu guard baseline changed';end if;
 execute replace(d,old,$new$
 if tg_op='UPDATE' and private.is_progressive_player_props_week(old.week_id)
 and exists(select 1 from private.player_prop_progressive_activations where week_id=old.week_id)
 and old.subject_id is null and new is distinct from old then
  if new.subject_id is null or new.frozen_at is null or new.unavailable_reason is not null
  or (to_jsonb(new)-array['subject_id','frozen_at','unavailable_reason']) is distinct from (to_jsonb(old)-array['subject_id','frozen_at','unavailable_reason'])
  or not exists(select 1 from private.player_prop_slot_publications audit
    where audit.week_id=old.week_id and audit.event_id=old.event_id and audit.team=old.team and audit.slot=old.slot
    and audit.subject_id=new.subject_id and audit.publication_transaction_id=pg_current_xact_id() and audit.published_at=new.frozen_at) then
   raise exception using errcode='55000',message='An initially empty slot requires its one-time automatic publication audit.';
  end if;
  return new;
 end if;
 select * into strict e from private.sports_events where id=new.event_id;$new$);
end; $publication_guard$;
create function private.cutover_open_week2_progressive_props(
 p_week_id uuid,p_menu_hash text,p_readiness_sha text,p_release_sha text,p_idempotency_key text,p_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from private.player_prop_progressive_authorizations where week_id=p_week_id and release_sha=p_release_sha) then
 raise exception using errcode='55000',message='The exact deployed progressive release requires recorded approval.';end if;
 return private.cutover_open_week2_props(p_week_id,p_menu_hash,p_readiness_sha,p_release_sha,p_idempotency_key,p_reason);
end; $$;

create function private.publish_progressive_player_slots(p_lease_id uuid,p_proposals jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j private.player_catalog_jobs%rowtype;w private.season_weeks%rowtype;p private.player_result_policy%rowtype;
 n jsonb;c jsonb;e private.sports_events%rowtype;m private.week_player_menu%rowtype;subject uuid;
 published private.player_prop_slot_publications%rowtype;published_count integer:=0;remaining integer;replayed boolean:=true;t timestamptz;
begin
 select * into strict j from private.player_catalog_jobs where lease_id=p_lease_id and lease_until>clock_timestamp();
 select * into strict w from private.season_weeks where id=j.week_id;
 perform 1 from private.seasons where id=w.season_id for update;
 perform 1 from private.season_weeks where id=w.id for update;
 perform 1 from private.sports_events where week_id=w.id order by id for update;
 select * into strict j from private.player_catalog_jobs where week_id=w.id and lease_id=p_lease_id and lease_until>clock_timestamp() for update;
 select * into strict p from private.player_result_policy where singleton for share;
 if not private.is_progressive_player_props_week(w.id) or not private.player_prop_offers_enabled(w.id)
 or not p.metadata_enabled or p.source_policy<>'NFLVERSE_PRIMARY' or not private.player_source_policy_validated()
 or not exists(select 1 from private.player_prop_leagues scope where scope.league_id=w.league_id and scope.season_id=w.season_id and scope.catalog_enabled)
 or not exists(select 1 from private.player_prop_progressive_authorizations a join private.player_prop_progressive_activations activation using(week_id)
 where a.week_id=w.id and a.source_validation_id=p.source_validation_id) then
 raise exception using errcode='55000',message='Only the activated reviewed progressive primary scope may publish empty slots.';end if;
 if p_proposals is null or jsonb_typeof(p_proposals)<>'array' or jsonb_array_length(p_proposals)>96
 or exists(select 1 from jsonb_array_elements(p_proposals)proposal group by proposal->>'externalEventId',proposal->>'team',proposal->>'slot' having count(*)<>1) then
 raise exception using errcode='22023',message='Distinct scoped progressive slot proposals are required.';end if;
 for n in select value from jsonb_array_elements(p_proposals) order by value->>'externalEventId',value->>'team',value->>'slot' loop
  select event.* into e from private.sports_events event join private.player_prop_empty_slots empty on empty.event_id=event.id
   where event.week_id=w.id and event.fixture_event_key=n->>'externalEventId' and empty.team=n->>'team' and empty.slot=n->>'slot';
  if e.id is null then raise exception using errcode='22023',message='Only initially empty reviewed slots can receive automatic proposals.';end if;
  select * into strict m from private.week_player_menu where event_id=e.id and team=n->>'team' and slot=n->>'slot' for update;
  select * into published from private.player_prop_slot_publications where event_id=e.id and team=m.team and slot=m.slot;
  if found then
   if published.evidence_hash is distinct from n->>'nominationEvidenceHash'
   or not exists(select 1 from private.player_subjects s where s.id=published.subject_id and s.canonical_key=n->>'proposedCanonicalKey') then
    raise exception using errcode='55000',message='An automatically published player cannot be replaced.';end if;
   continue;
  end if;
  replayed:=false;
  -- Recheck each event's own deadline after all scope/event locks are held.
  if not exists(select 1 from private.player_catalog_pending_slots(w.id) pending where pending.event_id=e.id and pending.team=m.team and pending.slot=m.slot) then continue;end if;
  -- Missing or ambiguous evidence leaves an honest pending slot. A unique rank
  -- alone cannot hide the normalizer's tied-line or identity warning.
  if n->>'proposedCanonicalKey' is null or jsonb_typeof(n->'warnings') is distinct from 'array' or n->'warnings'<>'[]'::jsonb
   or jsonb_typeof(n->'candidates') is distinct from 'array' or jsonb_array_length(n->'candidates') not between 1 and 30
   or coalesce((n->>'availableQuotes')::integer,0)<1 then continue;end if;
  if n->>'nominationEvidenceHash' is null or n->>'nominationEvidenceHash' !~ '^[0-9a-f]{64}$'
   or n->>'nominationVerifiedAt' is null or (n->>'nominationVerifiedAt')::timestamptz>clock_timestamp()
   or (n->>'nominationVerifiedAt')::timestamptz<clock_timestamp()-interval '48 hours'
   or n->>'nominationExpiresAt' is null or (n->>'nominationExpiresAt')::timestamptz<=clock_timestamp()
   or (n->>'nominationExpiresAt')::timestamptz>clock_timestamp()+interval '12 hours'
   or exists(select 1 from jsonb_array_elements(n->'candidates')candidate group by candidate->>'canonicalKey' having count(*)<>1)
   or (select count(*) from jsonb_array_elements(n->'candidates')candidate where candidate->>'roleRank'='0')<>1 then
   raise exception using errcode='22023',message='Current ordered nomination evidence is required for automatic publication.';end if;
  select value into c from jsonb_array_elements(n->'candidates')candidate where candidate->>'canonicalKey'=n->>'proposedCanonicalKey' and candidate->>'roleRank'='0';
  if c is null then raise exception using errcode='22023',message='The unique highest verified candidate must match the proposed player.';end if;
  select s.id into subject from private.player_subjects s where s.canonical_key=n->>'proposedCanonicalKey'
   and ((m.slot='QB_PASS' and s.position='QB') or(m.slot='RB_RUSH' and s.position='RB') or(m.slot='RECEIVER' and s.position in('WR','TE')))
   and exists(select 1 from private.player_provider_mappings mapping where mapping.subject_id=s.id
    and mapping.provider='THE_ODDS_API' and mapping.external_event_id=e.fixture_event_key and mapping.team=m.team and mapping.result_path_verified
    and mapping.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date);
  if subject is null then raise exception using errcode='22023',message='Automatic publication requires an exact role-correct verified bookmaker identity.';end if;
  if not exists(select 1 from private.player_catalog_quote_evidence evidence join private.shared_quote_requests request on request.id=evidence.request_id
   where evidence.week_id=w.id and evidence.event_id=e.id and evidence.expires_at>clock_timestamp() and request.state='SUCCEEDED'
   and evidence.family=case m.slot when 'QB_PASS' then 'player_pass_yds' when 'RB_RUSH' then 'player_rush_yds' else 'player_reception_yds' end
   and request.fetched_at<= (n->>'nominationVerifiedAt')::timestamptz) then continue;end if;
  t:=clock_timestamp();
  insert into private.player_prop_slot_publications(week_id,event_id,team,slot,subject_id,source_validation_id,nomination,evidence_hash,published_at)
   values(w.id,e.id,m.team,m.slot,subject,p.source_validation_id,n,n->>'nominationEvidenceHash',t);
  update private.week_player_menu set subject_id=subject,frozen_at=t,unavailable_reason=null
   where event_id=e.id and team=m.team and slot=m.slot and subject_id is null and frozen_at is null;
  if not found then raise exception using errcode='55000',message='The pending slot changed before publication.';end if;
  published_count:=published_count+1;
 end loop;
 select count(*) into remaining from private.player_catalog_pending_slots(w.id);
 return jsonb_build_object('progressive',true,'publishedSlots',published_count,'remainingSlots',remaining,'replayed',replayed);
end; $$;
alter function api.record_player_catalog_nominations(uuid,jsonb) set schema private;
alter function private.record_player_catalog_nominations(uuid,jsonb) rename to record_player_catalog_nominations_before_progressive;
revoke all on function private.record_player_catalog_nominations_before_progressive(uuid,jsonb) from public,anon,authenticated,service_role;
create function api.record_player_catalog_nominations(p_lease_id uuid,p_proposals jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wk uuid;
begin
 select week_id into strict wk from private.player_catalog_jobs where lease_id=p_lease_id and lease_until>clock_timestamp();
 if private.is_progressive_player_props_week(wk) then return private.publish_progressive_player_slots(p_lease_id,p_proposals);end if;
 return private.record_player_catalog_nominations_before_progressive(p_lease_id,p_proposals);
end; $$;
revoke all on function api.record_player_catalog_nominations(uuid,jsonb) from public,anon,authenticated;
grant execute on function api.record_player_catalog_nominations(uuid,jsonb) to service_role;

-- Catalog lease and quote authorities use eligible still-empty slots in 1.5;
-- accepted bets and already-started OTHER games do not close later slots.
do $progressive_catalog_claim$
declare d text;old text;
begin
 foreach old in array array['api.enqueue_player_catalog(text)','api.claim_player_catalog_job(uuid)'] loop
 d:=pg_get_functiondef(old::regprocedure);
 if strpos(d,'private.player_catalog_complete(w.id) or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null)')=0 then
 raise exception 'Progressive catalog completion baseline changed';end if;
 d:=replace(d,'private.player_catalog_complete(w.id) or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null)',
 '(case when private.is_progressive_player_props_week(w.id) then not exists(select 1 from private.player_catalog_pending_slots(w.id)) else private.player_catalog_complete(w.id) or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null) end)');
 if old='api.claim_player_catalog_job(uuid)' then
 d:=replace(d,'where e.week_id=w.id and e.scheduled_start_at>clock_timestamp()',
 'where e.week_id=w.id and e.scheduled_start_at>clock_timestamp() and (not private.is_progressive_player_props_week(w.id) or exists(select 1 from private.player_catalog_pending_slots(w.id) pending where pending.event_id=e.id))');
 d:=replace(d,$replace$'status','CLAIMED','leaseId',lease,'weekId',w.id,$replace$,
 $replace$'status','CLAIMED','leaseId',lease,'weekId',w.id,'progressiveSlots',case when private.is_progressive_player_props_week(w.id) then (select jsonb_agg(jsonb_build_object('externalEventId',external_event_id,'team',team,'slot',slot) order by external_event_id,team,slot) from private.player_catalog_pending_slots(w.id)) else null end,$replace$);
 end if;execute d;
 end loop;
end; $progressive_catalog_claim$;
create or replace function private.player_catalog_quote_scope(p_week_id uuid) returns boolean
language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from private.player_catalog_jobs job join private.season_weeks w on w.id=job.week_id
 join private.seasons s on s.id=w.season_id join private.player_prop_leagues scope on scope.league_id=s.league_id and scope.season_id=s.id
 where job.week_id=p_week_id and job.state='PENDING' and job.lease_id is not null and job.lease_until>clock_timestamp()
 and s.mode='LIVE' and w.state in('PLANNED','OPEN','LOCKED','PROVISIONAL') and scope.catalog_enabled)
 and exists(select 1 from private.player_result_policy where metadata_enabled)
 and (case when private.is_progressive_player_props_week(p_week_id) then private.player_source_policy_validated() and exists(select 1 from private.player_catalog_pending_slots(p_week_id))
 else not exists(select 1 from private.week_player_menu where week_id=p_week_id and frozen_at is not null) end);
$$;

-- Stable original manual acknowledgment and separate publication provenance.
alter function api.get_player_prop_menu(text) set schema private;
alter function private.get_player_prop_menu(text) rename to get_player_prop_menu_before_progressive;
revoke all on function private.get_player_prop_menu_before_progressive(text) from public,anon,authenticated,service_role;
create function api.get_player_prop_menu(p_league_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb;wk uuid;slots jsonb;
begin
 answer:=private.get_player_prop_menu_before_progressive(p_league_slug);wk:=(answer->>'weekId')::uuid;
 select coalesce(jsonb_agg(original.slot||jsonb_build_object(
 'publicationMode',case when audit.subject_id is not null then 'AUTOMATIC' when original.slot->>'subjectId' is not null and (original.slot->>'confirmed')::boolean then 'COMMISSIONER' else null end,
 'publishedAt',case when audit.subject_id is not null then to_jsonb(audit.published_at) when original.slot->>'subjectId' is not null then to_jsonb(menu.frozen_at) else 'null'::jsonb end,
 'lateFillEligible',exists(select 1 from private.player_catalog_pending_slots(wk) pending where pending.event_id=menu.event_id and pending.team=menu.team and pending.slot=menu.slot)) order by ord),'[]') into slots
 from jsonb_array_elements(answer->'slots') with ordinality original(slot,ord)
 join private.week_player_menu menu on menu.week_id=wk and menu.event_id=(original.slot->>'eventId')::uuid and menu.team=original.slot->>'team' and menu.slot=original.slot->>'slot'
 left join private.player_prop_slot_publications audit on audit.event_id=menu.event_id and audit.team=menu.team and audit.slot=menu.slot;
 return answer||jsonb_build_object('frozen',((answer->>'frozen')::boolean or exists(select 1 from private.player_prop_progressive_activations where week_id=wk)),'progressiveActivated',exists(select 1 from private.player_prop_progressive_activations where week_id=wk),'progressiveAvailability',exists(select 1 from private.player_prop_progressive_authorizations where week_id=wk),'canOpen',case when exists(select 1 from private.player_prop_progressive_authorizations where week_id=wk) then coalesce((answer->>'canOpen')::boolean,false) and private.progressive_initial_menu_ready(wk) else coalesce((answer->>'canOpen')::boolean,false) end,'slots',slots);
end; $$;
revoke all on function api.get_player_prop_menu(text) from public,anon;
grant execute on function api.get_player_prop_menu(text) to authenticated;

revoke all on function private.progressive_player_props_ruleset_package(text),private.is_progressive_player_props_week(uuid),
 private.authorize_progressive_player_props(uuid,text,text),private.progressive_initial_menu_ready(uuid),
 private.cutover_open_week2_progressive_props(uuid,text,text,text,text,text),private.player_catalog_pending_slots(uuid),
 private.publish_progressive_player_slots(uuid,jsonb) from public,anon,authenticated,service_role;

-- Progressive discovery only revisits still-empty, explicitly authorized slots.
-- Retained source timestamps and twelve-hour positive observations are immutable
-- inputs to retry eligibility, never renewed by rereading the shared cache.
create function private.player_catalog_discovery_retry_at(p_event_id uuid,p_fetched_at timestamptz) returns timestamptz
language sql volatile strict security invoker set search_path='' as $$
 select case when private.event_entry_closes_at(p_event_id)>clock_timestamp()+interval '24 hours'
  then least(p_fetched_at+interval '6 hours',greatest(private.event_entry_closes_at(p_event_id)-interval '24 hours',p_fetched_at+interval '3 hours'))
  else p_fetched_at+interval '3 hours' end;
$$;
create function private.player_catalog_discovery_families(p_week_id uuid)
returns table(event_id uuid,external_event_id text,family text)
language sql volatile security invoker set search_path='' as $$
 select distinct pending.event_id,pending.external_event_id,
  case pending.slot when 'QB_PASS' then 'player_pass_yds' when 'RB_RUSH' then 'player_rush_yds' when 'RECEIVER' then 'player_reception_yds' end
 from private.player_catalog_pending_slots(p_week_id) pending
 where private.is_progressive_player_props_week(p_week_id)
 union all
 select e.id,e.fixture_event_key,wanted.family from private.sports_events e
 cross join unnest(array['player_pass_yds','player_rush_yds','player_reception_yds'])wanted(family)
 where not private.is_progressive_player_props_week(p_week_id) and e.week_id=p_week_id and e.scheduled_start_at>clock_timestamp()
 and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id));
$$;
create function private.player_catalog_discovery_evidence_current(p_week_id uuid,p_event_id uuid,p_family text) returns boolean
language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from private.player_catalog_quote_evidence evidence
 join private.shared_quote_requests request on request.id=evidence.request_id
 where evidence.week_id=p_week_id and evidence.event_id=p_event_id and evidence.family=p_family
 and evidence.expires_at>clock_timestamp()
 and (not private.is_progressive_player_props_week(p_week_id)
  or (request.state='SUCCEEDED' and request.fetched_at<=clock_timestamp()
   and private.player_catalog_discovery_retry_at(p_event_id,request.fetched_at)>clock_timestamp())));
$$;
create function private.progressive_player_catalog_next_attempt(p_week_id uuid) returns timestamptz
language sql volatile security invoker set search_path='' as $$
 select min(case when evidence.request_id is null or request.state<>'SUCCEEDED' or request.fetched_at is null or request.fetched_at>clock_timestamp()
  then clock_timestamp()
  else greatest(clock_timestamp(),least(evidence.expires_at,private.player_catalog_discovery_retry_at(wanted.event_id,request.fetched_at))) end)
 from private.player_catalog_discovery_families(p_week_id) wanted
 left join private.player_catalog_quote_evidence evidence on evidence.week_id=p_week_id and evidence.event_id=wanted.event_id and evidence.family=wanted.family
 left join private.shared_quote_requests request on request.id=evidence.request_id
 where private.is_progressive_player_props_week(p_week_id);
$$;
revoke all on function private.player_catalog_discovery_retry_at(uuid,timestamptz),private.player_catalog_discovery_families(uuid),
 private.player_catalog_discovery_evidence_current(uuid,uuid,text),private.progressive_player_catalog_next_attempt(uuid)
 from public,anon,authenticated,service_role;

create or replace function api.get_player_catalog_quotes(p_week_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare imports jsonb;pending boolean;
begin
 if not private.player_catalog_quote_scope(p_week_id) then return jsonb_build_object('imports','[]'::jsonb,'pending',true);end if;
 -- A shared success retains the source's original fetched time, including an
 -- empty market response. The progressive retry test below can shorten only
 -- reuse of pending families; it never rewrites source age or quote freshness.
 insert into private.player_catalog_quote_evidence(week_id,event_id,family,request_id,expires_at)
 select p_week_id,e.id,c.family,r.id,r.fetched_at+interval '12 hours'
 from private.player_catalog_discovery_families(p_week_id) wanted
 join private.sports_events e on e.id=wanted.event_id and e.week_id=p_week_id
 join private.shared_quote_coverage c on c.external_event_id=wanted.external_event_id and c.family=wanted.family
 join private.shared_quote_requests r on r.id=c.latest_successful_request_id
 where r.kind='PROPS' and r.state='SUCCEEDED' and r.fetched_at<=clock_timestamp() and r.fetched_at>clock_timestamp()-interval '12 hours'
 and r.payload#>>'{events,0,externalEventId}'=e.fixture_event_key and r.payload#>>'{events,0,awayTeam}'=e.away_team
 and r.payload#>>'{events,0,homeTeam}'=e.home_team and (r.payload#>>'{events,0,scheduledStartAt}')::timestamptz=e.scheduled_start_at
 on conflict(week_id,event_id,family) do update set request_id=excluded.request_id,discovered_at=clock_timestamp(),expires_at=excluded.expires_at
 where private.player_catalog_quote_evidence.request_id<>excluded.request_id;
 select coalesce(jsonb_agg(jsonb_build_object('source','THE_ODDS_API','fetchedAt',r.payload->>'fetchedAt','events',jsonb_build_array(
  jsonb_set(jsonb_set(r.payload#>'{events,0}','{requestedFamilies}',to_jsonb(selected.families)),'{markets}',
   coalesce((select jsonb_agg(m) from jsonb_array_elements(r.payload#>'{events,0,markets}') m
    where (case m->>'statistic' when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end)=any(selected.families)),'[]'::jsonb))
  )) order by r.fetched_at,r.id),'[]'::jsonb) into imports
 from(select evidence.request_id,array_agg(evidence.family order by evidence.family) families
  from private.player_catalog_discovery_families(p_week_id) wanted
  join private.player_catalog_quote_evidence evidence on evidence.week_id=p_week_id and evidence.event_id=wanted.event_id and evidence.family=wanted.family
  where private.player_catalog_discovery_evidence_current(p_week_id,wanted.event_id,wanted.family)
  group by evidence.request_id) selected join private.shared_quote_requests r on r.id=selected.request_id;
 select exists(select 1 from private.player_catalog_discovery_families(p_week_id) wanted
  where not private.player_catalog_discovery_evidence_current(p_week_id,wanted.event_id,wanted.family)) into pending;
 return jsonb_build_object('imports',imports,'pending',pending);
end; $$;

create or replace function api.claim_player_catalog_quote(p_week_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.player_catalog_jobs%rowtype;ev private.sports_events%rowtype;r private.shared_quote_requests%rowtype;
 missing text[];delay integer;t timestamptz;progressive boolean;
begin
 perform 1 from private.odds_refresh_policy for update;
 if not private.player_catalog_quote_scope(p_week_id) then return jsonb_build_object('status','DISABLED');end if;
 select * into strict job from private.player_catalog_jobs where week_id=p_week_id for update;
 t:=clock_timestamp();
 if not private.player_catalog_quote_scope(p_week_id) then return jsonb_build_object('status','DISABLED');end if;
 if not exists(select 1 from private.odds_refresh_policy where enabled and provider_entitlement_credits>=20000) then return jsonb_build_object('status','DISABLED');end if;
 progressive:=private.is_progressive_player_props_week(p_week_id);
 perform api.get_player_catalog_quotes(p_week_id);
 select e.* into ev from private.sports_events e where e.week_id=p_week_id
 and exists(select 1 from private.player_catalog_discovery_families(p_week_id) wanted where wanted.event_id=e.id
  and not private.player_catalog_discovery_evidence_current(p_week_id,e.id,wanted.family))
 order by (select max(evidence.discovered_at) from private.player_catalog_quote_evidence evidence where evidence.week_id=p_week_id and evidence.event_id=e.id) nulls first,
 e.scheduled_start_at,e.id limit 1;
 if ev.id is null then return jsonb_build_object('status','CACHED');end if;
 if (select count(*) from private.player_catalog_quote_attempts where job_lease_id=job.lease_id)>=16 then return jsonb_build_object('status','LIMIT');end if;
 select array_agg(wanted.family order by wanted.family) into missing from private.player_catalog_discovery_families(p_week_id) wanted
 where wanted.event_id=ev.id and not private.player_catalog_discovery_evidence_current(p_week_id,ev.id,wanted.family);
 if missing is null then return jsonb_build_object('status','CACHED');end if;
 select req.* into r from private.shared_quote_coverage c join private.shared_quote_requests req on req.id=c.request_id
 where c.external_event_id=ev.fixture_event_key and c.family=any(missing) and req.kind='PROPS'
  and ((req.state='RUNNING' and req.expires_at>t) or (req.state='PLANNED' and req.created_at>t-interval '90 seconds'))
  -- A progressive lease can share an in-flight request, but cannot expand a
  -- newly paid planned request beyond the families that still need a player.
  and (not progressive or req.state='RUNNING' or req.families<@missing)
 order by req.created_at,req.id limit 1;
 if r.state='RUNNING' then return jsonb_build_object('status','WAIT','retryAfterMs',0);end if;
 select greatest(0,ceil(extract(epoch from next_request_at-t)*1000))::integer into delay from private.odds_refresh_policy;
 if delay>0 then return jsonb_build_object('status','WAIT','retryAfterMs',least(delay,3000));end if;
 if progressive and (not private.event_accepts_entries(ev.id)
  or not exists(select 1 from private.player_catalog_discovery_families(p_week_id) wanted where wanted.event_id=ev.id and wanted.family=any(missing)))
 then return jsonb_build_object('status','CACHED');end if;
 if r.id is null then
  insert into private.shared_quote_requests(kind,event_ids,families) values('PROPS',array[ev.fixture_event_key],missing) returning * into r;
  insert into private.shared_quote_coverage(external_event_id,family,request_id) select ev.fixture_event_key,family,r.id from unnest(missing) family
   on conflict(external_event_id,family) do update set request_id=excluded.request_id;
 end if;
 perform private.reserve_selective_quote_credits(cardinality(r.families),true);
 update private.shared_quote_requests set state='RUNNING',attempted_at=clock_timestamp(),expires_at=clock_timestamp()+interval '25 seconds',reserved_cost=cardinality(r.families) where id=r.id;
 insert into private.player_catalog_quote_attempts(job_lease_id,week_id,request_id) values(job.lease_id,p_week_id,r.id);
 return jsonb_build_object('status','CLAIMED','requestId',r.id,'externalEventId',ev.fixture_event_key,'families',r.families);
end; $$;
-- CREATE OR REPLACE preserves the existing service-only API grants.

-- Progressively empty families sleep until their truthful source-age retry;
-- failed/no-progress attempts retain the existing retry/backoff authority.
alter function api.complete_player_catalog_job(uuid,text,integer,text) set schema private;
alter function private.complete_player_catalog_job(uuid,text,integer,text) rename to complete_player_catalog_job_before_progressive;
revoke all on function private.complete_player_catalog_job_before_progressive(uuid,text,integer,text) from public,anon,authenticated,service_role;
create function api.complete_player_catalog_job(p_lease_id uuid,p_status text,p_missing_sources integer default 0,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare wk uuid;remaining integer;retry timestamptz;progressive boolean;
begin
 if p_lease_id is null or p_status not in('READY','PENDING','UNAVAILABLE') or p_status is null or p_missing_sources is null or p_missing_sources<0 or p_missing_sources>100 or char_length(p_error)>100 then raise exception using errcode='22023',message='Invalid catalog completion.';end if;
 select week_id into wk from private.player_catalog_jobs where lease_id=p_lease_id and lease_until>clock_timestamp();
 if not found then raise exception using errcode='55000',message='Catalog lease expired.';end if;
 progressive:=private.is_progressive_player_props_week(wk);
 if progressive then
 select count(*) into remaining from private.player_catalog_pending_slots(wk);
 if p_status='READY' and remaining>0 then p_status:='PENDING';p_missing_sources:=remaining;end if;
 end if;
 perform private.complete_player_catalog_job_before_progressive(p_lease_id,p_status,p_missing_sources,p_error);
 if progressive and p_status='PENDING' and (p_error is null or p_error='CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED') then
 retry:=private.progressive_player_catalog_next_attempt(wk);
 if remaining=0 then update private.player_catalog_jobs set state='READY',completed_at=clock_timestamp() where week_id=wk;
 elsif retry>clock_timestamp() then update private.player_catalog_jobs set next_attempt_at=greatest(next_attempt_at,retry) where week_id=wk;end if;
 end if;
end; $$;
revoke all on function api.complete_player_catalog_job(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function api.complete_player_catalog_job(uuid,text,integer,text) to service_role;

-- Standing authority applies only to the pilot season's future unopened weeks.
-- Actual initial menu review and opening remain commissioner actions each week.
create function private.ensure_progressive_week_authorized(p_week_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare w private.season_weeks%rowtype;standing private.player_prop_progressive_seasons%rowtype;
begin
 select * into strict w from private.season_weeks where id=p_week_id;
 select * into standing from private.player_prop_progressive_seasons where season_id=w.season_id and league_id=w.league_id;
 if not found or exists(select 1 from private.player_prop_progressive_authorizations where week_id=w.id) then return;end if;
 if w.state<>'PLANNED' or exists(select 1 from private.effective_position_receipts where week_id=w.id)
 or exists(select 1 from private.sports_events where week_id=w.id and (actual_started_at is not null or scheduled_start_at<=clock_timestamp())) then
 raise exception using errcode='55000',message='Standing progressive authority applies only to unopened future weeks.';end if;
 insert into private.player_prop_progressive_authorizations(week_id,source_validation_id,release_sha,approval_reference)
 values(w.id,standing.source_validation_id,standing.release_sha,standing.approval_reference);
end; $$;
create function private.activate_progressive_player_menu(p_week_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare w private.season_weeks%rowtype;review private.player_prop_progressive_reviews%rowtype;a private.player_prop_progressive_authorizations%rowtype;t timestamptz:=clock_timestamp();
begin
 if exists(select 1 from private.player_prop_progressive_activations where week_id=p_week_id) then return;end if;
 select * into strict w from private.season_weeks where id=p_week_id for update;
 select * into strict a from private.player_prop_progressive_authorizations where week_id=w.id;
 if not private.is_progressive_player_props_week(w.id) or not private.progressive_initial_menu_ready(w.id) then
 raise exception using errcode='55000',message='The exact progressive initial menu must be reviewed before opening.';end if;
 select * into strict review from private.player_prop_progressive_reviews where week_id=w.id and menu_hash=private.week2_props_menu_hash(w.id);
 insert into private.player_prop_progressive_activations(week_id,review_id,ruleset_snapshot_id,activated_at)
 values(w.id,review.id,w.ruleset_snapshot_id,t);
 insert into private.player_prop_empty_slots(week_id,event_id,team,slot,review_id,initial_menu)
 select w.id,m.event_id,m.team,m.slot,review.id,to_jsonb(m) from private.week_player_menu m where m.week_id=w.id and m.subject_id is null;
 update private.week_player_menu set frozen_at=t where week_id=w.id and subject_id is not null and frozen_at is null;
 if exists(select 1 from private.week2_props_cutovers where week_id=w.id) then
 insert into private.player_prop_progressive_seasons(season_id,league_id,initial_week_id,source_validation_id,release_sha,approval_reference)
 values(w.season_id,w.league_id,w.id,a.source_validation_id,a.release_sha,a.approval_reference) on conflict(season_id) do nothing;
 end if;
 insert into private.player_catalog_jobs(week_id) values(w.id) on conflict(week_id) do update set state='PENDING',completed_at=null;
end; $$;
do $future_progressive_authority$
declare d text;old text;
begin
 d:=pg_get_functiondef('private.prepare_player_menu(uuid)'::regprocedure);
 old:=' select * into strict w from private.season_weeks where id=p_week_id for update;';
 if strpos(d,old)=0 then raise exception 'Progressive preparation baseline changed';end if;
 execute replace(d,old,old||' perform private.ensure_progressive_week_authorized(p_week_id);');
 d:=pg_get_functiondef('private.pin_week_rules()'::regprocedure);
 old:=$old$select '1.4','3.3',p.canonical_json,p.sha256_hash into
      v_catalog.ruleset_version,v_catalog.product_bible_version,v_catalog.canonical_json,v_catalog.sha256_hash
      from private.prepared_player_props_rulesets p where p.mode=v_season.mode;$old$;
 if strpos(d,old)=0 then raise exception 'Progressive season catalog baseline changed';end if;
 d:=replace(d,old,$new$if exists(select 1 from private.player_prop_progressive_seasons where season_id=v_season.id and league_id=v_season.league_id) then
    select '1.5','3.4',p.canonical_json,p.sha256_hash into
      v_catalog.ruleset_version,v_catalog.product_bible_version,v_catalog.canonical_json,v_catalog.sha256_hash
      from private.prepared_progressive_player_props_rulesets p where p.mode=v_season.mode;
    else
    select '1.4','3.3',p.canonical_json,p.sha256_hash into
      v_catalog.ruleset_version,v_catalog.product_bible_version,v_catalog.canonical_json,v_catalog.sha256_hash
      from private.prepared_player_props_rulesets p where p.mode=v_season.mode;
    end if;$new$);
 old:='if not ((v_previous.ruleset_version';
 if strpos(d,old)=0 then raise exception 'Progressive prospective rules gate baseline changed';end if;
 d:=replace(d,old,$new$if not ((v_previous.ruleset_version in('1.0','1.1','1.2','1.3','1.4') and v_catalog.ruleset_version='1.5'
 and v_catalog.canonical_json=private.progressive_player_props_ruleset_package(v_season.mode)
 and v_catalog.sha256_hash=(select sha256_hash from private.prepared_progressive_player_props_rulesets where mode=v_season.mode)
 and exists(select 1 from private.player_prop_progressive_seasons where season_id=v_season.id and league_id=v_season.league_id))
 or (v_previous.ruleset_version$new$);execute d;
 d:=pg_get_functiondef('api.open_reviewed_player_prop_week(text,text)'::regprocedure);
 old:=$old$ if w.state<>'PLANNED' or not private.player_props_menu_reviewed(w.id) then$old$;
 if strpos(d,old)=0 then raise exception 'Progressive future opening baseline changed';end if;
 d:=replace(d,old,$new$ if exists(select 1 from private.player_prop_progressive_authorizations where week_id=w.id) and not private.progressive_initial_menu_ready(w.id) then
 raise exception using errcode='55000',message='Review available players and the automatic empty-slot policy before opening.';end if;
 if w.state<>'PLANNED' or not private.player_props_menu_reviewed(w.id) then$new$);
 old:=$old$ j:=jsonb_build_object('weekId',w.id,'state','OPEN','rulesetVersion','1.4','replayed',false);$old$;
 if strpos(d,old)=0 then raise exception 'Progressive opened response baseline changed';end if;
 d:=replace(d,old,$new$ if private.is_progressive_player_props_week(w.id) then perform private.activate_progressive_player_menu(w.id);end if;
 j:=jsonb_build_object('weekId',w.id,'state','OPEN','rulesetVersion',(select r.ruleset_version from private.season_weeks current_week join private.season_ruleset_snapshots r on r.id=current_week.ruleset_snapshot_id where current_week.id=w.id),'replayed',false);$new$);execute d;
end; $future_progressive_authority$;
revoke all on function private.ensure_progressive_week_authorized(uuid),private.activate_progressive_player_menu(uuid) from public,anon,authenticated,service_role;

-- Initial progressive review offers only the unique verified highest-line
-- nominee. Legacy 1.4 manual candidate choices retain their original contract.
alter function private.player_menu_candidates(uuid,text,text) rename to player_menu_candidates_before_progressive;
create function private.player_menu_candidates(p_event_id uuid,p_team text,p_slot text)
returns table(subject_id uuid,subject_label text,"position" text,role_rank integer,role_evidence text)
language sql stable security invoker set search_path='' as $$
 select c.* from private.player_menu_candidates_before_progressive(p_event_id,p_team,p_slot)c
 where not exists(select 1 from private.sports_events e join private.player_prop_progressive_authorizations a on a.week_id=e.week_id where e.id=p_event_id)
 or exists(select 1 from private.sports_events e join private.player_catalog_nomination_heads h on h.week_id=e.week_id
 join private.player_catalog_nomination_generations g on g.id=h.generation_id
 cross join lateral jsonb_array_elements(g.nominations)n join private.player_subjects s on s.canonical_key=n->>'proposedCanonicalKey'
 where e.id=p_event_id and n->>'externalEventId'=e.fixture_event_key and n->>'team'=p_team and n->>'slot'=p_slot and s.id=c.subject_id
 and n->'warnings'='[]'::jsonb and c.role_rank=0
 and (select count(*) from jsonb_array_elements(n->'candidates')candidate where candidate->>'roleRank'='0')=1);
$$;
revoke all on function private.player_menu_candidates_before_progressive(uuid,text,text),private.player_menu_candidates(uuid,text,text) from public,anon,authenticated,service_role;
