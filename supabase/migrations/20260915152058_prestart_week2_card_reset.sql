-- One approved pre-kickoff Week 2 reset. Original competitive facts remain
-- append-only; a new card generation supersedes their active participation.
-- This migration prepares authority only. It does not reset any hosted card.
alter table private.weekly_cards add column card_generation integer not null default 0
  check (card_generation between 0 and 1);
alter table private.position_receipts add column card_generation integer not null default 0
  check (card_generation between 0 and 1);
alter table private.weekly_score_versions add column card_generation integer not null default 0
  check (card_generation between 0 and 1);
alter table private.live_card_quote_reviews add column card_generation integer not null default 0
  check (card_generation between 0 and 1),
  add column ruleset_snapshot_id uuid references private.season_ruleset_snapshots(id);
alter table private.card_submission_intents add column card_generation integer not null default 0
  check (card_generation between 0 and 1);

create table private.card_reset_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references private.leagues(id),
  season_id uuid not null references private.seasons(id),
  week_id uuid not null references private.season_weeks(id),
  card_id uuid not null unique references private.weekly_cards(id),
  previous_generation integer not null check (previous_generation = 0),
  new_generation integer not null check (new_generation = 1),
  receipt_ids uuid[] not null check (cardinality(receipt_ids) between 1 and 20),
  receipt_fingerprint text not null check (receipt_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 120),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  release_sha text not null check (release_sha ~ '^[0-9a-f]{40}$'),
  approval_reference text not null check (char_length(btrim(approval_reference)) between 3 and 500),
  reason text not null check (char_length(btrim(reason)) between 8 and 500),
  reset_transaction_id xid8 not null default pg_current_xact_id(),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.card_reset_events enable row level security;
revoke all on private.card_reset_events from public, anon, authenticated;
create trigger card_reset_events_append_only before update or delete on private.card_reset_events
  for each row execute function private.reject_competitive_mutation();
create index card_reset_events_week_idx on private.card_reset_events(week_id);
create index card_reset_events_season_idx on private.card_reset_events(season_id);
create index card_reset_events_league_idx on private.card_reset_events(league_id);

-- Retain the original base rows for audit, foreign keys and receipt hashing.
-- Every competitive reader uses these narrowly granted invoker views.
create view private.effective_position_receipts with (security_invoker = true) as
  select r.* from private.position_receipts r join private.weekly_cards c on c.id=r.card_id
  where r.card_generation=c.card_generation;
create view private.effective_weekly_score_versions with (security_invoker = true) as
  select r.* from private.weekly_score_versions r join private.weekly_cards c on c.id=r.card_id
  where r.card_generation=c.card_generation;
revoke all on private.effective_position_receipts,private.effective_weekly_score_versions from public,anon,authenticated;

drop index private.position_receipts_main_selection_key;
drop index private.position_receipts_player_selection_key;
create unique index position_receipts_main_selection_key on private.position_receipts(card_id,card_generation,event_id,market_type) where subject_id is null;
create unique index position_receipts_player_selection_key on private.position_receipts(card_id,card_generation,event_id,subject_id,statistic,period) where subject_id is not null;

create function private.pin_current_card_generation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare generation integer; rules uuid;
begin
  select c.card_generation,w.ruleset_snapshot_id into strict generation,rules
  from private.weekly_cards c join private.season_weeks w on w.id=c.week_id where c.id=new.card_id;
  new.card_generation:=generation;
  if tg_table_name='live_card_quote_reviews' then new.ruleset_snapshot_id:=rules; end if;
  return new;
end; $$;
revoke all on function private.pin_current_card_generation() from public,anon,authenticated;
create trigger pin_receipt_card_generation before insert on private.position_receipts
  for each row execute function private.pin_current_card_generation();
create trigger pin_score_card_generation before insert on private.weekly_score_versions
  for each row execute function private.pin_current_card_generation();
create trigger pin_review_card_generation before insert on private.live_card_quote_reviews
  for each row execute function private.pin_current_card_generation();

create function private.guard_card_generation_reset() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.card_generation is distinct from old.card_generation and not exists(
    select 1 from private.card_reset_events r where r.card_id=old.id
    and r.league_id=old.league_id and r.season_id=old.season_id and r.week_id=old.week_id
    and r.previous_generation=old.card_generation and r.new_generation=new.card_generation
    and r.reset_transaction_id=pg_current_xact_id()
    and new.granted_credits=old.granted_credits and new.granted_at=old.granted_at
    and new.week_id=old.week_id and new.entry_id=old.entry_id and new.owner_user_id=old.owner_user_id
    and new.season_id=old.season_id and new.league_id=old.league_id
  ) then raise exception using errcode='55000',message='CARD_RESET_AUTHORITY_REQUIRED'; end if;
  return new;
end; $$;
revoke all on function private.guard_card_generation_reset() from public,anon,authenticated;
create trigger guard_card_generation_reset before update on private.weekly_cards
  for each row execute function private.guard_card_generation_reset();

create function private.card_receipt_fingerprint(p_card_id uuid,p_generation integer) returns text
language sql stable security invoker set search_path='' as $$
  select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(r)-'card_generation' order by r.id),'[]'::jsonb)::text,'sha256'),'hex')
  from private.position_receipts r where r.card_id=p_card_id and r.card_generation=p_generation;
$$;
revoke all on function private.card_receipt_fingerprint(uuid,integer) from public,anon,authenticated;

create function private.reset_prestart_week2_card(
  p_league_id uuid,p_season_id uuid,p_week_id uuid,p_card_id uuid,
  p_expected_receipt_ids uuid[],p_expected_receipt_hash text,p_idempotency_key text,
  p_release_sha text,p_approval_reference text,p_reason text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s private.seasons%rowtype; w private.season_weeks%rowtype; c private.weekly_cards%rowtype;
  existing private.card_reset_events%rowtype; operation private.card_reset_events%rowtype;
  ids uuid[]; expected uuid[]; fingerprint text; request_digest text; now_at timestamptz;
begin
  if p_league_id is null or p_season_id is null or p_week_id is null or p_card_id is null
    or p_expected_receipt_ids is null or cardinality(p_expected_receipt_ids) not between 1 and 20
    or p_expected_receipt_hash is null or p_expected_receipt_hash!~'^[0-9a-f]{64}$'
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 120
    or p_release_sha is null or p_release_sha!~'^[0-9a-f]{40}$'
    or p_approval_reference is null or char_length(btrim(p_approval_reference)) not between 3 and 500
    or p_reason is null or char_length(btrim(p_reason)) not between 8 and 500 then
    raise exception using errcode='22023',message='CARD_RESET_EXACT_APPROVAL_REQUIRED';
  end if;
  select array_agg(id order by id) into expected from unnest(p_expected_receipt_ids) id;
  if array_position(expected,null) is not null or cardinality(expected)<>(select count(distinct id) from unnest(expected) id) then
    raise exception using errcode='22023',message='CARD_RESET_EXACT_APPROVAL_REQUIRED'; end if;
  request_digest:=encode(extensions.digest(jsonb_build_array(p_league_id,p_season_id,p_week_id,p_card_id,
    expected,p_expected_receipt_hash,p_release_sha,p_approval_reference,p_reason)::text,'sha256'),'hex');
  -- Same first locks as acceptance/results. All event facts are rechecked after
  -- the locks, so an accepted batch, kickoff or result cannot slip past reset.
  select * into strict s from private.seasons where id=p_season_id and league_id=p_league_id for update;
  select * into strict w from private.season_weeks where id=p_week_id and season_id=s.id and league_id=s.league_id for update;
  perform 1 from private.sports_events where week_id=w.id order by id for update;
  select * into strict c from private.weekly_cards where id=p_card_id and week_id=w.id and league_id=s.league_id for update;
  select * into existing from private.card_reset_events where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash<>request_digest then raise exception using errcode='22000',message='CARD_RESET_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('status','RESET','resetId',existing.id,'cardId',c.id,'weekId',w.id,
      'cardGeneration',existing.new_generation,'remainingCredits',1000,'resetAt',existing.created_at,'replayed',true);
  end if;
  now_at:=clock_timestamp();
  if s.mode<>'LIVE' or s.nfl_year<>2026 or s.lifecycle<>'REGULAR' or w.nfl_week<>2 or w.state<>'OPEN'
    or s.id<>(select current.id from private.seasons current where current.league_id=s.league_id order by current.created_at desc,current.id desc limit 1)
    or exists(select 1 from private.season_weeks newer where newer.season_id=s.id and newer.nfl_week>w.nfl_week)
    or c.card_generation<>0 or c.granted_credits<>1000 or c.locked_at is not null
    or exists(select 1 from private.card_reset_events where card_id=c.id)
    or not private.is_rolling_week(w.id) or private.is_player_props_week(w.id) then
    raise exception using errcode='55000',message='CARD_RESET_SCOPE_INELIGIBLE'; end if;
  if not exists(select 1 from private.sports_events where week_id=w.id)
    or exists(select 1 from private.sports_events e where e.week_id=w.id
      and (e.state<>'SCHEDULED' or e.actual_started_at is not null or e.scheduled_start_at<=now_at
        or private.event_entry_closes_at(e.id)<=now_at))
    or exists(select 1 from private.event_result_versions where week_id=w.id)
    or exists(select 1 from private.settlement_versions where week_id=w.id)
    or exists(select 1 from private.weekly_score_versions where week_id=w.id and (is_complete or status='FINAL' or score_centicredits<>0))
    or exists(select 1 from private.matchup_result_versions where week_id=w.id) then
    raise exception using errcode='55000',message='CARD_RESET_BEFORE_PLAY_ONLY'; end if;
  select array_agg(r.id order by r.id) into ids from private.position_receipts r
    where r.card_id=c.id and r.card_generation=c.card_generation;
  fingerprint:=private.card_receipt_fingerprint(c.id,c.card_generation);
  if ids is distinct from expected or fingerprint is distinct from p_expected_receipt_hash then
    raise exception using errcode='55000',message='CARD_RESET_RECEIPTS_CHANGED'; end if;
  insert into private.card_reset_events(league_id,season_id,week_id,card_id,previous_generation,new_generation,
    receipt_ids,receipt_fingerprint,idempotency_key,request_hash,release_sha,approval_reference,reason)
  values(s.league_id,s.id,w.id,c.id,0,1,ids,fingerprint,p_idempotency_key,request_digest,p_release_sha,p_approval_reference,p_reason)
  returning * into operation;
  update private.weekly_cards set card_generation=1,compliance='PENDING',locked_at=null where id=c.id;
  -- Old score versions remain auditable and cease to be active for this card.
  -- A later accepted batch writes a successor under generation 1.
  perform private.refresh_rolling_week_compliance(w.id);
  if exists(select 1 from private.effective_position_receipts where card_id=c.id)
    or private.card_receipt_fingerprint(c.id,0)<>fingerprint then
    raise exception using errcode='55000',message='CARD_RESET_AUDIT_MISMATCH'; end if;
  return jsonb_build_object('status','RESET','resetId',operation.id,'cardId',c.id,'weekId',w.id,
    'cardGeneration',1,'remainingCredits',1000,'resetAt',operation.created_at,'replayed',false);
end; $$;
revoke all on function private.reset_prestart_week2_card(uuid,uuid,uuid,uuid,uuid[],text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.reset_prestart_week2_card(uuid,uuid,uuid,uuid,uuid[],text,text,text,text,text) to service_role;

-- Explicit receipt consumer inventory, verified against the combined release.
-- Only FROM/JOIN reads change: inserts, immutable foreign keys and row types
-- retain the base table. The legacy single-position replay is restored below.
do $effective_receipts$
declare signature text; definition text; revised text;
begin
  foreach signature in array array[
    'api.accept_stage1_position(text,uuid,integer,text,text)',
    'api.advance_owner_rehearsal(text,text)',
    'api.bind_card_submission_intent(text,uuid,jsonb)',
    'api.claim_live_quote_refresh(uuid)',
    'api.claim_player_result_jobs()',
    'api.complete_nflverse_reconciliation(uuid,jsonb)',
    'api.complete_player_result_request(uuid,jsonb,integer,integer,integer)',
    'api.confirm_player_prop_menu(text,jsonb)',
    'api.get_commissioner_card_status(text)',
    'api.get_league_matchup_cards(text,uuid)',
    'api.get_owner_rehearsal()',
    'api.get_stage1_state(text)',
    'api.import_player_result_observations(jsonb)',
    'api.lock_stage1_week(uuid,text)',
    'api.plan_live_quote_refresh(uuid,jsonb)',
    'api.review_live_card_quotes(text,jsonb)',
    'private.abort_player_catalog_hold(uuid,uuid,uuid)',
    'private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)',
    'private.append_phase8b_archive(uuid,uuid,uuid)',
    'private.build_live_season_archive(uuid,timestamp with time zone)',
    'private.build_season_archive_v2(uuid,uuid,uuid,integer,uuid,uuid,timestamp with time zone)',
    'private.can_delete_empty_draft_league(uuid)',
    'private.due_score_events(uuid,boolean)',
    'private.enqueue_player_result_jobs()',
    'private.finalize_completed_week(uuid)',
    'private.is_week18_pairing_replaceable(uuid)',
    'private.is_week_card_sealed(uuid)',
    'private.live_archive_card(uuid)',
    'private.owner_rehearsal_sample_card(private.owner_rehearsals,integer,uuid)',
    'private.player_result_event_context(text,text)',
    'private.recompute_stage1_week(uuid,uuid)',
    'private.reconcile_player_event(uuid)',
    'private.record_owner_rehearsal_card_choice(uuid,text,text)',
    'private.refresh_rolling_week_compliance(uuid)',
    'private.rolling_card_can_submit(uuid)',
    'private.rolling_card_public_fields(uuid,uuid)',
    'private.settle_receipt_with_evidence(uuid,uuid)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    revised:=regexp_replace(definition,'\m(from|join)(\s+)private\.position_receipts\M','\1\2private.effective_position_receipts','gi');
    if revised=definition then raise exception 'Receipt consumer baseline changed: %',signature; end if;
    execute revised;
  end loop;
end; $effective_receipts$;

-- A reset also retires the already-written, incomplete zero score. Competitive
-- score reads select the active generation; the rebuild still links its next
-- score to the original immutable predecessor instead of dropping lineage.
do $effective_scores$
declare signature text; definition text; revised text; old text;
begin
  foreach signature in array array[
    'api.get_playoff_state(text)',
    'api.get_weekly_close_state(text)',
    'private.append_phase8b_archive(uuid,uuid,uuid)',
    'private.assert_phase8_terminal_lineage(uuid)',
    'private.build_regular_standings(uuid)',
    'private.finalize_completed_week(uuid)',
    'private.finalize_late_week_versions(uuid)',
    'private.is_week18_pairing_replaceable(uuid)',
    'private.live_archive_card(uuid)',
    'private.live_archive_matchup(uuid,uuid)',
    'private.recompute_stage1_week(uuid,uuid)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    revised:=regexp_replace(definition,'\m(from|join)(\s+)private\.weekly_score_versions\M','\1\2private.effective_weekly_score_versions','gi');
    if revised=definition then raise exception 'Score consumer baseline changed: %',signature; end if;
    if signature='private.recompute_stage1_week(uuid,uuid)' then
      old:='select * into v_previous_score'||chr(10)||'    from private.effective_weekly_score_versions as score';
      if strpos(revised,old)=0 then raise exception 'Score predecessor baseline changed'; end if;
      revised:=replace(revised,old,'select * into v_previous_score'||chr(10)||'    from private.weekly_score_versions as score');
    end if;
    execute revised;
  end loop;
end; $effective_scores$;

-- Generation zero keeps the exact existing intent representation and digest.
-- Original committed consent can be checked at its saved epoch after a reset;
-- new acceptance always revalidates the current card and rules under locks.
CREATE OR REPLACE FUNCTION private.submission_economic_terms_at_epoch(p_actor uuid, p_league uuid, p_positions jsonb, p_ruleset_snapshot_id uuid, p_card_generation integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare terms jsonb; matched integer; weeks integer;
begin
  if jsonb_typeof(p_positions) is distinct from 'array' or jsonb_array_length(p_positions) not between 1 and 20 then
    raise exception using errcode='22023',message='Invalid submission intent.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_positions) i where
    jsonb_typeof(i->'stakeCredits') is distinct from 'number'
    or (i->>'stakeCredits')::numeric <> trunc((i->>'stakeCredits')::numeric)
    or (i->>'stakeCredits')::numeric not between 50 and 1000) then
    raise exception using errcode='22023',message='Invalid submission stake.';
  end if;
  select count(*),count(distinct q.week_id),jsonb_agg(jsonb_build_object(
    'actorId',p_actor,'leagueId',p_league,'cardId',c.id,'weekId',q.week_id,
    'rulesetSnapshotId',r.id,'rulesetHash',r.sha256_hash,
    'eventId',q.event_id,'marketType',q.market_type,'subjectId',q.subject_id,
    'subjectLabel',q.subject_label,'subjectTeam',q.subject_team,
    'statistic',q.statistic,'period',q.period,'outcomeKey',q.outcome_key,
    'lineMilli',q.line_milli,'americanOdds',q.american_odds,'bookKey',q.book_key,
    'stakeCredits',(i.value->>'stakeCredits')::integer)
    || case when coalesce(p_card_generation,c.card_generation)=0 then '{}'::jsonb else jsonb_build_object('cardGeneration',coalesce(p_card_generation,c.card_generation)) end
    order by q.event_id,q.market_type,q.subject_id nulls first,q.outcome_key,(i.value->>'stakeCredits')::integer)
  into matched,weeks,terms
  from jsonb_array_elements(p_positions) i(value)
  join private.market_snapshots q on q.id=(i.value->>'marketSnapshotId')::uuid
    and q.payload_hash=i.value->>'payloadHash' and q.league_id=p_league
  join private.season_weeks w on w.id=q.week_id
  join private.season_ruleset_snapshots r on r.id=coalesce(p_ruleset_snapshot_id,w.ruleset_snapshot_id)
  join private.weekly_cards c on c.week_id=w.id and c.owner_user_id=p_actor;
  if matched<>jsonb_array_length(p_positions) or weeks<>1 then
    raise exception using errcode='22023',message='Every submission quote must belong to your same-week card.';
  end if;
  return terms;
end;
$function$;

revoke all on function private.submission_economic_terms_at_epoch(uuid,uuid,jsonb,uuid,integer) from public,anon,authenticated;
create or replace function private.submission_economic_terms(p_actor uuid,p_league uuid,p_positions jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.submission_economic_terms_at_epoch(p_actor,p_league,p_positions,null,null);
$$;

create function private.lock_card_submission_epoch(p_card_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare c private.weekly_cards%rowtype;
begin
  select * into strict c from private.weekly_cards where id=p_card_id;
  perform 1 from private.seasons where id=c.season_id for update;
  perform 1 from private.season_weeks where id=c.week_id for update;
  perform 1 from private.weekly_cards where id=c.id for update;
end; $$;
revoke all on function private.lock_card_submission_epoch(uuid) from public,anon,authenticated;

create function private.card_command_reset_response(p_actor uuid,p_response jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('status','RESET','reset',true,'resetId',reset.id,
    'cardId',card.id,'weekId',card.week_id,'cardGeneration',card.card_generation,
    'resetAt',reset.created_at,'replayed',true,'remainingCredits',card.granted_credits-
      (select coalesce(sum(active.stake_credits),0) from private.effective_position_receipts active where active.card_id=card.id))
  from jsonb_array_elements(coalesce(p_response->'receipts',
    case when p_response ? 'receiptId' then jsonb_build_array(p_response) else '[]'::jsonb end)) item
  join private.position_receipts receipt on receipt.id=(item->>'receiptId')::uuid and receipt.owner_user_id=p_actor
  join private.weekly_cards card on card.id=receipt.card_id and card.card_generation>receipt.card_generation
  join private.card_reset_events reset on reset.card_id=card.id
  limit 1;
$$;
revoke all on function private.card_command_reset_response(uuid,jsonb) from public,anon,authenticated;

create or replace function api.bind_card_submission_intent(p_league_slug text,p_intent_id uuid,p_positions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); league uuid; terms jsonb; saved private.card_submission_intents%rowtype;
  digest text; response jsonb; mode text; card private.weekly_cards%rowtype; week private.season_weeks%rowtype;
begin
  select id into league from private.leagues where slug=lower(p_league_slug);
  perform private.authorize_submission_intent(actor,league);
  if p_intent_id is null then raise exception 'Submission identity required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':intent:'||p_intent_id::text,0));
  select * into saved from private.card_submission_intents where id=p_intent_id;
  if found then
    if saved.actor_user_id<>actor or saved.league_id<>league then
      raise exception using errcode='22000',message='Idempotency key was reused with a different request.'; end if;
    perform private.lock_card_submission_epoch(saved.card_id);
    select * into strict card from private.weekly_cards where id=saved.card_id;
    select * into strict week from private.season_weeks where id=saved.week_id;
    terms:=private.submission_economic_terms_at_epoch(actor,league,p_positions,
      (saved.economic_terms->0->>'rulesetSnapshotId')::uuid,saved.card_generation);
    digest:=encode(extensions.digest(terms::text,'sha256'),'hex');
    if digest<>saved.intent_hash then
      raise exception using errcode='22000',message='Idempotency key was reused with a different request.'; end if;
    select response_json into response from private.command_receipts where actor_user_id=actor
      and command_name='ACCEPT_STAGE1_CARD' and idempotency_key='intent:'||p_intent_id::text and request_hash=digest;
    if response is null and (saved.card_generation<>card.card_generation
      or (saved.economic_terms->0->>'rulesetSnapshotId')::uuid<>week.ruleset_snapshot_id) then
      raise exception using errcode='55000',message='CARD_RESET_REVIEW_REQUIRED'; end if;
  else
    terms:=private.submission_economic_terms(actor,league,p_positions);
    perform private.lock_card_submission_epoch((terms->0->>'cardId')::uuid);
    terms:=private.submission_economic_terms(actor,league,p_positions);
    select * into strict card from private.weekly_cards where id=(terms->0->>'cardId')::uuid;
    select * into strict week from private.season_weeks where id=card.week_id;
    if exists(select 1 from jsonb_array_elements(p_positions) item join private.live_card_quote_reviews review
      on review.id=(item->>'reviewId')::uuid where review.card_id=card.id
      and (review.card_generation<>card.card_generation or (review.ruleset_snapshot_id is not null and review.ruleset_snapshot_id<>week.ruleset_snapshot_id))) then
      raise exception using errcode='55000',message='CARD_RESET_REVIEW_REQUIRED'; end if;
    digest:=encode(extensions.digest(terms::text,'sha256'),'hex');
    insert into private.card_submission_intents(id,actor_user_id,league_id,week_id,card_id,economic_terms,intent_hash,card_generation)
    values(p_intent_id,actor,league,week.id,card.id,terms,digest,card.card_generation);
  end if;
  select s.mode into mode from private.seasons s where s.id=week.season_id;
  return jsonb_build_object('intentId',p_intent_id,'leagueId',league,'mode',mode,
    'operationKey','intent:'||p_intent_id::text,'cardGeneration',card.card_generation,
    'reset',response is not null and saved.card_generation<>card.card_generation,
    'committed',response is not null and saved.card_generation=card.card_generation,
    'result',case when response is not null and saved.card_generation<>card.card_generation
      then private.card_command_reset_response(actor,response) else response end,
    'cardSealed',not private.is_rolling_week(week.id) and
      (select coalesce(sum(r.stake_credits),0) from private.effective_position_receipts r where r.card_id=card.id)=card.granted_credits);
end; $$;

create or replace function private.assert_card_submission_intent(p_actor uuid,p_league uuid,p_positions jsonb,p_key text)
returns text language plpgsql security definer set search_path='' as $$
declare saved private.card_submission_intents%rowtype; terms jsonb; digest text; card private.weekly_cards%rowtype; week private.season_weeks%rowtype;
begin
  perform private.authorize_submission_intent(p_actor,p_league);
  select * into saved from private.card_submission_intents where id=(p_positions->0->>'intentId')::uuid;
  if saved.id is null or saved.actor_user_id<>p_actor or saved.league_id<>p_league or p_key<>'intent:'||saved.id::text then
    raise exception using errcode='42501',message='Submission intent unavailable.'; end if;
  terms:=private.submission_economic_terms_at_epoch(p_actor,p_league,p_positions,
    (saved.economic_terms->0->>'rulesetSnapshotId')::uuid,saved.card_generation);
  digest:=encode(extensions.digest(terms::text,'sha256'),'hex');
  if digest<>saved.intent_hash then
    raise exception using errcode='22000',message='Confirmed terms changed. A new explicit confirmation is required.'; end if;
  -- Immutable committed requests remain recoverable, including after reset.
  if exists(select 1 from private.command_receipts where actor_user_id=p_actor and command_name='ACCEPT_STAGE1_CARD'
    and idempotency_key=p_key and request_hash=digest) then return digest; end if;
  select * into strict card from private.weekly_cards where id=saved.card_id;
  select * into strict week from private.season_weeks where id=saved.week_id;
  if card.card_generation<>saved.card_generation or week.ruleset_snapshot_id<>(saved.economic_terms->0->>'rulesetSnapshotId')::uuid then
    raise exception using errcode='55000',message='CARD_RESET_REVIEW_REQUIRED'; end if;
  return digest;
end; $$;

create trigger card_submission_intents_append_only before update or delete on private.card_submission_intents
  for each row execute function private.reject_competitive_mutation();

-- Reviews attest both card generation and the governing rules. An opened-week
-- rules amendment also invalidates reviews on the other unchanged cards.
do $card_epoch_guards$
declare d text; old text; replacement text;
begin
  d:=pg_get_functiondef('api.review_live_card_quotes(text,jsonb)'::regprocedure);
  old:='and actor_user_id=v_user and positions=v_positions and expires_at>v_now+interval ''5 seconds''';
  if strpos(d,old)=0 then raise exception 'Review reuse epoch baseline changed'; end if;
  d:=replace(d,old,old||' and card_generation=v_card.card_generation and ruleset_snapshot_id=v_week.ruleset_snapshot_id');
  -- A second QB in the same game is distinct from the QB already accepted.
  old:='where r.card_id=v_card.id and r.event_id=m.event_id and r.market_type=m.market_type)';
  if strpos(d,old)=0 then raise exception 'Review player duplicate baseline changed'; end if;
  d:=replace(d,old,'where r.card_id=v_card.id and r.event_id=m.event_id and r.market_type=m.market_type'
    ||' and r.subject_id is not distinct from m.subject_id and r.statistic is not distinct from m.statistic'
    ||' and r.period is not distinct from m.period)');
  execute d;

  d:=pg_get_functiondef('private.assert_live_card_quote_review(uuid,uuid,jsonb,timestamp with time zone)'::regprocedure);
  old:='if v_review.reviewed_at>p_now or v_review.expires_at<=p_now then';
  if strpos(d,old)=0 then raise exception 'Review epoch assertion baseline changed'; end if;
  d:=replace(d,old,$new$
  if exists(select 1 from private.weekly_cards c join private.season_weeks w on w.id=c.week_id
    where c.id=p_card_id and (v_review.card_generation<>c.card_generation
      or (v_review.ruleset_snapshot_id is not null and v_review.ruleset_snapshot_id<>w.ruleset_snapshot_id)
      or (v_review.ruleset_snapshot_id is null and (c.card_generation<>0 or private.is_player_props_week(w.id))))) then
    raise exception using errcode='55000',message='CARD_RESET_REVIEW_REQUIRED'; end if;
  if v_review.reviewed_at>p_now or v_review.expires_at<=p_now then$new$);
  execute d;

  d:=pg_get_functiondef('api.revalidate_card_submission_intent(uuid,uuid)'::regprocedure);
  old:='perform private.authorize_submission_intent(actor,saved.league_id);';
  if strpos(d,old)=0 then raise exception 'Intent renewal epoch baseline changed'; end if;
  d:=replace(d,old,old||$new$
  perform private.lock_card_submission_epoch(saved.card_id);
  if exists(select 1 from private.weekly_cards c join private.season_weeks w on w.id=c.week_id
    where c.id=saved.card_id and (c.card_generation<>saved.card_generation
      or w.ruleset_snapshot_id<>(saved.economic_terms->0->>'rulesetSnapshotId')::uuid)) then
    raise exception using errcode='55000',message='CARD_RESET_REVIEW_REQUIRED'; end if;
  if exists(select 1 from private.live_card_quote_reviews r join private.weekly_cards c on c.id=r.card_id
    join private.season_weeks w on w.id=c.week_id where r.id=p_review_id and r.card_id=saved.card_id
    and (r.card_generation<>c.card_generation or (r.ruleset_snapshot_id is not null and r.ruleset_snapshot_id<>w.ruleset_snapshot_id)
      or (r.ruleset_snapshot_id is null and (c.card_generation<>0 or private.is_player_props_week(w.id))))) then
    raise exception using errcode='55000',message='CARD_RESET_REVIEW_REQUIRED'; end if;
$new$);
  execute d;

  d:=pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure);
  replacement:='return coalesce(private.card_command_reset_response(v_user_id,v_command.response_json),'
    ||'v_command.response_json || jsonb_build_object(''replayed'',true));';
  if d !~ 'return v_command.response_json \|\| jsonb_build_object\(''replayed'',' then
    raise exception 'Committed command recovery baseline changed'; end if;
  d:=regexp_replace(d,'return v_command.response_json \|\| jsonb_build_object\(''replayed'',\s*true\);',replacement,'g');
  old:='  if v_week.nfl_week = 2 and exists (';
  if strpos(d,old)=0 then raise exception 'Locked card epoch baseline changed'; end if;
  d:=replace(d,old,$new$  if p_positions->0->>'intentId' is not null then
    perform private.assert_card_submission_intent(v_user_id,v_league.id,p_positions,p_idempotency_key);
  end if;
  if v_week.nfl_week = 2 and exists ($new$);
  execute d;

  -- This retained legacy command reads the base receipt solely to recover its
  -- original immutable request. Its competitive counts still use the view.
  d:=pg_get_functiondef('api.accept_stage1_position(text,uuid,integer,text,text)'::regprocedure);
  old:='select * into v_existing'||chr(10)||'  from private.effective_position_receipts as receipt';
  if strpos(d,old)=0 then raise exception 'Legacy receipt replay baseline changed'; end if;
  d:=replace(d,old,'select * into v_existing'||chr(10)||'  from private.position_receipts as receipt');
  old:='    return jsonb_build_object('||chr(10)||'      ''receiptId'', v_existing.id,';
  if strpos(d,old)=0 then raise exception 'Legacy receipt response baseline changed'; end if;
  d:=replace(d,old,$new$    if not private.is_league_member(v_existing.league_id) then
      raise exception using errcode='42501',message='League membership required.'; end if;
    v_response:=private.card_command_reset_response(v_user_id,jsonb_build_object('receiptId',v_existing.id));
    if v_response is not null then return v_response; end if;
    return jsonb_build_object(
      'receiptId', v_existing.id,$new$);
  execute d;

  d:=pg_get_functiondef('private.settle_receipt_with_evidence(uuid,uuid)'::regprocedure);
  old:='select * into strict r from private.effective_position_receipts where id=p_receipt_id;';
  if strpos(d,old)=0 then raise exception 'Effective receipt grading baseline changed'; end if;
  execute replace(d,old,'select * into r from private.effective_position_receipts where id=p_receipt_id; if not found then return; end if;');
end; $card_epoch_guards$;

create function private.guard_reset_receipt_settlement() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from private.effective_position_receipts r where r.id=new.receipt_id) then
    raise exception using errcode='55000',message='CARD_RECEIPT_RESET'; end if;
  return new;
end; $$;
revoke all on function private.guard_reset_receipt_settlement() from public,anon,authenticated;
create trigger guard_reset_receipt_settlement before insert on private.settlement_versions
  for each row execute function private.guard_reset_receipt_settlement();

create function private.owner_reset_receipts(p_card_id uuid,p_actor uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'receiptHash',r.receipt_hash,
    'proposition',r.proposition,'stakeCredits',r.stake_credits,'eventLabel',e.away_team||' at '||e.home_team,
    'marketType',r.market_type,'americanOdds',r.american_odds,'acceptedAt',r.accepted_at) order by r.accepted_at,r.id),'[]'::jsonb)
  from private.position_receipts r join private.weekly_cards c on c.id=r.card_id
  join private.sports_events e on e.id=r.event_id
  where c.id=p_card_id and c.owner_user_id=p_actor and p_actor=(select auth.uid())
    and r.card_generation<c.card_generation;
$$;
revoke all on function private.owner_reset_receipts(uuid,uuid) from public,anon,authenticated;
do $owner_reset_projection$
declare d text; old text:='''ownerCard'', case when v_card.id is null then null else jsonb_build_object(';
begin
  d:=pg_get_functiondef('api.get_stage1_state(text)'::regprocedure);
  if strpos(d,old)=0 then raise exception 'Owner card epoch projection baseline changed'; end if;
  execute replace(d,old,old||$new$
      'cardGeneration',v_card.card_generation,
      'resetAt',(select r.created_at from private.card_reset_events r where r.card_id=v_card.id),
      'resetReceipts',private.owner_reset_receipts(v_card.id,v_card.owner_user_id),$new$);
end; $owner_reset_projection$;

-- Fail migration if a newly introduced competitive reader was omitted from the
-- audited inventory. These six base readers are solely immutable audit/replay,
-- reset validation, or the new score's predecessor linkage described above.
do $reset_consumer_audit$
declare unexpected text;
begin
  select string_agg(n.nspname||'.'||p.proname,', ' order by n.nspname,p.proname) into unexpected
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('api','private') and p.prokind='f'
    and p.prosrc ~* '\m(from|join)\s+private\.position_receipts\M'
    and n.nspname||'.'||p.proname not in('api.accept_stage1_position','private.card_receipt_fingerprint',
      'private.reset_prestart_week2_card','private.card_command_reset_response','private.owner_reset_receipts');
  if unexpected is not null then raise exception 'Unreviewed base receipt reader: %',unexpected; end if;
  select string_agg(n.nspname||'.'||p.proname,', ' order by n.nspname,p.proname) into unexpected
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('api','private') and p.prokind='f'
    and p.prosrc ~* '\m(from|join)\s+private\.weekly_score_versions\M'
    and n.nspname||'.'||p.proname not in('private.recompute_stage1_week','private.reset_prestart_week2_card');
  if unexpected is not null then raise exception 'Unreviewed base score reader: %',unexpected; end if;
end; $reset_consumer_audit$;
