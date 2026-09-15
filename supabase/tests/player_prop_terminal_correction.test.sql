begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- A full deterministic season reaches the same protected championship/archive
-- authority as Live. Only catalog/quotes/source evidence are synthetic fixtures.
create temporary table terminal_props_context(owner_id uuid,league_id uuid,season_id uuid,slug text,
 week_id uuid,event_id uuid,subject_id uuid,over_entry uuid,under_entry uuid,response jsonb);
grant select,update on terminal_props_context to authenticated;
do $$ declare u uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) values(u,u::text||'@terminal-props.test');
 insert into private.profiles(id,display_name) values(u,'Terminal Props Owner');
 insert into private.owner_rehearsal_entitlements(user_id,note) values(u,'Protected player correction full-season fixture');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform api.start_owner_rehearsal('terminal-props-start');
 perform api.fill_owner_rehearsal_bots('terminal-props-fill');
 insert into terminal_props_context(owner_id,league_id,season_id,slug)
 select u,r.league_id,r.season_id,l.slug from private.owner_rehearsals r
 join private.leagues l on l.id=r.league_id where r.owner_user_id=u and r.status='ACTIVE';
end $$;

create function pg_temp.terminal_advance_until(p_stop text) returns void language plpgsql as $$
declare checkpoint text;current_week uuid;begin
 loop
  checkpoint:=api.get_owner_rehearsal()->>'checkpoint';
  exit when checkpoint=p_stop;
  if checkpoint='WEEK_2_OPEN' then
   perform api.prepare_owner_rehearsal_quote_review((select slug from terminal_props_context),'terminal-props-quote-review');
  end if;
  if checkpoint like 'WEEK\_%\_OPEN' escape '\' then
   select w.id into strict current_week from private.season_weeks w
    where w.season_id=(select season_id from terminal_props_context) order by w.nfl_week desc limit 1;
   if private.is_player_props_week(current_week) and exists(select 1 from private.week_player_menu where week_id=current_week and confirmed_at is null) then
    perform api.prepare_player_prop_menu((select slug from terminal_props_context));
    perform api.confirm_player_prop_menu((select slug from terminal_props_context),
     (select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) from private.week_player_menu where week_id=current_week));
   end if;
   perform api.use_owner_rehearsal_sample_card('terminal-props-sample-'||checkpoint);
  end if;
  perform api.advance_owner_rehearsal(checkpoint,'terminal-props-advance-'||checkpoint);
 end loop;
end $$;
select lives_ok($$select pg_temp.terminal_advance_until('WEEK_16_FINAL')$$,
 'all regular-season, qualification and semifinal results use the authoritative lifecycle');
-- Enable the exact new package prospectively, preserving already completed weeks.
update private.authoritative_season_rulesets a set ruleset_version='1.4',product_bible_version='3.3',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash
 from private.prepared_player_props_rulesets p where p.mode=a.mode;
select lives_ok($$select pg_temp.terminal_advance_until('WEEK_17_OPEN')$$,
 'the unopened championship week prospectively adopts the prepared player-props package');
update terminal_props_context c set week_id=w.id from private.season_weeks w
 where w.season_id=c.season_id and w.nfl_week=17;
update terminal_props_context c set event_id=(select id from private.sports_events where week_id=c.week_id order by fixture_event_key limit 1),
 over_entry=m.side_a_entry_id,under_entry=m.side_b_entry_id from private.matchups m
 where m.week_id=c.week_id and m.postseason_role='CHAMPIONSHIP' and private.is_effective_postseason_matchup(m.id);
select ok(over_entry is not null and under_entry is not null,'the fixture uses both actual championship finalists') from terminal_props_context;

update private.player_prop_controls set offers_enabled=true;
insert into private.player_prop_leagues(league_id,enabled) select league_id,true from terminal_props_context;
select api.import_player_catalog((select jsonb_agg(jsonb_build_object(
 'canonicalKey',e.id::text||':'||t.team||':'||role.position,'displayName',t.team||' Terminal '||role.position,'position',role.position,
 'provider','SIMULATION_FIXTURE','externalEventId',e.fixture_event_key,'externalPlayerId',e.id::text||':'||t.team||':'||role.position,
 'team',t.team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,
 'verifiedAt',clock_timestamp(),'evidenceHash',repeat('a',64),'roleRank',1,'roleEvidence','Verified deterministic current role','resultPathVerified',true))
 from private.sports_events e cross join lateral(values(e.away_team),(e.home_team)) t(team)
 cross join(values('QB'),('RB'),('WR')) role(position) where e.week_id=(select week_id from terminal_props_context)));
select lives_ok($$select api.prepare_player_prop_menu((select slug from terminal_props_context))$$,
 'the commissioner prepares the full championship-week menu');
select lives_ok($$select api.confirm_player_prop_menu((select slug from terminal_props_context),
 (select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id))
 from private.week_player_menu where week_id=(select week_id from terminal_props_context)))$$,
 'the commissioner confirms every game before the finalists submit');
update terminal_props_context c set subject_id=(select subject_id from private.week_player_menu m
 join private.sports_events e on e.id=m.event_id where m.event_id=c.event_id and m.slot='QB_PASS' and m.team=e.away_team);
do $$ declare c terminal_props_context%rowtype;side text;q uuid;sl uuid;actor uuid;payload text;begin
 select * into strict c from terminal_props_context;
 select id into strict sl from private.slates where week_id=c.week_id order by version desc limit 1;
 foreach side in array array['OVER','UNDER'] loop
  payload:=encode(extensions.digest(c.subject_id::text||side||'terminal-props','sha256'),'hex');
  insert into private.market_snapshots(event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,line_milli,american_odds,observed_at,payload_hash,subject_id,statistic,period)
  values(c.event_id,c.week_id,c.league_id,'draftkings','PLAYER_PASSING_YARDS',side,'Terminal QB '||side||' 75.5',75500,100,
   private.card_confirmation_time(c.season_id),payload,c.subject_id,'PASSING_YARDS','FULL_GAME') returning id into q;
  insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id) values(sl,c.event_id,q,c.week_id,c.league_id);
  select user_id into strict actor from private.season_entries where id=case side when 'OVER' then c.over_entry else c.under_entry end;
  perform private.accept_authoritative_card_for_actor(actor,c.slug,
   jsonb_build_array(jsonb_build_object('marketSnapshotId',q,'payloadHash',payload,'stakeCredits',1000)),
   'terminal-props-finalist-'||side);
 end loop;
end $$;
select is((select count(*) from private.position_receipts where week_id=c.week_id and subject_id=c.subject_id),2::bigint,
 'both finalists accepted real 1000-credit prop receipts before kickoff') from terminal_props_context c;
create temporary table terminal_original_receipts as
 select r.id,to_jsonb(r) bytes from private.position_receipts r where r.week_id=(select week_id from terminal_props_context);

select api.register_player_result_event(jsonb_build_object('externalEventId',e.fixture_event_key,'apiSportsEventId','terminal-99017',
 'nflverseEventId','2026_17_TERMINAL','gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,
 'awayTeam',e.away_team,'homeTeam',e.home_team,'evidenceHash',repeat('b',64)))
 from private.sports_events e where e.id=(select event_id from terminal_props_context);
select api.import_player_catalog(jsonb_build_array(jsonb_build_object('canonicalKey',s.canonical_key,'displayName',s.display_name,'position',s.position,
 'provider','API_SPORTS','externalEventId',e.fixture_event_key,'externalPlayerId','terminal-player-'||s.id::text,
 'team',e.away_team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,
 'verifiedAt',clock_timestamp(),'evidenceHash',repeat('c',64),'roleRank',1,'roleEvidence','Verified deterministic result mapping','resultPathVerified',true)))
 from terminal_props_context c join private.player_subjects s on s.id=c.subject_id join private.sports_events e on e.id=c.event_id;
create function pg_temp.terminal_observation(p_value integer,p_minutes integer) returns jsonb language sql as $$
 select jsonb_build_object('provider','API_SPORTS','externalEventId',e.fixture_event_key,'sourceEventId','terminal-99017',
 'externalPlayerId','terminal-player-'||c.subject_id::text,'subjectId',c.subject_id,'team',e.away_team,
 'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'statistic','PASSING_YARDS','period','FULL_GAME',
 'value',p_value,'complete',true,'participation','OFFENSE','participationComplete',true,
 'sourceUpdatedAt',clock_timestamp()-make_interval(mins=>p_minutes),'fetchedAt',clock_timestamp(),'contentHash',repeat('d',64))
 from terminal_props_context c join private.sports_events e on e.id=c.event_id;
$$;
select api.import_player_result_observations(jsonb_build_array(pg_temp.terminal_observation(100,10)));
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),0::bigint,
 'stored player source evidence cannot settle an unstarted championship game') from terminal_props_context c;
select lives_ok($$select pg_temp.terminal_advance_until('COMPLETE')$$,
 'accepted props settle on final team detection and normal Week 17/18 authorities finalize champion and archive');
select is((select state from private.season_weeks where id=c.week_id),'FINAL','Week 17 is genuinely final before correction') from terminal_props_context c;
select is((select lifecycle from private.seasons where id=c.season_id),'FINAL','the original season archive is genuinely final') from terminal_props_context c;
select is((select champion_entry_id from private.playoff_publications p where p.season_id=c.season_id and p.publication_stage='CHAMPION_FINAL'
 and not exists(select 1 from private.playoff_publications next where next.supersedes_id=p.id)),over_entry,
 'the original 100-yard evidence awards the championship to the over bettor') from terminal_props_context c;
create temporary table terminal_original as select
 (select jsonb_agg(to_jsonb(r) order by r.id) from private.event_result_versions r where r.week_id=c.week_id) team_results,
 (select id from private.playoff_publications p where p.season_id=c.season_id and p.publication_stage='CHAMPION_FINAL'
 and not exists(select 1 from private.playoff_publications next where next.supersedes_id=p.id)) champion_id,
 (select id from private.season_archive_versions a where a.season_id=c.season_id and not exists(select 1 from private.season_archive_versions next where next.supersedes_id=a.id)) archive_id,
 (select to_jsonb(r) from private.playoff_round_publications r where r.season_id=c.season_id and r.nfl_week=18
 and not exists(select 1 from private.playoff_round_publications next where next.supersedes_id=r.id)) round18,
 (select correction_window_closes_at from private.season_weeks where id=c.week_id) deadline
 from terminal_props_context c;

select api.import_player_result_observations(jsonb_build_array(pg_temp.terminal_observation(50,5)));
select private.reconcile_player_event((select event_id from terminal_props_context));
create temporary table terminal_candidate as select ca.id,ca.statistic_observation_id,ca.participation_observation_id
 from private.player_result_candidates ca where ca.event_id=(select event_id from terminal_props_context)
 and ca.reason='PROTECTED_RESULT_REVIEW_REQUIRED' order by ca.created_at desc,ca.id desc limit 1;
grant select on terminal_candidate to authenticated;
select is((select count(*) from terminal_candidate),1::bigint,'the later official 50-yard revision requires protected-result review');
select throws_ok($$select api.resolve_player_result_candidate(id,statistic_observation_id,participation_observation_id,
 'Verified final passing-yard correction.') from terminal_candidate$$,'55000',null,
 'ordinary correction authority cannot overwrite an archived championship');
select set_config('request.jwt.claims',jsonb_build_object('sub',
 (select m.user_id from private.league_memberships m join terminal_props_context c on c.league_id=m.league_id
 where m.user_id<>c.owner_id order by m.user_id limit 1),'role','authenticated')::text,true);
set local role authenticated;
select throws_ok($$select api.resolve_finalized_week17_player_candidate(id,statistic_observation_id,participation_observation_id,
 'Verified final passing-yard correction.') from terminal_candidate$$,'42501','Commissioner membership required.',
 'a same-league member cannot apply a protected championship correction');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from terminal_props_context),'role','authenticated')::text,true);
set local role authenticated;
select lives_ok($$update terminal_props_context set response=(select api.resolve_finalized_week17_player_candidate(
 id,statistic_observation_id,participation_observation_id,'Verified final passing-yard correction.') from terminal_candidate)$$,
 'the authenticated commissioner applies the protected Week 17 stat-only correction');
reset role;
select is((select champion_entry_id from private.playoff_publications p where p.season_id=c.season_id and p.publication_stage='CHAMPION_FINAL'
 and not exists(select 1 from private.playoff_publications next where next.supersedes_id=p.id)),under_entry,
 'the corrected accepted prop results reverse the actual championship winner') from terminal_props_context c;
select ok(exists(select 1 from private.playoff_publications p where p.id=(c.response->>'championPublicationId')::uuid
 and p.supersedes_id=o.champion_id),'champion correction appends a successor to the original publication')
 from terminal_props_context c cross join terminal_original o;
select ok(exists(select 1 from private.season_archive_versions a where a.id=(c.response->>'archiveId')::uuid and a.supersedes_id=o.archive_id),
 'an already final season receives an archive successor') from terminal_props_context c cross join terminal_original o;
select ok(exists(select 1 from private.season_archive_versions a where a.id=(c.response->>'archiveId')::uuid
 and a.terminal_bracket_publication_id=(c.response->>'championPublicationId')::uuid
 and a.champion_entry_id=c.under_entry and a.archive_json#>>'{playoffs,championEntryId}'=c.under_entry::text
 and a.effective_w18_round_publication_id=(o.round18->>'id')::uuid),
 'the new archive connects the corrected champion and original protected Week 18 round')
 from terminal_props_context c cross join terminal_original o;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.event_result_versions r where r.week_id=c.week_id),o.team_results,
 'stat-only correction preserves every team-result byte and version') from terminal_props_context c cross join terminal_original o;
select ok(not exists(select 1 from terminal_original_receipts original join private.position_receipts r on r.id=original.id
 where original.bytes<>to_jsonb(r)),'accepted championship receipt bytes remain immutable');
select is((select to_jsonb(r) from private.playoff_round_publications r where r.season_id=c.season_id and r.nfl_week=18
 and not exists(select 1 from private.playoff_round_publications next where next.supersedes_id=r.id)),o.round18,
 'completed Week 18 pairings preserve their protected original lineage') from terminal_props_context c cross join terminal_original o;
select is((select correction_window_closes_at from private.season_weeks where id=c.week_id),o.deadline,
 'protected correction never restarts the existing correction window') from terminal_props_context c cross join terminal_original o;
select ok(exists(select 1 from private.corrections x where x.id=(c.response->>'correctionId')::uuid
 and x.original_result_version_id=x.corrected_result_version_id
 and x.original_player_evidence_bundle_id is not null and x.corrected_player_evidence_bundle_id is not null
 and x.original_player_evidence_bundle_id<>x.corrected_player_evidence_bundle_id),
 'the existing corrections ledger records player-only before/after evidence without invented team-score revisions') from terminal_props_context c;
select lives_ok($$select private.assert_phase8_terminal_lineage((select season_id from terminal_props_context))$$,
 'corrected scores and matchup results have a single terminal lineage');
select is((select count(*) from private.weekly_score_versions v where v.week_id=c.week_id and v.status<>'FINAL'
 and not exists(select 1 from private.weekly_score_versions next where next.supersedes_id=v.id)),0::bigint,
 'every effective corrected Week 17 score remains final') from terminal_props_context c;
select is((select count(*) from private.matchup_result_versions v where v.week_id=c.week_id and v.status<>'FINAL'
 and not exists(select 1 from private.matchup_result_versions next where next.supersedes_id=v.id)),0::bigint,
 'every effective corrected Week 17 matchup remains final') from terminal_props_context c;
create temporary table terminal_counts as select
 (select count(*) from private.player_evidence_bundles where event_id=c.event_id) evidence,
 (select count(*) from private.playoff_publications where season_id=c.season_id) publications,
 (select count(*) from private.season_archive_versions where season_id=c.season_id) archives from terminal_props_context c;
select is((select api.resolve_finalized_week17_player_candidate(id,statistic_observation_id,participation_observation_id,
 'Verified final passing-yard correction.')->>'replayed' from terminal_candidate),'true','identical protected correction retry recovers the original decision');
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),n.evidence,
 'retry adds no player evidence revision') from terminal_props_context c cross join terminal_counts n;
select is((select count(*) from private.playoff_publications where season_id=c.season_id),n.publications,
 'retry adds no duplicate champion publication') from terminal_props_context c cross join terminal_counts n;
select is((select count(*) from private.season_archive_versions where season_id=c.season_id),n.archives,
 'retry adds no duplicate archive') from terminal_props_context c cross join terminal_counts n;
select throws_ok($$select api.resolve_finalized_week17_player_candidate(id,statistic_observation_id,participation_observation_id,
 'Changed correction reason must not reuse the decision.') from terminal_candidate$$,'22000',null,
 'protected decision identity rejects a mismatched replay');
select * from finish();
rollback;
