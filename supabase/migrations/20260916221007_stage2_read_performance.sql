-- Evaluate time-dependent pending eligibility once within this read. No cache,
-- volatility, publication guard, public signature or privilege change.
CREATE OR REPLACE FUNCTION private.get_player_prop_menu_before_automation(p_league_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare answer jsonb;wk uuid;slots jsonb;
begin
 answer:=private.get_player_prop_menu_before_progressive(p_league_slug);wk:=(answer->>'weekId')::uuid;
 with pending as materialized (
  select event_id, team, slot from private.player_catalog_pending_slots(wk)
 )
 select coalesce(jsonb_agg(original.slot||jsonb_build_object(
 'publicationMode',case when audit.subject_id is not null then 'AUTOMATIC' when original.slot->>'subjectId' is not null and (original.slot->>'confirmed')::boolean then 'COMMISSIONER' else null end,
 'publishedAt',case when audit.subject_id is not null then to_jsonb(audit.published_at) when original.slot->>'subjectId' is not null then to_jsonb(menu.frozen_at) else 'null'::jsonb end,
 'lateFillEligible',pending.event_id is not null) order by ord),'[]') into slots
 from jsonb_array_elements(answer->'slots') with ordinality original(slot,ord)
 join private.week_player_menu menu on menu.week_id=wk and menu.event_id=(original.slot->>'eventId')::uuid and menu.team=original.slot->>'team' and menu.slot=original.slot->>'slot'
 left join pending on pending.event_id=menu.event_id and pending.team=menu.team and pending.slot=menu.slot
 left join private.player_prop_slot_publications audit on audit.event_id=menu.event_id and audit.team=menu.team and audit.slot=menu.slot;
 return answer||jsonb_build_object('frozen',((answer->>'frozen')::boolean or exists(select 1 from private.player_prop_progressive_activations where week_id=wk)),'progressiveActivated',exists(select 1 from private.player_prop_progressive_activations where week_id=wk),'progressiveAvailability',exists(select 1 from private.player_prop_progressive_authorizations where week_id=wk),'canOpen',case when exists(select 1 from private.player_prop_progressive_authorizations where week_id=wk) then coalesce((answer->>'canOpen')::boolean,false) and private.progressive_initial_menu_ready(wk) else coalesce((answer->>'canOpen')::boolean,false) end,'slots',slots);
end; $function$;

-- Review preflight needs only the caller's allocation/count and bound rules.
-- Final quote review, acquisition, cutoff and acceptance authorities are unchanged.
create function api.get_card_review_context(p_league_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 u uuid := (select auth.uid()); l private.leagues%rowtype;
 s private.seasons%rowtype; w private.season_weeks%rowtype;
 e private.season_entries%rowtype; c private.weekly_cards%rowtype;
 allocated bigint; positions bigint;
begin
 if u is null then
  raise exception using errcode='28000',message='Authentication required.';
 end if;
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 if not private.is_league_member(l.id) then
  raise exception using errcode='42501',message='League membership required.';
 end if;
 select * into strict s from private.seasons where league_id=l.id order by created_at desc limit 1;
 select * into strict e from private.season_entries where season_id=s.id and user_id=u;
 select * into w from private.season_weeks where season_id=s.id order by nfl_week desc limit 1;
 select * into c from private.weekly_cards where week_id=w.id and entry_id=e.id;
 select coalesce(sum(r.stake_credits),0),count(*) into allocated,positions
 from private.effective_position_receipts r where r.card_id=c.id;
 return jsonb_build_object(
  'league',jsonb_build_object('id',l.id,'mode',s.mode),
  'season',jsonb_build_object('rulesetSnapshot',(
   select jsonb_build_object('rulesetId',r.ruleset_id,'rulesetVersion',r.ruleset_version,
    'productBibleId',r.product_bible_id,'productBibleVersion',r.product_bible_version,
    'mode',r.mode,'canonicalJson',r.canonical_json,'sha256Hash',r.sha256_hash,
    'publishedAt',r.published_at,'frozenAt',r.frozen_at)
   from private.season_ruleset_snapshots r where r.id=coalesce(w.ruleset_snapshot_id,s.ruleset_snapshot_id))),
  'week',case when w.id is null then null else jsonb_build_object(
   'state',w.state,'entryClosed',case when private.is_rolling_week(w.id)
    then private.rolling_week_entries_closed(w.id) else false end) end,
  'ownerCard',case when c.id is null then null else jsonb_build_object(
   'remainingCredits',1000-allocated,'allocatedCredits',allocated,'positionCount',positions) end);
end $$;
revoke all on function api.get_card_review_context(text) from public,anon,service_role;
grant execute on function api.get_card_review_context(text) to authenticated;
