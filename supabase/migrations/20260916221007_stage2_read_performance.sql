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
