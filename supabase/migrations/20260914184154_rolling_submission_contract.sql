-- Rolling Ruleset 1.3 support. This migration prepares, but does not activate,
-- the approved package; opened weeks retain their exact snapshot and behavior.
create table private.prepared_rolling_rulesets (
  mode text primary key check(mode in ('LIVE','SIMULATION')),
  canonical_json jsonb not null,
  sha256_hash text not null check(sha256_hash ~ '^[0-9a-f]{64}$')
);
alter table private.prepared_rolling_rulesets enable row level security;
revoke all on private.prepared_rolling_rulesets from public,anon,authenticated;
insert into private.prepared_rolling_rulesets(mode,canonical_json,sha256_hash)
select mode,j,encode(extensions.digest(private.canonical_ruleset_json(j),'sha256'),'hex')
from (select mode, jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(canonical_json,
  '{version}','"1.3"'),'{productBibleVersion}','"3.2"'),'{card}',canonical_json->'card'||
  '{"acceptanceUnit":"BATCH_ATOMIC","irreversibleAction":"SUBMIT_BETS","requireFullAllocation":false,"unusedCredits":"EXPIRE_AT_WEEK_ENTRY_CLOSE"}'::jsonb),
  '{slate}',canonical_json->'slate'||'{"entryCutoff":"EVENT_SCHEDULED_KICKOFF","gameVisibility":"ACCEPTED_SUBMISSION","aggregateVisibility":"COMMON_LOCK"}'::jsonb),
  '{attendance}',canonical_json->'attendance'||'{"incompleteDefinition":"ZERO_ACCEPTED_POSITIONS"}'::jsonb) j
  from private.authoritative_season_rulesets where ruleset_version='1.2' and sha256_hash=case mode
    when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
    else 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b' end) packages;
do $$ begin if (select count(*) from private.prepared_rolling_rulesets)<>2 then
  raise exception 'Rolling support requires the exact approved V1.2 catalog'; end if; end $$;
create trigger prepared_rolling_rulesets_append_only before update or delete on private.prepared_rolling_rulesets
  for each row execute function private.reject_competitive_mutation();
create function private.rolling_ruleset_package(p_mode text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select canonical_json from private.prepared_rolling_rulesets where mode=p_mode;
$$;
revoke all on function private.rolling_ruleset_package(text) from public,anon,authenticated;

create function private.is_rolling_week(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select r.ruleset_version='1.3' from private.season_weeks w
 join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.id=p_week_id),false);
$$;
revoke all on function private.is_rolling_week(uuid) from public,anon,authenticated;

-- The original published scheduled cutoff can become earlier, never later.
-- Start evidence may close entry early without scheduled time revealing a bet.
alter table private.sports_events add column entry_cutoff_at timestamptz;
update private.sports_events set entry_cutoff_at=scheduled_start_at;
alter table private.sports_events alter column entry_cutoff_at set not null;
create table private.event_entry_cutoff_history (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null, -- retained audit identity also survives discard of an unplayed draft
 previous_cutoff_at timestamptz,
 cutoff_at timestamptz not null,
 scheduled_start_at timestamptz not null,
 recorded_at timestamptz not null default clock_timestamp(),
 reason text not null check(reason in ('PUBLISHED','EARLIER_SCHEDULE','START_EVIDENCE'))
);
create index event_entry_cutoff_history_event_idx on private.event_entry_cutoff_history(event_id,recorded_at);
alter table private.event_entry_cutoff_history enable row level security;
revoke all on private.event_entry_cutoff_history from public,anon,authenticated;
create trigger event_entry_cutoff_history_append_only before update or delete on private.event_entry_cutoff_history
 for each row execute function private.reject_competitive_mutation();
insert into private.event_entry_cutoff_history(event_id,cutoff_at,scheduled_start_at,reason)
 select id,entry_cutoff_at,scheduled_start_at,'PUBLISHED' from private.sports_events;
create function private.preserve_event_entry_cutoff() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.entry_cutoff_at:=new.scheduled_start_at;
 else new.entry_cutoff_at:=least(old.entry_cutoff_at,new.scheduled_start_at); end if;
 if new.actual_started_at is not null then new.entry_cutoff_at:=least(new.entry_cutoff_at,new.actual_started_at); end if;
 return new;
end; $$;
revoke all on function private.preserve_event_entry_cutoff() from public,anon,authenticated;
create trigger preserve_event_entry_cutoff before insert or update on private.sports_events
 for each row execute function private.preserve_event_entry_cutoff();
create function private.record_event_entry_cutoff() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or new.entry_cutoff_at is distinct from old.entry_cutoff_at then
 insert into private.event_entry_cutoff_history(event_id,previous_cutoff_at,cutoff_at,scheduled_start_at,reason)
 values(new.id,case when tg_op='UPDATE' then old.entry_cutoff_at end,new.entry_cutoff_at,new.scheduled_start_at,
 case when tg_op='INSERT' then 'PUBLISHED' when new.actual_started_at is not null and new.entry_cutoff_at=new.actual_started_at
 then 'START_EVIDENCE' else 'EARLIER_SCHEDULE' end);
 end if; return new;
end; $$;
revoke all on function private.record_event_entry_cutoff() from public,anon,authenticated;
create trigger record_event_entry_cutoff after insert or update on private.sports_events
 for each row execute function private.record_event_entry_cutoff();
create function private.event_entry_closes_at(p_event_id uuid) returns timestamptz
language sql stable security invoker set search_path='' as $$
 select entry_cutoff_at from private.sports_events where id=p_event_id;
$$;
create function private.week_entry_closes_at(p_week_id uuid) returns timestamptz
language sql stable security invoker set search_path='' as $$
 select case when private.is_rolling_week(w.id) then coalesce((select max(e.entry_cutoff_at)
 from private.sports_events e where e.week_id=w.id and exists(select 1 from private.slate_items i
 where i.event_id=e.id and i.week_id=w.id and private.is_effective_slate_item(i.id))),w.common_lock_at)
 else w.common_lock_at end from private.season_weeks w where w.id=p_week_id;
$$;
create function private.event_accepts_entries(p_event_id uuid) returns boolean
language sql volatile security invoker set search_path='' as $$
 select coalesce((select w.state in ('OPEN','LOCKED','PROVISIONAL') and
 private.card_confirmation_time(w.season_id)>=w.opens_at and
 private.card_confirmation_time(w.season_id)<case when private.is_rolling_week(w.id) then e.entry_cutoff_at else w.common_lock_at end
 and e.state='SCHEDULED' and e.actual_started_at is null
 from private.sports_events e join private.season_weeks w on w.id=e.week_id where e.id=p_event_id),false);
$$;
revoke all on function private.event_entry_closes_at(uuid),private.week_entry_closes_at(uuid),private.event_accepts_entries(uuid)
 from public,anon,authenticated;

-- Preserve the original review evidence rows while allowing one per batch.
alter table private.card_quote_review_acceptances drop constraint card_quote_review_acceptances_pkey;
alter table private.card_quote_review_acceptances add primary key(card_id,review_id);
-- One exact request identity cannot produce two commands even for concurrent callers.
-- Existing unique command key and shared season/week/card locking are retained.

-- Extend the supported exact package and finite prospective upgrade gate.
do $migration$
declare d text; old_text text;
begin
 select pg_get_functiondef('private.season_card_rules(uuid,text)'::regprocedure) into d;
 d:=replace(d,$old$in ('1.0','1.1','1.2')$old$,$new$in ('1.0','1.1','1.2','1.3')$new$);
 d:=replace(d,$old$when '1.2' then '3.1' else '3.0'$old$,$new$when '1.3' then '3.2' when '1.2' then '3.1' else '3.0'$new$);
 old_text:='  if v_json->''card'' is distinct from v_card';
 if strpos(d,old_text)=0 then raise exception 'Rolling rules support baseline changed'; end if;
 d:=replace(d,old_text,$patch$  if v_snapshot.ruleset_version='1.3' then
    if v_json is distinct from private.rolling_ruleset_package(p_mode) then
      raise exception using errcode='22023',message='UNSUPPORTED_SEASON_CARD_RULES'; end if;
    v_card:=v_json->'card'; v_concentration:=v_json->'concentration';
  end if;
  if v_json->'card' is distinct from v_card$patch$);
 execute d;
 select pg_get_functiondef('private.pin_week_rules()'::regprocedure) into d;
 old_text:=$old$if v_previous.ruleset_version not in ('1.0','1.1') or v_catalog.ruleset_version<>'1.2'
    or v_catalog.sha256_hash<>(case v_season.mode
      when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
      else 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b' end)$old$;
 if strpos(d,old_text)=0 then raise exception 'Rolling week upgrade baseline changed'; end if;
 execute replace(d,old_text,$new$if not ((v_previous.ruleset_version in ('1.0','1.1') and v_catalog.ruleset_version='1.2'
    and v_catalog.sha256_hash=(case v_season.mode
      when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
      else 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b' end))
    or (v_previous.ruleset_version in ('1.0','1.1','1.2') and v_catalog.ruleset_version='1.3'
    and v_catalog.canonical_json=private.rolling_ruleset_package(v_season.mode)
    and v_catalog.sha256_hash=(select sha256_hash from private.prepared_rolling_rulesets where mode=v_season.mode)))$new$);
end;
$migration$;

-- Preserve the verified current private.accept_authoritative_card_for_actor(uuid,text,jsonb,text) authority and grants.
do $migration$
declare d text; e record;
begin
 select pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure) into d;
 for e in select * from (values
 ($old$  v_request_hash := encode($old$,$new$  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text||':'||p_idempotency_key,0));
  v_request_hash := encode($new$),
 ($old$  limit 1;

  select week.*$old$,$new$  limit 1
  for update;

  select week.*$new$),
 ($old$if v_week.state <> 'OPEN'
    or v_now < v_week.opens_at
    or v_now >= v_week.common_lock_at then$old$,$new$if (not private.is_rolling_week(v_week.id) and v_week.state <> 'OPEN')
    or v_week.state not in ('OPEN','LOCKED','PROVISIONAL')
    or v_now < v_week.opens_at
    or v_now >= private.week_entry_closes_at(v_week.id) then$new$),
 ($old$if v_existing_credits + v_draft_credits <> (v_rules#>>'{card,weeklyAllocationCredits}')::integer then$old$,$new$if (not private.is_rolling_week(v_week.id) and v_existing_credits + v_draft_credits <> (v_rules#>>'{card,weeklyAllocationCredits}')::integer)
    or v_existing_credits + v_draft_credits > (v_rules#>>'{card,weeklyAllocationCredits}')::integer then$new$),
 ($old$message = 'The complete card must allocate exactly 1,000 credits.'$old$,$new$message = case when private.is_rolling_week(v_week.id) then 'The submitted bets exceed the remaining weekly credits.' else 'The complete card must allocate exactly 1,000 credits.' end$new$),
 ($old$  if v_season.mode = 'LIVE' and ((p_positions$old$,$new$  if private.is_rolling_week(v_week.id) then
    perform 1 from private.sports_events e where e.id in (select m.event_id from jsonb_array_elements(p_positions) i
      join private.market_snapshots m on m.id=(i->>'marketSnapshotId')::uuid) order by e.id for update;
    v_now:=private.card_confirmation_time(v_season.id);
  end if;
  if v_season.mode = 'LIVE' and ((p_positions$new$),
 ($old$    if v_snapshot.payload_hash <> v_item.payload_hash then$old$,$new$    if private.is_rolling_week(v_week.id) and not private.event_accepts_entries(v_snapshot.event_id) then
      raise exception using errcode='55000',message='This game is closed for new bets.'; end if;
    if v_snapshot.payload_hash <> v_item.payload_hash then$new$),
 ($old$  for v_item in
    select
      item.ordinality::integer as position_number,
      (item.value ->> 'marketSnapshotId')::uuid as market_snapshot_id,
      (item.value ->> 'stakeCredits')::integer as stake_credits
$old$,$new$  if private.is_rolling_week(v_week.id) then
    v_now:=private.card_confirmation_time(v_season.id);
    if exists(select 1 from jsonb_array_elements(p_positions) i join private.market_snapshots m on m.id=(i->>'marketSnapshotId')::uuid
      where not private.event_accepts_entries(m.event_id)) then
      raise exception using errcode='55000',message='This game is closed for new bets.'; end if;
    if v_quote_review_id is not null then
      perform private.assert_live_card_quote_review(v_card.id,v_user_id,p_positions,v_now); end if;
  end if;
  for v_item in
    select
      item.ordinality::integer as position_number,
      (item.value ->> 'marketSnapshotId')::uuid as market_snapshot_id,
      (item.value ->> 'stakeCredits')::integer as stake_credits
$new$),
 ($old$  v_response := jsonb_build_object(
    'receipts'$old$,$new$  if private.is_rolling_week(v_week.id) then
    update private.weekly_cards set compliance='COMPLIANT' where id=v_card.id;
    perform private.recompute_stage1_week(v_week.id,null);
  end if;
  v_response := jsonb_build_object(
    'receipts'$new$),
 ($old$'allocatedCredits', (v_rules#>>'{card,weeklyAllocationCredits}')::integer,
    'remainingCredits', 0,$old$,$new$'allocatedCredits', v_existing_credits + v_draft_credits,
    'remainingCredits', (v_rules#>>'{card,weeklyAllocationCredits}')::integer-v_existing_credits-v_draft_credits,$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Rolling migration baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text);
 end loop; execute d;
end;
$migration$;

-- Preserve the verified current api.review_live_card_quotes(text,jsonb) authority and grants.
do $migration$
declare d text; e record;
begin
 select pg_get_functiondef('api.review_live_card_quotes(text,jsonb)'::regprocedure) into d;
 for e in select * from (values
 ($old$v_week.state<>'OPEN' or v_now<v_week.opens_at or v_now>=v_week.common_lock_at$old$,$new$(not private.is_rolling_week(v_week.id) and v_week.state<>'OPEN') or v_week.state not in ('OPEN','LOCKED','PROVISIONAL') or v_now<v_week.opens_at or v_now>=private.week_entry_closes_at(v_week.id)$new$),
 ($old$or (select sum((item->>'stakeCredits')::numeric) from jsonb_array_elements(p_positions) item) is distinct from (v_rules#>>'{card,weeklyAllocationCredits}')::numeric$old$,$new$or (not private.is_rolling_week(v_week.id) and (select sum((item->>'stakeCredits')::numeric) from jsonb_array_elements(p_positions) item) is distinct from (v_rules#>>'{card,weeklyAllocationCredits}')::numeric)$new$),
 ($old$  if exists(select 1 from private.position_receipts where card_id=v_card.id) then$old$,$new$  if not private.is_rolling_week(v_week.id) and exists(select 1 from private.position_receipts where card_id=v_card.id) then$new$),
 ($old$  select jsonb_agg(jsonb_build_object('marketSnapshotId',current.id$old$,$new$  if private.is_rolling_week(v_week.id) and ((select coalesce(sum(stake_credits),0) from private.position_receipts where card_id=v_card.id)
    +(select sum((i->>'stakeCredits')::integer) from jsonb_array_elements(p_positions) i)>1000
    or (select count(*) from private.position_receipts where card_id=v_card.id)+jsonb_array_length(p_positions)>20
    or exists(select 1 from jsonb_array_elements(p_positions) i join private.market_snapshots m on m.id=(i->>'marketSnapshotId')::uuid
      where not private.event_accepts_entries(m.event_id) or exists(select 1 from private.position_receipts r
        where r.card_id=v_card.id and r.event_id=m.event_id and r.market_type=m.market_type))) then
    raise exception using errcode='22023',message='The batch exceeds the remaining budget or includes a closed or submitted market.'; end if;
  select jsonb_agg(jsonb_build_object('marketSnapshotId',current.id$new$),
 ($old$least(v_now+interval '30 seconds',v_week.common_lock_at)$old$,$new$least(v_now+interval '30 seconds',private.week_entry_closes_at(v_week.id),
        (select min(private.event_entry_closes_at(m.event_id)) from jsonb_array_elements(v_positions) i
         join private.market_snapshots m on m.id=(i->>'marketSnapshotId')::uuid))$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Rolling migration baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text);
 end loop; execute d;
end;
$migration$;

-- A refresh lease names exactly the requested remaining published games. It can
-- never add an event or attest an unrelated quote head as freshly observed.
alter table private.live_quote_refreshes add column event_ids jsonb;

-- Preserve the verified current api.claim_live_quote_refresh(uuid) authority and grants.
do $migration$
declare d text; e record;
begin
 select pg_get_functiondef('api.claim_live_quote_refresh(uuid)'::regprocedure) into d;
 for e in select * from (values
 ($old$v_week.state not in ('PLANNED','OPEN') or v_now >= v_week.common_lock_at$old$,$new$(v_week.state not in ('PLANNED','OPEN') and not (private.is_rolling_week(v_week.id) and v_week.state in ('LOCKED','PROVISIONAL'))) or v_now >= private.week_entry_closes_at(v_week.id)$new$),
 ($old$and not exists (select 1 from private.position_receipts r where r.card_id = c.id)$old$,$new$and ((not private.is_rolling_week(v_week.id) and not exists (select 1 from private.position_receipts r where r.card_id = c.id))
        or (private.is_rolling_week(v_week.id) and (select coalesce(sum(r.stake_credits),0) from private.position_receipts r where r.card_id=c.id)<=950
        and (select count(*) from private.position_receipts r where r.card_id=c.id)<20))$new$),
 ($old$from private.sports_events e where e.week_id = v_week.id;$old$,$new$from private.sports_events e where e.week_id = v_week.id
    and (not private.is_rolling_week(v_week.id) or (e.state='SCHEDULED' and e.actual_started_at is null and e.entry_cutoff_at>v_now))
    and exists(select 1 from private.slate_items i where i.event_id=e.id and i.week_id=v_week.id and private.is_effective_slate_item(i.id));$new$),
 ($old$lease_expires_at,state)
    values(v_week.id,v_lease,v_user,v_now,v_now + interval '45 seconds','RUNNING')$old$,$new$lease_expires_at,state,event_ids)
    values(v_week.id,v_lease,v_user,v_now,v_now + interval '45 seconds','RUNNING',v_events)$new$),
 ($old$state='RUNNING',fetched_at=null,import_id=null;$old$,$new$state='RUNNING',fetched_at=null,import_id=null,event_ids=excluded.event_ids;$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Rolling migration baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text);
 end loop; execute d;
end;
$migration$;

-- Preserve the verified current api.complete_live_quote_refresh(uuid,jsonb,integer) authority and grants.
do $migration$
declare d text; e record;
begin
 select pg_get_functiondef('api.complete_live_quote_refresh(uuid,jsonb,integer)'::regprocedure) into d;
 for e in select * from (values
 ($old$v_week.state not in ('PLANNED','OPEN') or v_now >= v_week.common_lock_at$old$,$new$(v_week.state not in ('PLANNED','OPEN') and not (private.is_rolling_week(v_week.id) and v_week.state in ('LOCKED','PROVISIONAL'))) or v_now >= private.week_entry_closes_at(v_week.id)$new$),
 ($old$  v_fetched := (p_import->>'fetchedAt')::timestamptz;$old$,$new$  if private.is_rolling_week(v_week.id) and (select jsonb_agg(e->>'externalEventId' order by e->>'externalEventId') from jsonb_array_elements(p_import->'events') e)
    is distinct from v_refresh.event_ids then raise exception 'QUOTE_REFRESH_EVENT_SET_CHANGED'; end if;
  v_fetched := (p_import->>'fetchedAt')::timestamptz;$new$),
 ($old$update private.live_quote_heads set verified_import_id=v_import_id where week_id=v_week.id;$old$,$new$update private.live_quote_heads h set verified_import_id=v_import_id where h.week_id=v_week.id
    and exists(select 1 from private.sports_events e join jsonb_array_elements(p_import->'events') j on j->>'externalEventId'=e.fixture_event_key where e.id=h.event_id);$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Rolling migration baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text);
 end loop; execute d;
end;
$migration$;

-- Preserve the verified current private.refresh_member_quote_heads(uuid,uuid,uuid,text) authority and grants.
do $migration$
declare d text; e record;
begin
 select pg_get_functiondef('private.refresh_member_quote_heads(uuid,uuid,uuid,text)'::regprocedure) into d;
 for e in select * from (values
 ($old$v_season.lifecycle not in ('DRAFT', 'REGULAR')$old$,$new$v_season.lifecycle not in ('DRAFT','ROSTER_LOCKED','REGULAR','PLAYOFFS','CHAMPION_FINAL','WEEK_18_EXHIBITION')$new$),
 ($old$if v_week.state not in ('PLANNED', 'OPEN') then$old$,$new$if v_week.state not in ('PLANNED', 'OPEN') and not (private.is_rolling_week(v_week.id) and v_week.state in ('LOCKED','PROVISIONAL')) then$new$),
 ($old$if v_now >= v_week.common_lock_at then$old$,$new$if v_now >= private.week_entry_closes_at(v_week.id) then$new$),
 ($old$where slate.week_id = v_week.id and slate.version = 1
  for update;$old$,$new$where slate.week_id = v_week.id
    and (not private.is_rolling_week(v_week.id) and slate.version=1
      or private.is_rolling_week(v_week.id) and exists(select 1 from private.slate_items i where i.slate_id=slate.id and private.is_effective_slate_item(i.id)))
  order by slate.version desc limit 1 for update;$new$),
 ($old$or v_slate_event_ids <> v_import_event_ids then$old$,$new$or (not private.is_rolling_week(v_week.id) and v_slate_event_ids <> v_import_event_ids)
    or (private.is_rolling_week(v_week.id) and not v_import_event_ids <@ v_slate_event_ids) then$new$),
 ($old$    for v_market_json in$old$,$new$    if private.is_rolling_week(v_week.id) and (v_event.state<>'SCHEDULED' or v_event.actual_started_at is not null or v_event.entry_cutoff_at<=v_now) then
      continue; -- A game closing during the provider fetch receives no fresh heads.
    end if;
    for v_market_json in$new$),
 ($old$if v_refreshed_count <> cardinality(v_slate_event_ids) * 6 or ($old$,$new$if not private.is_rolling_week(v_week.id) and (v_refreshed_count <> cardinality(v_slate_event_ids) * 6 or ($new$),
 ($old$) <> cardinality(v_slate_event_ids) * 6 then$old$,$new$) <> cardinality(v_slate_event_ids) * 6) then$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Rolling migration baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text);
 end loop; execute d;
end;
$migration$;

-- Preserve the verified current api.refresh_live_week_quotes(uuid,uuid,text) authority and grants.
do $migration$
declare d text; e record;
begin
 select pg_get_functiondef('api.refresh_live_week_quotes(uuid,uuid,text)'::regprocedure) into d;
 for e in select * from (values
 ($old$v_season.lifecycle not in ('DRAFT', 'REGULAR')$old$,$new$v_season.lifecycle not in ('DRAFT','ROSTER_LOCKED','REGULAR','PLAYOFFS','CHAMPION_FINAL','WEEK_18_EXHIBITION')$new$),
 ($old$if v_week.state not in ('PLANNED', 'OPEN') then$old$,$new$if v_week.state not in ('PLANNED', 'OPEN') and not (private.is_rolling_week(v_week.id) and v_week.state in ('LOCKED','PROVISIONAL')) then$new$),
 ($old$if v_now >= v_week.common_lock_at then$old$,$new$if v_now >= private.week_entry_closes_at(v_week.id) then$new$),
 ($old$where slate.week_id = v_week.id and slate.version = 1
  for update;$old$,$new$where slate.week_id = v_week.id
    and (not private.is_rolling_week(v_week.id) and slate.version=1
      or private.is_rolling_week(v_week.id) and exists(select 1 from private.slate_items i where i.slate_id=slate.id and private.is_effective_slate_item(i.id)))
  order by slate.version desc limit 1 for update;$new$),
 ($old$or v_slate_event_ids <> v_import_event_ids then$old$,$new$or (not private.is_rolling_week(v_week.id) and v_slate_event_ids <> v_import_event_ids)
    or (private.is_rolling_week(v_week.id) and not v_import_event_ids <@ v_slate_event_ids) then$new$),
 ($old$    for v_market_json in$old$,$new$    if private.is_rolling_week(v_week.id) and (v_event.state<>'SCHEDULED' or v_event.actual_started_at is not null or v_event.entry_cutoff_at<=v_now) then
      continue; -- A game closing during the provider fetch receives no fresh heads.
    end if;
    for v_market_json in$new$),
 ($old$if v_refreshed_count <> cardinality(v_slate_event_ids) * 6 or ($old$,$new$if not private.is_rolling_week(v_week.id) and (v_refreshed_count <> cardinality(v_slate_event_ids) * 6 or ($new$),
 ($old$) <> cardinality(v_slate_event_ids) * 6 then$old$,$new$) <> cardinality(v_slate_event_ids) * 6) then$new$)
 ) changes(old_text,new_text) loop
 if strpos(d,e.old_text)=0 then raise exception 'Rolling migration baseline changed: %',e.old_text; end if;
 d:=replace(d,e.old_text,e.new_text);
 end loop; execute d;
end;
$migration$;

do $migration$
declare d text;
begin
 select pg_get_functiondef('private.assert_live_card_quote_review(uuid,uuid,jsonb,timestamptz)'::regprocedure) into d;
 if strpos(d,'e.scheduled_start_at<=p_now')=0 then raise exception 'Rolling review event guard baseline changed'; end if;
 execute replace(d,'e.scheduled_start_at<=p_now',
  '(case when private.is_rolling_week(e.week_id) then e.entry_cutoff_at else e.scheduled_start_at end)<=p_now');
end;
$migration$;

-- Previously created, unopened V1.2 seasons may freeze their supported baseline
-- after activation. The OPEN-week trigger then pins V1.3 prospectively. This
-- never changes an old snapshot and does not require unsafe activation rewrites.
do $migration$
declare d text; old_text text;
begin
 select pg_get_functiondef('private.guard_frozen_ruleset()'::regprocedure) into d;
 old_text:=$old$if old.frozen_at is null and new.frozen_at is not null and not exists ($old$;
 if strpos(d,old_text)=0 then raise exception 'Rolling draft freeze baseline changed'; end if;
 execute replace(d,old_text,$new$if old.frozen_at is null and new.frozen_at is not null
  and not (new.ruleset_version='1.2' and new.product_bible_version='3.1'
    and new.ruleset_id=new.canonical_json->>'id' and new.mode=new.canonical_json->>'mode'
    and new.product_bible_id=new.canonical_json->>'productBibleId'
    and new.product_bible_version=new.canonical_json->>'productBibleVersion'
    and new.ruleset_version=new.canonical_json->>'version'
    and new.sha256_hash=encode(extensions.digest(private.canonical_ruleset_json(new.canonical_json),'sha256'),'hex')
    and new.sha256_hash=case new.mode
      when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
      when 'SIMULATION' then 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b' end)
  and not exists ($new$);
end;
$migration$;

-- Deterministic quote-source adapter for later Simulation returns. It accepts
-- no caller odds, stakes, actor, clock or game list. All submissions still use
-- the identical batch/receipt authority. No provider or email calls occur.
create function api.prepare_simulation_card_quotes(p_league_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=(select auth.uid()); l private.leagues%rowtype; s private.seasons%rowtype;
 w private.season_weeks%rowtype; m record; n timestamptz; h text; id_new uuid; changed integer:=0;
begin
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 if u is null or not private.is_league_member(l.id) then
   raise exception using errcode='42501',message='League membership required.'; end if;
 select * into strict s from private.seasons where league_id=l.id order by created_at desc limit 1 for update;
 if s.mode<>'SIMULATION' or s.lifecycle not in ('REGULAR','PLAYOFFS','CHAMPION_FINAL','WEEK_18_EXHIBITION') then
   raise exception using errcode='42501',message='An active Simulation season is required.'; end if;
 select * into strict w from private.season_weeks where season_id=s.id order by nfl_week desc limit 1 for update;
 if not private.is_rolling_week(w.id) then
   raise exception using errcode='55000',message='This week does not support incremental submissions.'; end if;
 n:=private.card_confirmation_time(s.id);
 if w.state not in ('OPEN','LOCKED','PROVISIONAL') or n<w.opens_at or n>=private.week_entry_closes_at(w.id) then
   raise exception using errcode='55000',message='The current card is not open.'; end if;
 -- Preserve the separate Week2 changed-quote lesson. The existing application
 -- invokes that lesson first; this adapter cannot satisfy its acceptance guard.
 for m in select q.*,i.slate_id from private.live_quote_heads head
   join private.market_snapshots q on q.id=head.market_snapshot_id
   join private.sports_events e on e.id=q.event_id
   join private.slate_items i on i.market_snapshot_id=q.id and i.week_id=w.id and private.is_effective_slate_item(i.id)
   where q.week_id=w.id and e.state='SCHEDULED' and e.actual_started_at is null and e.entry_cutoff_at>n
     and q.observed_at<n-interval '60 seconds'
   order by e.id,q.market_type,q.outcome_key
 loop
   h:=encode(extensions.digest('rolling-simulation:'||m.event_id::text||':'||m.market_type||':'||m.outcome_key||':'||
     coalesce(m.line_milli::text,'null')||':'||m.american_odds::text||':'||n::text,'sha256'),'hex');
   select id into id_new from private.market_snapshots where event_id=m.event_id and payload_hash=h;
   if id_new is null then
     insert into private.market_snapshots(event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,
       line_milli,american_odds,quality_status,observed_at,payload_hash)
     values(m.event_id,w.id,l.id,m.book_key,m.market_type,m.outcome_key,m.proposition,m.line_milli,m.american_odds,m.quality_status,n,h)
     returning id into id_new;
   end if;
   insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
     values(m.slate_id,m.event_id,id_new,w.id,l.id) on conflict(slate_id,market_snapshot_id) do nothing;
   update private.live_quote_heads set market_snapshot_id=id_new,updated_at=clock_timestamp()
     where event_id=m.event_id and market_type=m.market_type and outcome_key=m.outcome_key;
   changed:=changed+1;
 end loop;
 return jsonb_build_object('changed',changed>0,'quotes',api.get_live_quote_heads(p_league_slug));
end; $$;
revoke all on function api.prepare_simulation_card_quotes(text) from public,anon;
grant execute on function api.prepare_simulation_card_quotes(text) to authenticated;

do $migration$
declare d text; old_text text;
begin
 select pg_get_functiondef('api.get_live_quote_heads(text)'::regprocedure) into d;
 old_text:=$old$if v_season.mode <> 'LIVE' and not exists ($old$;
 if strpos(d,old_text)=0 then raise exception 'Simulation quote read baseline changed'; end if;
 execute replace(d,old_text,$new$if v_season.mode <> 'LIVE' and not exists (
   select 1 from private.season_weeks w where w.season_id=v_season.id and private.is_rolling_week(w.id)
   and w.nfl_week=(select max(latest.nfl_week) from private.season_weeks latest where latest.season_id=v_season.id)
 ) and not exists ($new$);
end;
$migration$;

-- Retry evidence is still sensitive after a membership or owner-entitlement
-- revocation. Authorize the actor before returning even a previous command,
-- while preserving valid retry after the week or season has finished.
do $migration$
declare d text; v_auth_block text; first_at integer; last_at integer;
begin
 select pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure) into d;
 first_at:=strpos(d,'  select league.* into strict v_league');
 last_at:=strpos(d,'  select season.* into strict v_season');
 if first_at=0 or last_at<=first_at or strpos(d,'  perform pg_advisory_xact_lock(')=0 then
   raise exception 'Rolling replay authorization baseline changed'; end if;
 v_auth_block:=substr(d,first_at,last_at-first_at);
 d:=replace(d,v_auth_block,'');
 d:=replace(d,'  perform pg_advisory_xact_lock(',v_auth_block||'  perform pg_advisory_xact_lock(');
 execute d;
end;
$migration$;

-- First roster opening updates the week before freezing its draft season
-- baseline. Validate that exact unfrozen V1.2 package without pretending it is
-- already frozen; the ordinary roster transaction performs the freeze itself.
do $migration$
declare d text; old_text text;
begin
 select pg_get_functiondef('private.pin_week_rules()'::regprocedure) into d;
 old_text:='  perform private.season_card_rules(v_previous.id,v_season.mode);';
 if strpos(d,old_text)=0 then raise exception 'Rolling initial week support baseline changed'; end if;
 execute replace(d,old_text,$new$  if v_previous.frozen_at is null then
    if not coalesce(v_previous.ruleset_version='1.2' and v_previous.product_bible_version='3.1'
      and v_previous.mode=v_season.mode and v_previous.mode=v_previous.canonical_json->>'mode'
      and v_previous.ruleset_id=v_previous.canonical_json->>'id'
      and v_previous.ruleset_version=v_previous.canonical_json->>'version'
      and v_previous.product_bible_id=v_previous.canonical_json->>'productBibleId'
      and v_previous.product_bible_version=v_previous.canonical_json->>'productBibleVersion'
      and v_previous.sha256_hash=encode(extensions.digest(private.canonical_ruleset_json(v_previous.canonical_json),'sha256'),'hex')
      and v_previous.sha256_hash=case v_season.mode
        when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
        else 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b' end,false)
    then raise exception using errcode='22023',message='UNSUPPORTED_WEEK_RULE_UPGRADE'; end if;
  else
    perform private.season_card_rules(v_previous.id,v_season.mode);
  end if;$new$);
end;
$migration$;

-- A partial event set is allowed only because closed games are omitted. Each
-- remaining imported game must still refresh all six main-market outcomes;
-- completeness is checked both at immutable import validation and here.
do $migration$
declare d text; signature text; old_text text;
begin
 foreach signature in array array['private.refresh_member_quote_heads(uuid,uuid,uuid,text)','api.refresh_live_week_quotes(uuid,uuid,text)'] loop
 select pg_get_functiondef(signature::regprocedure) into d;
 old_text:='  v_response := jsonb_build_object(';
 if strpos(d,old_text)=0 then raise exception 'Rolling quote completeness baseline changed'; end if;
 execute replace(d,old_text,$new$  if private.is_rolling_week(v_week.id) and (
    v_refreshed_count <> 6*(select count(*) from private.sports_events e
      where e.week_id=v_week.id and e.fixture_event_key=any(v_import_event_ids)
        and e.state='SCHEDULED' and e.actual_started_at is null and e.entry_cutoff_at>v_now)
    or exists(select 1 from private.sports_events e
      where e.week_id=v_week.id and e.fixture_event_key=any(v_import_event_ids)
        and e.state='SCHEDULED' and e.actual_started_at is null and e.entry_cutoff_at>v_now
        and (select count(*) from private.live_quote_heads h where h.event_id=e.id)<>6)
  ) then raise exception using errcode='22023',message='The refreshed quote set is incomplete.'; end if;
  v_response := jsonb_build_object($new$);
 end loop;
end;
$migration$;
