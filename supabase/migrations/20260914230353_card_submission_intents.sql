-- Explicit submission intent is durable consent; quote reviews are replaceable
-- evidence. Existing commands and receipt serializers retain their exact hashes.
create table private.card_submission_intents (
  id uuid primary key,
  actor_user_id uuid not null references private.profiles(id),
  league_id uuid not null references private.leagues(id),
  week_id uuid not null references private.season_weeks(id),
  card_id uuid not null references private.weekly_cards(id),
  economic_terms jsonb not null,
  intent_hash text not null check (intent_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index card_submission_intents_actor_card_idx on private.card_submission_intents(actor_user_id,card_id);
create index card_submission_intents_week_idx on private.card_submission_intents(week_id);
create index card_submission_intents_league_idx on private.card_submission_intents(league_id);
alter table private.card_submission_intents enable row level security;
revoke all on private.card_submission_intents from public,anon,authenticated;

create function private.submission_economic_terms(p_actor uuid,p_league uuid,p_positions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
    'rulesetSnapshotId',w.ruleset_snapshot_id,'rulesetHash',r.sha256_hash,
    'eventId',q.event_id,'marketType',q.market_type,'subjectId',q.subject_id,
    'subjectLabel',q.subject_label,'subjectTeam',q.subject_team,
    'statistic',q.statistic,'period',q.period,'outcomeKey',q.outcome_key,
    'lineMilli',q.line_milli,'americanOdds',q.american_odds,'bookKey',q.book_key,
    'stakeCredits',(i.value->>'stakeCredits')::integer)
    order by q.event_id,q.market_type,q.subject_id nulls first,q.outcome_key,(i.value->>'stakeCredits')::integer)
  into matched,weeks,terms
  from jsonb_array_elements(p_positions) i(value)
  join private.market_snapshots q on q.id=(i.value->>'marketSnapshotId')::uuid
    and q.payload_hash=i.value->>'payloadHash' and q.league_id=p_league
  join private.season_weeks w on w.id=q.week_id
  join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id
  join private.weekly_cards c on c.week_id=w.id and c.owner_user_id=p_actor;
  if matched<>jsonb_array_length(p_positions) or weeks<>1 then
    raise exception using errcode='22023',message='Every submission quote must belong to your same-week card.';
  end if;
  return terms;
end;
$$;

create function private.authorize_submission_intent(p_actor uuid,p_league uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null or not exists(select 1 from private.league_memberships where league_id=p_league and user_id=p_actor) then
    raise exception using errcode='42501',message='League membership required.';
  end if;
  if exists(select 1 from private.owner_rehearsals where league_id=p_league) and not exists(
    select 1 from private.owner_rehearsals h where h.league_id=p_league and h.status='ACTIVE'
      and ((h.owner_user_id=p_actor and private.owner_rehearsal_entitled(p_actor))
        or exists(select 1 from private.owner_rehearsal_bots b where b.rehearsal_id=h.id and b.bot_user_id=p_actor))) then
    raise exception using errcode='42501',message='Owner rehearsal not found.';
  end if;
end;
$$;

create function api.bind_card_submission_intent(p_league_slug text,p_intent_id uuid,p_positions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); league uuid; terms jsonb; saved private.card_submission_intents%rowtype;
  digest text; response jsonb; mode text;
begin
  select id into league from private.leagues where slug=lower(p_league_slug);
  perform private.authorize_submission_intent(actor,league);
  if p_intent_id is null then raise exception 'Submission identity required.'; end if;
  -- Same lock precedes shared acceptance. No provider work occurs here.
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':intent:'||p_intent_id::text,0));
  terms:=private.submission_economic_terms(actor,league,p_positions);
  digest:=encode(extensions.digest(terms::text,'sha256'),'hex');
  select * into saved from private.card_submission_intents where id=p_intent_id;
  if found then
    if saved.actor_user_id<>actor or saved.league_id<>league or saved.intent_hash<>digest then
      raise exception using errcode='22000',message='Idempotency key was reused with a different request.';
    end if;
  else
    insert into private.card_submission_intents(id,actor_user_id,league_id,week_id,card_id,economic_terms,intent_hash)
    values(p_intent_id,actor,league,(terms->0->>'weekId')::uuid,(terms->0->>'cardId')::uuid,terms,digest);
  end if;
  select response_json into response from private.command_receipts
    where actor_user_id=actor and command_name='ACCEPT_STAGE1_CARD'
      and idempotency_key='intent:'||p_intent_id::text and request_hash=digest;
  select s.mode into mode from private.seasons s join private.season_weeks w on w.season_id=s.id
    where w.id=(terms->0->>'weekId')::uuid;
  return jsonb_build_object('intentId',p_intent_id,'leagueId',league,'mode',mode,
    'operationKey','intent:'||p_intent_id::text,'committed',response is not null,'result',response);
end;
$$;

create function private.assert_card_submission_intent(p_actor uuid,p_league uuid,p_positions jsonb,p_key text)
returns text language plpgsql security definer set search_path='' as $$
declare saved private.card_submission_intents%rowtype; terms jsonb; digest text;
begin
  perform private.authorize_submission_intent(p_actor,p_league);
  select * into saved from private.card_submission_intents where id=(p_positions->0->>'intentId')::uuid;
  if saved.id is null or saved.actor_user_id<>p_actor or saved.league_id<>p_league
    or p_key<>'intent:'||saved.id::text then
    raise exception using errcode='42501',message='Submission intent unavailable.';
  end if;
  terms:=private.submission_economic_terms(p_actor,p_league,p_positions);
  digest:=encode(extensions.digest(terms::text,'sha256'),'hex');
  if digest<>saved.intent_hash then
    raise exception using errcode='22000',message='Confirmed terms changed. A new explicit confirmation is required.';
  end if;
  return digest;
end;
$$;

create function api.revalidate_card_submission_intent(p_intent_id uuid,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved private.card_submission_intents%rowtype;
  review private.live_card_quote_reviews%rowtype; terms jsonb; positions jsonb; changes jsonb;
begin
  select * into saved from private.card_submission_intents where id=p_intent_id and actor_user_id=actor;
  if saved.id is null then raise exception using errcode='42501',message='Submission intent unavailable.'; end if;
  perform private.authorize_submission_intent(actor,saved.league_id);
  select * into review from private.live_card_quote_reviews where id=p_review_id and card_id=saved.card_id and actor_user_id=actor;
  if review.id is null or review.expires_at<=clock_timestamp() then raise exception 'QUOTE_REVIEW_EXPIRED'; end if;
  terms:=private.submission_economic_terms(actor,saved.league_id,review.positions);
  if terms=saved.economic_terms then
    select jsonb_agg(value || case when ordinality=1 then jsonb_build_object('intentId',p_intent_id,'reviewId',p_review_id) else '{}'::jsonb end order by ordinality)
      into positions from jsonb_array_elements(review.positions) with ordinality i(value,ordinality);
    return jsonb_build_object('status','UNCHANGED','positions',positions);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'selectionKey',(old->>'eventId')||':'||(old->>'marketType')||':'||coalesce(old->>'subjectId','game'),
    'label',coalesce(old->>'subjectLabel',old->>'marketType'),
    'before',jsonb_build_object('lineMilli',old->'lineMilli','americanOdds',old->'americanOdds'),
    'after',case when fresh is null then null else jsonb_build_object('lineMilli',fresh->'lineMilli','americanOdds',fresh->'americanOdds') end
  )),'[]'::jsonb) into changes
  from jsonb_array_elements(saved.economic_terms) old
  left join lateral (select value as fresh from jsonb_array_elements(terms) where
    value->>'eventId'=old->>'eventId' and value->>'marketType'=old->>'marketType'
    and value->>'subjectId' is not distinct from old->>'subjectId'
    and value->>'statistic' is not distinct from old->>'statistic'
    and value->>'period' is not distinct from old->>'period'
    and value->>'outcomeKey'=old->>'outcomeKey') n on true
  where old is distinct from fresh;
  return jsonb_build_object('status','CHANGED','changes',changes);
end;
$$;

do $patch$
declare definition text; old text;
begin
  select pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure) into definition;
  old:=$old$  v_request_hash := encode(
    extensions.digest(lower(p_league_slug) || ':' || p_positions::text, 'sha256'),
    'hex'
  );$old$;
  if strpos(definition,old)=0 then raise exception 'Submission fingerprint baseline changed'; end if;
  definition:=replace(definition,old,$new$  if p_positions->0->>'intentId' is not null then
    v_request_hash:=private.assert_card_submission_intent(v_user_id,v_league.id,p_positions,p_idempotency_key);
  else
    v_request_hash := encode(extensions.digest(lower(p_league_slug)||':'||p_positions::text,'sha256'),'hex');
  end if;$new$);
  execute definition;
  select pg_get_functiondef('private.assert_live_card_quote_review(uuid,uuid,jsonb,timestamptz)'::regprocedure) into definition;
  if strpos(definition,$needle$value-'reviewId'$needle$)=0 then raise exception 'Review proof baseline changed'; end if;
  definition:=replace(definition,$needle$value-'reviewId'$needle$,$replacement$value-'reviewId'-'intentId'$replacement$);
  execute definition;
end;
$patch$;

revoke all on function private.submission_economic_terms(uuid,uuid,jsonb), private.authorize_submission_intent(uuid,uuid),
  private.assert_card_submission_intent(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function api.bind_card_submission_intent(text,uuid,jsonb),api.revalidate_card_submission_intent(uuid,uuid) from public,anon;
grant execute on function api.bind_card_submission_intent(text,uuid,jsonb),api.revalidate_card_submission_intent(uuid,uuid) to authenticated;
