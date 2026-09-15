-- Operator-only recovery for a verified all-empty primary catalog generation.
-- Preserve its immutable evidence. Do not fabricate a newer source revision,
-- weaken monotonic nomination ordering, reset cards, or activate any offers.
create table private.player_catalog_empty_head_repairs (
 id uuid primary key default gen_random_uuid(),
 week_id uuid not null unique references private.week2_props_stages(week_id),
 prior_generation_id uuid not null unique references private.player_catalog_nomination_generations(id),
 prior_content_hash text not null check(prior_content_hash ~ '^[0-9a-f]{64}$'),
 source_validation_id uuid not null references private.player_source_validations(id),
 fixed_release_sha text not null check(fixed_release_sha ~ '^[0-9a-f]{40}$'),
 operation_id text not null unique check(char_length(operation_id) between 8 and 120),
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 reason text not null check(char_length(btrim(reason)) between 8 and 500),
 executed_by text not null default session_user,
 repair_transaction_id xid8 not null default pg_current_xact_id(),
 created_at timestamptz not null default clock_timestamp()
);
create index player_catalog_empty_repair_validation_idx on private.player_catalog_empty_head_repairs(source_validation_id);
alter table private.player_catalog_empty_head_repairs enable row level security;
revoke all on private.player_catalog_empty_head_repairs from public,anon,authenticated,service_role;
create trigger player_catalog_empty_head_repairs_append_only before update or delete on private.player_catalog_empty_head_repairs
 for each row execute function private.reject_competitive_mutation();

create function private.invalidate_empty_nflverse_nomination_head(
 p_week_id uuid,p_expected_generation_id uuid,p_expected_content_hash text,
 p_fixed_release_sha text,p_operation_id text,p_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w private.season_weeks%rowtype;j private.player_catalog_jobs%rowtype;
 p private.player_result_policy%rowtype;g private.player_catalog_nomination_generations%rowtype;
 previous private.player_catalog_empty_head_repairs%rowtype;
 request_hash text;repair_id uuid;expected integer;pass integer;
begin
 if p_week_id is null or p_expected_generation_id is null
 or p_expected_content_hash is null or p_expected_content_hash !~ '^[0-9a-f]{64}$'
 or p_fixed_release_sha is null or p_fixed_release_sha !~ '^[0-9a-f]{40}$'
 or p_operation_id is null or char_length(p_operation_id) not between 8 and 120
 or p_reason is null or char_length(btrim(p_reason)) not between 8 and 500 then
  raise exception using errcode='22023',message='Exact empty-generation evidence, fixed release, operation and reason are required.';
 end if;
 request_hash:=encode(extensions.digest(jsonb_build_object('weekId',p_week_id,
  'generationId',p_expected_generation_id,'contentHash',p_expected_content_hash,
  'fixedReleaseSha',p_fixed_release_sha,'operationId',p_operation_id,'reason',p_reason)::text,'sha256'),'hex');
 -- An exact lost-response replay remains read-only even after workers resume.
 -- Repeat after scope locking so concurrent operators cannot invalidate twice.
 for pass in 1..2 loop
  select * into previous from private.player_catalog_empty_head_repairs
   where operation_id=p_operation_id or week_id=p_week_id order by created_at limit 1;
  if found then
   if previous.request_hash<>request_hash then
    raise exception using errcode='22000',message='A different empty-generation repair is already recorded.';
   end if;
   return jsonb_build_object('status','INVALIDATED','repairId',previous.id,
    'priorGenerationId',previous.prior_generation_id,'replayed',true);
  end if;
  if pass=1 then
   select * into strict w from private.season_weeks where id=p_week_id;
   perform 1 from private.seasons where id=w.season_id for update;
   select * into strict w from private.season_weeks where id=p_week_id for update;
  end if;
 end loop;
 perform 1 from private.sports_events where week_id=w.id order by id for update;
 perform 1 from private.weekly_cards where week_id=w.id order by id for update;
 select * into strict j from private.player_catalog_jobs where week_id=w.id for update;
 select * into strict p from private.player_result_policy where singleton for share;
 perform 1 from private.player_prop_controls where singleton for share;
 perform 1 from private.player_prop_leagues where league_id=w.league_id for share;
 if p.source_policy<>'NFLVERSE_PRIMARY' or p.selection_policy<>'FEATURED_HIGHEST_STANDARD_LINES'
 or not private.player_source_policy_validated() or p.metadata_enabled or p.processing_enabled
 or exists(select 1 from private.player_prop_controls where offers_enabled)
 or not exists(select 1 from private.player_prop_leagues where league_id=w.league_id
  and season_id=w.season_id and catalog_enabled and not enabled and not rules_enabled and catalog_hold_from_week is null) then
  raise exception using errcode='55000',message='Validated primary preparation must be quiescent with all offers and processing disabled.';
 end if;
 if not private.week2_props_stage_current(w.id)
 or private.week2_props_matching_reset(w.id) is null
 or exists(select 1 from private.effective_position_receipts where week_id=w.id)
 or exists(select 1 from private.week_player_menu where week_id=w.id and
  (subject_id is not null or confirmed_at is not null or confirmed_by is not null or frozen_at is not null)) then
  raise exception using errcode='55000',message='Only the current unstarted, reset, unselected and unreviewed Week 2 preparation can be repaired.';
 end if;
 if j.state<>'PENDING' or j.lease_until>clock_timestamp() then
  raise exception using errcode='55000',message='A pending catalog with no active worker lease is required.';
 end if;
 perform 1 from private.player_catalog_nomination_heads where week_id=w.id for update;
 select generation.* into g from private.player_catalog_nomination_heads head
  join private.player_catalog_nomination_generations generation on generation.id=head.generation_id
  where head.week_id=w.id;
 if g.id is null or g.id<>p_expected_generation_id or g.week_id<>w.id
 or g.content_hash<>p_expected_content_hash or g.source_validation_id<>p.source_validation_id then
  raise exception using errcode='55000',message='The expected current primary nomination generation and hash must match exactly.';
 end if;
 select 6*count(*) into expected from private.sports_events event where event.week_id=w.id
  and exists(select 1 from private.slate_items item where item.event_id=event.id and private.is_effective_slate_item(item.id));
 if expected not between 6 and 96 or jsonb_array_length(g.nominations)<>expected
 or exists(select 1 from jsonb_array_elements(g.nominations) n
  where jsonb_typeof(n->'candidates') is distinct from 'array' or n->'candidates'<>'[]'::jsonb
   or n->>'proposedCanonicalKey' is not null)
 or (select encode(extensions.digest(jsonb_agg(n order by n->>'externalEventId',n->>'team',n->>'slot')::text,'sha256'),'hex')
  from jsonb_array_elements(g.nominations)n)<>g.content_hash then
  raise exception using errcode='55000',message='Only a complete, verified all-empty nomination generation can be invalidated.';
 end if;
 insert into private.player_catalog_empty_head_repairs(week_id,prior_generation_id,prior_content_hash,
  source_validation_id,fixed_release_sha,operation_id,request_hash,reason)
 values(w.id,g.id,g.content_hash,g.source_validation_id,p_fixed_release_sha,p_operation_id,request_hash,p_reason)
 returning id into repair_id;
 delete from private.player_catalog_nomination_heads where week_id=w.id and generation_id=g.id;
 return jsonb_build_object('status','INVALIDATED','repairId',repair_id,'priorGenerationId',g.id,'replayed',false);
end; $$;
revoke all on function private.invalidate_empty_nflverse_nomination_head(uuid,uuid,text,text,text,text)
 from public,anon,authenticated,service_role;
