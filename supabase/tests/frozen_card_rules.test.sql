begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select function_privs_are('private','season_card_rules',array['uuid','text'],'anon',array[]::text[],'anonymous cannot read the private card rule helper');
select function_privs_are('private','season_card_rules',array['uuid','text'],'authenticated',array[]::text[],'members cannot invoke the private helper');
select function_privs_are('private','accept_authoritative_card_for_actor',array['uuid','text','jsonb','text'],'authenticated',array[]::text[],'actor-parameter acceptance remains private');

-- Disposable pgTAP fixtures only. No hosted data or existing season is changed.
create function pg_temp.rules_fixture(p_version text)
returns text language plpgsql as $$
declare v_owner uuid:=gen_random_uuid(); v_slug text; v_snapshot uuid; v_json jsonb;
begin
  insert into auth.users(id,email) values(v_owner,v_owner::text||'@rules.acceptance.test');
  insert into private.profiles(id,display_name) values(v_owner,'Rules Fixture');
  insert into private.owner_rehearsal_entitlements(user_id,note) values(v_owner,'Disposable rules compatibility fixture');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
  perform api.start_owner_rehearsal('rules-start-'||p_version);
  perform api.fill_owner_rehearsal_bots('rules-fill-'||p_version);
  perform api.advance_owner_rehearsal('FORMATION_READY','rules-open-'||p_version);
  select l.slug,s.ruleset_snapshot_id into v_slug,v_snapshot from private.owner_rehearsals r
    join private.leagues l on l.id=r.league_id join private.seasons s on s.id=r.season_id
    where r.owner_user_id=v_owner and r.status='ACTIVE';
  select canonical_json into v_json from private.season_ruleset_snapshots where id=v_snapshot;
  if p_version<>'1.2' then
    v_json:=jsonb_set(jsonb_set(jsonb_set(v_json,'{version}',to_jsonb(p_version)),'{productBibleVersion}','"3.0"'),
      '{standings,tiebreakOrder}','["MATCHUP_WIN_PERCENTAGE","POINTS_FOR","ALL_PLAY_PERCENTAGE","BALANCED_HEAD_TO_HEAD","FEWER_ATTENDANCE_MISSES","HIGHEST_SINGLE_WEEK_SCORE","STORED_DETERMINISTIC_RANDOM"]');
  end if;
  if p_version='1.0' then
    v_json:=jsonb_set(v_json,'{card}',(v_json->'card')-'carryoverCredits'-'acceptanceUnit'-'irreversibleAction');
    v_json:=jsonb_set(v_json,'{concentration}',(v_json->'concentration')-'status');
  end if;
  -- Establish historical/malformed fixture bytes before testing the actual
  -- writer guards; user triggers are re-enabled before every assertion; FK/RLS stay enabled.
  alter table private.season_ruleset_snapshots disable trigger user;
  alter table private.market_snapshots disable trigger user;
  update private.season_ruleset_snapshots set canonical_json=v_json,
    ruleset_version=p_version,product_bible_version=v_json->>'productBibleVersion',
    sha256_hash=encode(extensions.digest(v_json::text,'sha256'),'hex')
    where id=v_snapshot;
  update private.market_snapshots m set american_odds=-200
    from private.season_weeks w join private.seasons s on s.id=w.season_id
    where m.week_id=w.id and s.ruleset_snapshot_id=v_snapshot;
  alter table private.season_ruleset_snapshots enable trigger user;
  alter table private.market_snapshots enable trigger user;
  return v_slug;
end;
$$;

-- Each trial executes real acceptance and inspects its actual receipt set,
-- then rolls back that trial so another vector can reuse the exact fixture.
create function pg_temp.try_card(p_slug text,p_stakes jsonb,p_odds integer default -200)
returns jsonb language plpgsql as $$
declare v_positions jsonb; v_out jsonb; v_state jsonb; v_snapshot uuid;
begin
  v_state:=api.get_stage1_state(p_slug);
  v_snapshot:=(v_state#>>'{season,rulesetSnapshotId}')::uuid;
  alter table private.season_ruleset_snapshots disable trigger user;
  alter table private.market_snapshots disable trigger user;
  update private.market_snapshots set american_odds=p_odds
    where id=(select m.id from private.market_snapshots m join private.slate_items si on si.market_snapshot_id=m.id
      where si.week_id=(v_state#>>'{week,id}')::uuid and private.is_effective_slate_item(si.id)
      order by m.event_id,m.market_type,m.id limit 1);
  alter table private.season_ruleset_snapshots enable trigger user;
  alter table private.market_snapshots enable trigger user;
  select jsonb_agg(jsonb_build_object('marketSnapshotId',m.id,'payloadHash',m.payload_hash,'stakeCredits',stake.value) order by stake.ordinality)
    into v_positions from (
      select row_number() over(order by event_id,market_type,id) rn,* from (
        select distinct on(m.event_id,m.market_type) m.* from private.market_snapshots m
        join private.slate_items si on si.market_snapshot_id=m.id
        where si.week_id=(v_state#>>'{week,id}')::uuid and private.is_effective_slate_item(si.id)
        order by m.event_id,m.market_type,m.id
      ) selected
    ) m join jsonb_array_elements(p_stakes) with ordinality stake(value,ordinality) on stake.ordinality=m.rn;
  begin
    v_out:=api.accept_stage1_card(p_slug,v_positions,'rules-trial-'||gen_random_uuid()::text);
    v_out:=jsonb_build_object('accepted',true,'count',jsonb_array_length(v_out->'receipts'),
      'linked',not exists(select 1 from private.position_receipts where card_id=(v_state#>>'{ownerCard,id}')::uuid and ruleset_snapshot_id<>v_snapshot),
      'snapshotUnchanged',(api.get_stage1_state(p_slug)#>'{season,rulesetSnapshot}')=(v_state#>'{season,rulesetSnapshot}'));
    raise exception using errcode='ZX001',message=v_out::text;
  exception when sqlstate 'ZX001' then return sqlerrm::jsonb;
    when others then return jsonb_build_object('accepted',false,'error',sqlerrm);
  end;
end;
$$;

create function pg_temp.verify_version(p_version text)
returns setof text language plpgsql as $$
declare v_slug text; v_state jsonb; v_trial jsonb; v_snapshot uuid; v_original jsonb; v_mode text; v_change jsonb;
begin
  v_slug:=pg_temp.rules_fixture(p_version);
  v_state:=api.get_stage1_state(v_slug);
  v_snapshot:=(v_state#>>'{season,rulesetSnapshotId}')::uuid;
  v_original:=v_state#>'{season,rulesetSnapshot,canonicalJson}';
  return next is(v_state#>>'{season,rulesetSnapshot,rulesetVersion}',p_version,'the card read model carries its V'||p_version||' snapshot');
  return next is(private.season_card_rules(v_snapshot,'SIMULATION')->'card',v_original->'card','V'||p_version||' uses stored card fields');

  v_trial:=pg_temp.try_card(v_slug,'[1000]');
  return next is(v_trial->>'accepted','true','V'||p_version||' accepts 1000 at -200');
  return next is(v_trial->>'linked','true','V'||p_version||' receipts reference the original snapshot');
  return next is(v_trial->>'snapshotUnchanged','true','V'||p_version||' acceptance preserves the snapshot');
  return next is(pg_temp.try_card(v_slug,'[1000]',-201)->>'accepted','false','V'||p_version||' blocks all-in below -200');
  return next is(pg_temp.try_card(v_slug,'[750,250]',-201)->>'accepted','true','V'||p_version||' accepts the 750 favorite boundary');
  return next is(pg_temp.try_card(v_slug,'[751,249]',-201)->>'accepted','false','V'||p_version||' rejects 751 on a heavy favorite');
  return next is(pg_temp.try_card(v_slug,'[49,951]')->>'accepted','false','V'||p_version||' rejects a stake below 50');
  return next is(pg_temp.try_card(v_slug,'[500.5,499.5]')->>'accepted','false','V'||p_version||' rejects fractional stakes atomically');
  return next is(pg_temp.try_card(v_slug,'["500","500"]')->>'accepted','false','V'||p_version||' rejects numeric-string stakes');
  return next is(pg_temp.try_card(v_slug,'[999]')->>'accepted','false','V'||p_version||' requires exact allocation');
  return next is(pg_temp.try_card(v_slug,(select jsonb_agg(50) from generate_series(1,20)))->>'accepted','true','V'||p_version||' accepts 20 minimum-stake picks');
  return next is(pg_temp.try_card(v_slug,(select jsonb_agg(50) from generate_series(1,21)))->>'accepted','false','V'||p_version||' rejects a 21st pick');
  return next is(pg_temp.try_card(v_slug,'[1000]',10000)->>'accepted','true','V'||p_version||' has no blanket odds band');
  return next is((api.get_stage1_state(v_slug)#>'{ownerCard,positions}'),'[]'::jsonb,'trial writes are rolled back');

  for v_change in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(v_original,'{card,minimumStakeCredits}','"50"'),
    jsonb_set(v_original,'{card,weeklyAllocationCredits}','2000'),
    jsonb_set(v_original,'{card,newConstraint}','true'),
    jsonb_set(v_original,'{concentration,heavyFavoriteThresholdAmerican}','-201'),
    jsonb_set(v_original,'{markets,eligible}','["TOTAL","TOTAL","TOTAL"]')
  )) loop
    alter table private.season_ruleset_snapshots disable trigger user;
  alter table private.market_snapshots disable trigger user;
    update private.season_ruleset_snapshots set canonical_json=v_change where id=v_snapshot;
    alter table private.season_ruleset_snapshots enable trigger user;
  alter table private.market_snapshots enable trigger user;
    return next is(pg_temp.try_card(v_slug,'[1000]')->>'error','UNSUPPORTED_SEASON_CARD_RULES','malformed/changed V'||p_version||' rules block acceptance');
    return next is(api.get_stage1_state(v_slug)#>'{ownerCard,positions}','[]'::jsonb,'unsupported rules retain authorized card reads');
  end loop;
  alter table private.season_ruleset_snapshots disable trigger user;
  alter table private.market_snapshots disable trigger user;
  update private.season_ruleset_snapshots set ruleset_version='9.0',
    canonical_json=jsonb_set(v_original,'{version}','"9.0"') where id=v_snapshot;
  alter table private.season_ruleset_snapshots enable trigger user;
  alter table private.market_snapshots enable trigger user;
  return next is(pg_temp.try_card(v_slug,'[1000]')->>'error','UNSUPPORTED_SEASON_CARD_RULES','unknown version never defaults to current rules');
  alter table private.season_ruleset_snapshots disable trigger user;
  alter table private.market_snapshots disable trigger user;
  update private.season_ruleset_snapshots set ruleset_version=p_version,canonical_json=v_original where id=v_snapshot;
  alter table private.season_ruleset_snapshots enable trigger user;
  alter table private.market_snapshots enable trigger user;
  return next throws_ok(format('select private.season_card_rules(%L::uuid,%L)',v_snapshot,'LIVE'),'22023','UNSUPPORTED_SEASON_CARD_RULES','mode mismatch fails closed');
  return next throws_ok(format('update private.season_ruleset_snapshots set canonical_json=%L::jsonb where id=%L::uuid',
    jsonb_set(v_original,'{card,weeklyAllocationCredits}','2000'),v_snapshot),null,null,'normal callers cannot rewrite a frozen snapshot');
end;
$$;

select * from pg_temp.verify_version('1.0');
select * from pg_temp.verify_version('1.1');
select * from pg_temp.verify_version('1.2');
select * from finish();
rollback;
