/**
 * Deterministic setup for the disposable native PostgreSQL/Auth lanes.
 * Callers must validate loopback before executing this SQL. It does not submit
 * cards or grade receipts: those actions use the real member/service RPCs.
 */
export const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;

export function playerPropsLeagueSql({ slug, userIds, games }) {
  if (![14, 16].includes(games) || userIds.length !== 4)
    throw new Error(
      "Player-props acceptance requires four members and 14/16 games.",
    );
  const pack = `props-acceptance-${slug}`;
  return `begin;
create temporary table props_catalog_before on commit drop as select * from private.authoritative_season_rulesets;
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
-- Expand the immutable canonical fixture into a separate disposable pack. All
-- event times/results remain deterministic, with unique game and team identities.
with original as (select manifest_json from private.simulation_fixture_manifests where pack_id='sunday-ledger-authoritative-2026-v1'),
 expanded as (
 select jsonb_set(jsonb_set(manifest_json,'{packId}',to_jsonb(${quoteSql(pack)}::text)),'{weeks,0,events}',(
  select jsonb_agg(jsonb_set(jsonb_set(jsonb_set(
    manifest_json->'weeks'->0->'events'->((n-1)%8),
    '{externalEventId}',to_jsonb(${quoteSql(pack)}::text||'-game-'||n::text)),
    '{awayTeam}',to_jsonb((manifest_json->'weeks'->0->'events'->((n-1)%8)->>'awayTeam')||case when n>8 then ' North' else '' end)),
    '{homeTeam}',to_jsonb((manifest_json->'weeks'->0->'events'->((n-1)%8)->>'homeTeam')||case when n>8 then ' South' else '' end)) order by n)
  from generate_series(1,${games}) n)) as payload from original
)
insert into private.simulation_fixture_manifests(pack_id,pack_version,seed,week_count,manifest_hash,manifest_json)
 select ${quoteSql(pack)},1,payload->>'seed',18,encode(extensions.digest(payload::text,'sha256'),'hex'),payload from expanded;
do $fixture$
declare league_uuid uuid; season_uuid uuid; token text; member_uuid uuid;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',${quoteSql(userIds[0])},'role','authenticated')::text,true);
 select league_id,season_id into league_uuid,season_uuid from api.create_league('Player props acceptance',${quoteSql(slug)},'SIMULATION',2026);
 token:=api.create_league_invite(league_uuid,now()+interval '1 day',4);
 foreach member_uuid in array array[${userIds
   .slice(1)
   .map((id) => `${quoteSql(id)}::uuid`)
   .join(",")}] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_uuid,'role','authenticated')::text,true);
  perform api.join_league(token);
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',${quoteSql(userIds[0])},'role','authenticated')::text,true);
 update private.seasons set simulated_now='2026-09-13 16:00Z' where id=season_uuid and mode='SIMULATION';
 insert into private.player_prop_leagues(league_id,enabled,rules_enabled,season_id,first_enabled_week,activated_at,release_sha,approval_reference)
 values(league_uuid,true,true,season_uuid,1,clock_timestamp(),repeat('0',40),'Disposable acceptance fixture');
 perform api.publish_simulation_fixture_week(league_uuid,1,${quoteSql(pack)},'props-publish-'||${quoteSql(slug)});
 perform api.lock_live_roster_and_open_week(league_uuid,'props-roster-'||${quoteSql(slug)});
end;
$fixture$;
update private.authoritative_season_rulesets a set ruleset_version=b.ruleset_version,product_bible_version=b.product_bible_version,
 canonical_json=b.canonical_json,sha256_hash=b.sha256_hash from props_catalog_before b where b.mode=a.mode;
update private.player_prop_controls set offers_enabled=true;
commit;`;
}

/** Existing immutable snapshots are fixture source observations, not client odds. */
/** @param {{ weekId: string, omitSubjectId?: string | null }} input */
export function playerPropsQuoteSql({ weekId, omitSubjectId = null }) {
  return `do $quotes$
declare slot record; outcome text; snapshot_id uuid; observed timestamptz; payload text; fixture_slate_id uuid;
begin
 select private.card_confirmation_time(w.season_id),s.id into observed,fixture_slate_id
 from private.season_weeks w join private.slates s on s.week_id=w.id
 where w.id=${quoteSql(weekId)}::uuid order by s.version desc limit 1;
 for slot in select m.*,p.display_name,p.position from private.week_player_menu m join private.player_subjects p on p.id=m.subject_id
 where m.week_id=${quoteSql(weekId)}::uuid and m.confirmed_at is not null
 ${omitSubjectId ? `and m.subject_id<>${quoteSql(omitSubjectId)}::uuid` : ""}
 order by m.event_id,m.subject_id loop
  foreach outcome in array array['OVER','UNDER'] loop
   payload:=encode(extensions.digest('props-acceptance:'||slot.event_id::text||':'||slot.subject_id::text||':'||outcome||':'||observed::text,'sha256'),'hex');
   select id into snapshot_id from private.market_snapshots where event_id=slot.event_id and payload_hash=payload;
   if snapshot_id is null then
    insert into private.market_snapshots(event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,
      line_milli,american_odds,quality_status,observed_at,payload_hash,subject_id,subject_label,subject_team,subject_position,statistic,period)
    select slot.event_id,slot.week_id,w.league_id,'draftkings','PLAYER_'||slot.statistic,outcome,
      slot.display_name||' '||outcome||' 50.5',50500,-110,'HEALTHY',observed,payload,
      slot.subject_id,slot.display_name,slot.team,slot.position,slot.statistic,'FULL_GAME'
    from private.season_weeks w where w.id=slot.week_id returning id into snapshot_id;
   end if;
   insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
    select fixture_slate_id,slot.event_id,snapshot_id,slot.week_id,w.league_id from private.season_weeks w where w.id=slot.week_id
    on conflict(slate_id,market_snapshot_id) do nothing;
   insert into private.live_quote_heads(event_id,week_id,league_id,market_type,outcome_key,market_snapshot_id,subject_id,statistic,period)
    select slot.event_id,slot.week_id,w.league_id,'PLAYER_'||slot.statistic,outcome,snapshot_id,slot.subject_id,slot.statistic,'FULL_GAME'
    from private.season_weeks w where w.id=slot.week_id
    on conflict(event_id,subject_id,statistic,period,outcome_key) where subject_id is not null
    do update set market_snapshot_id=excluded.market_snapshot_id,updated_at=clock_timestamp();
  end loop;
 end loop;
end;
$quotes$;`;
}
