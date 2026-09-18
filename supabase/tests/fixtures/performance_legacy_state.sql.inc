-- Test-only baseline pinned to main 843ecda3. Loaded only into pg_temp.
-- Never install this function in a hosted database.
CREATE OR REPLACE FUNCTION pg_temp.performance_legacy_state(p_league_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_league private.leagues%rowtype;
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_entry private.season_entries%rowtype;
  v_card private.weekly_cards%rowtype;
  v_matchup private.matchups%rowtype;
  v_opponent_entry_id uuid;
  v_opponent_card_id uuid;
  v_is_commissioner boolean;
  v_state jsonb;
  v_rolling_public jsonb;
  v_common_visible boolean;
  v_entry_closed boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.* into strict v_league
  from private.leagues as league
  where league.slug = lower(p_league_slug);

  if not private.is_league_member(v_league.id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;

  v_is_commissioner := private.is_league_commissioner(v_league.id);

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id
  order by season.created_at desc
  limit 1;

  select entry.* into strict v_entry
  from private.season_entries as entry
  where entry.season_id = v_season.id and entry.user_id = v_user_id;

  select week.* into v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = (
      select max(current_week.nfl_week)
      from private.season_weeks as current_week
      where current_week.season_id = v_season.id
        
    );

  if v_week.id is not null then
    select card.* into v_card
    from private.weekly_cards as card
    where card.week_id = v_week.id and card.entry_id = v_entry.id;

    select matchup.* into v_matchup
    from private.matchups as matchup
    where matchup.week_id = v_week.id
        and private.is_effective_postseason_matchup(matchup.id)
      and v_entry.id in (matchup.side_a_entry_id, matchup.side_b_entry_id);

    if v_matchup.id is not null then
      v_opponent_entry_id := case
        when v_matchup.side_a_entry_id = v_entry.id then v_matchup.side_b_entry_id
        else v_matchup.side_a_entry_id
      end;
      select card.id into v_opponent_card_id
      from private.weekly_cards as card
      where card.week_id = v_week.id and card.entry_id = v_opponent_entry_id;
    end if;
  end if;

  v_state := jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_league.id,
      'name', v_league.name,
      'slug', v_league.slug,
      'role', case when v_is_commissioner then 'COMMISSIONER' else 'MEMBER' end,
      'mode', v_season.mode,
      'nflYear', v_season.nfl_year,
      'lifecycle', v_season.lifecycle,
      'memberCount', (
        select count(*)
        from private.league_memberships as membership
        where membership.league_id = v_league.id
      )
    ),
    'season', jsonb_build_object(
      'id', v_season.id,
      'scheduleSeed', v_season.schedule_seed,
      'rosterLockedAt', v_season.roster_locked_at,
      'simulatedNow', v_season.simulated_now,
      'rulesetSnapshotId', coalesce(v_week.ruleset_snapshot_id,v_season.ruleset_snapshot_id),
      'rulesetSnapshot', (select jsonb_build_object(
        'rulesetId', r.ruleset_id, 'rulesetVersion', r.ruleset_version,
        'productBibleId', r.product_bible_id, 'productBibleVersion', r.product_bible_version,
        'mode', r.mode, 'canonicalJson', r.canonical_json,
        'sha256Hash', r.sha256_hash, 'publishedAt', r.published_at, 'frozenAt', r.frozen_at
      ) from private.season_ruleset_snapshots r where r.id=coalesce(v_week.ruleset_snapshot_id,v_season.ruleset_snapshot_id))
    ),
    'viewer', (
      select jsonb_build_object(
        'userId', profile.id,
        'entryId', v_entry.id,
        'displayName', profile.display_name,
        'avatarUrl', profile.avatar_url
      )
      from private.profiles as profile
      where profile.id = v_user_id
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', membership.user_id,
          'entryId', entry.id,
          'displayName', profile.display_name,
          'role', membership.role,
          'joinedAt', membership.joined_at
        ) order by membership.joined_at, membership.user_id
      )
      from private.league_memberships as membership
      join private.profiles as profile on profile.id = membership.user_id
      left join private.season_entries as entry
        on entry.season_id = v_season.id and entry.user_id = membership.user_id
      where membership.league_id = v_league.id
    ), '[]'::jsonb),
    'week', case when v_week.id is null then null else jsonb_build_object(
      'id', v_week.id,
      'propsEnabled', private.player_prop_offers_enabled(v_week.id), 'nflWeek', v_week.nfl_week,
      'scope', v_week.scope,
      'state', v_week.state,
      'opensAt', v_week.opens_at,
      'commonLockAt', v_week.common_lock_at,
      'lockedAt', v_week.locked_at,
      'correctionWindowClosesAt', v_week.correction_window_closes_at, 'finalizationMode', v_week.finalization_mode
    ) end,
    'schedule', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', matchup.id,
          'displayOrder', matchup.display_order,
          'scope', matchup.scope,
          'postseasonRole', matchup.postseason_role,
          'sideAEntryId', matchup.side_a_entry_id,
          'sideAName', side_a_profile.display_name,
          'sideBEntryId', matchup.side_b_entry_id,
          'sideBName', side_b_profile.display_name,
          'result', case when result.id is null then null else jsonb_build_object(
            'sideADecision', result.side_a_decision,
            'sideBDecision', result.side_b_decision,
            'sideAPointsForCenticredits', result.side_a_points_for_centicredits,
            'sideBPointsForCenticredits', result.side_b_points_for_centicredits,
            'status', result.status
          ) end
        ) order by matchup.display_order
      )
      from private.matchups as matchup
      join private.season_entries as side_a_entry on side_a_entry.id = matchup.side_a_entry_id
      join private.profiles as side_a_profile on side_a_profile.id = side_a_entry.user_id
      join private.season_entries as side_b_entry on side_b_entry.id = matchup.side_b_entry_id
      join private.profiles as side_b_profile on side_b_profile.id = side_b_entry.user_id
      left join lateral (
        select candidate.*
        from private.matchup_result_versions as candidate
        where candidate.matchup_id = matchup.id
        order by candidate.created_at desc, candidate.id desc
        limit 1
      ) as result on true
      where matchup.week_id = v_week.id
        and private.is_effective_postseason_matchup(matchup.id)
    ), '[]'::jsonb),
    'slate', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'key', event.fixture_event_key,
          'awayTeam', event.away_team,
          'homeTeam', event.home_team,
          'scheduledStartAt', event.scheduled_start_at,
          'actualStartedAt', event.actual_started_at,
          'state', event.state,
          'providerHealth', event.provider_health,
          'markets', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', snapshot.id,
                'subjectId', snapshot.subject_id, 'subjectLabel', snapshot.subject_label, 'subjectTeam', snapshot.subject_team, 'subjectPosition', snapshot.subject_position, 'statistic', snapshot.statistic, 'period', snapshot.period, 'marketType', snapshot.market_type,
                'outcomeKey', snapshot.outcome_key,
                'proposition', snapshot.proposition,
                'lineMilli', snapshot.line_milli,
                'americanOdds', snapshot.american_odds,
                'qualityStatus', snapshot.quality_status,
                'observedAt', snapshot.observed_at,
                'payloadHash', snapshot.payload_hash,
                'maximumStakeCredits', case
                  when snapshot.american_odds < -200 then 750 else 1000
                end
              ) order by snapshot.market_type, snapshot.outcome_key, snapshot.line_milli
            )
            from private.slate_items as item
            join private.market_snapshots as snapshot on snapshot.id = item.market_snapshot_id
            where item.event_id = event.id and item.week_id = v_week.id
              and private.is_effective_slate_item(item.id)
          ), '[]'::jsonb)
        ) order by event.scheduled_start_at, event.id
      )
      from private.sports_events as event
      where event.week_id = v_week.id
        and exists (
          select 1
          from private.slate_items as effective_item
          where effective_item.event_id = event.id
            and effective_item.week_id = v_week.id
            and private.is_effective_slate_item(effective_item.id)
        )
    ), '[]'::jsonb),
    'ownerCard', case when v_card.id is null then null else jsonb_build_object(
      'cardGeneration',v_card.card_generation,
      'resetAt',(select r.created_at from private.card_reset_events r where r.card_id=v_card.id),
      'resetReceipts',private.owner_reset_receipts(v_card.id,v_card.owner_user_id),
      'id', v_card.id,
      'entryId', v_card.entry_id,
      'grantedCredits', v_card.granted_credits,
      'grantedAt', v_card.granted_at,
      'compliance', v_card.compliance,
      'lockedAt', v_card.locked_at,
      'allocatedCredits', (
        select coalesce(sum(receipt.stake_credits), 0)
        from private.effective_position_receipts as receipt
        where receipt.card_id = v_card.id
      ),
      'remainingCredits', 1000 - (
        select coalesce(sum(receipt.stake_credits), 0)
        from private.effective_position_receipts as receipt
        where receipt.card_id = v_card.id
      ),
      'positions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', receipt.id,
            'eventId', event.id,
            'eventKey', event.fixture_event_key,
            'eventLabel', event.away_team || ' at ' || event.home_team,
            'scheduledStartAt', event.scheduled_start_at,
            'subjectId', receipt.subject_id, 'subjectLabel', receipt.subject_label, 'subjectTeam', receipt.subject_team, 'subjectPosition', receipt.subject_position, 'statistic', receipt.statistic, 'period', receipt.period, 'marketType', receipt.market_type,
            'outcomeKey', receipt.outcome_key,
            'proposition', receipt.proposition,
            'lineMilli', receipt.line_milli,
            'americanOdds', receipt.american_odds,
            'stakeCredits', receipt.stake_credits,
            'quoteObservedAt', receipt.quote_observed_at,
            'acceptedAt', receipt.accepted_at,
            'receiptHash', receipt.receipt_hash, 'serializationVersion',receipt.receipt_serialization_version,
            'settlement', case when settlement.id is null then null else jsonb_build_object(
              'outcome', settlement.outcome,
              'returnedCenticredits', settlement.returned_centicredits,'playerEvidenceVersion',(select b.version from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id),'playerCorrectionReason',(select b.reason from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id and b.version>1),'finalYards',(select b.value from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id)
            ) end
          ) order by receipt.accepted_at, receipt.id
        )
        from private.effective_position_receipts as receipt
        join private.sports_events as event on event.id = receipt.event_id
        left join lateral (
          select candidate.*
          from private.settlement_versions as candidate
          where candidate.receipt_id = receipt.id
          order by candidate.created_at desc, candidate.id desc
          limit 1
        ) as settlement on true
        where receipt.card_id = v_card.id
      ), '[]'::jsonb)
    ) end,
    'matchup', case when v_matchup.id is null then null else jsonb_build_object(
      'id', v_matchup.id,
      'postseasonRole', v_matchup.postseason_role,
      'selfEntryId', v_entry.id,
      'opponentEntryId', v_opponent_entry_id,
      'opponentName', (
        select profile.display_name
        from private.season_entries as entry
        join private.profiles as profile on profile.id = entry.user_id
        where entry.id = v_opponent_entry_id
      ),
      'opponentSealed', case when v_opponent_card_id is null then null else (
        select coalesce(sum(receipt.stake_credits), 0) = 1000
        from private.effective_position_receipts as receipt
        where receipt.card_id = v_opponent_card_id
      ) end,
      'opponentReadiness', case
        when v_week.state = 'OPEN' then null
        else (
          select card.compliance
          from private.weekly_cards as card
          where card.id = v_opponent_card_id
        )
      end,
      'opponentRevealedPositions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', receipt.id,
            'eventId', event.id,
            'eventLabel', event.away_team || ' at ' || event.home_team,
            'subjectId', receipt.subject_id, 'subjectLabel', receipt.subject_label, 'subjectTeam', receipt.subject_team, 'subjectPosition', receipt.subject_position, 'statistic', receipt.statistic, 'period', receipt.period, 'marketType', receipt.market_type,
            'proposition', receipt.proposition,
            'americanOdds', receipt.american_odds,
            'stakeCredits', receipt.stake_credits,
            'settlement', case when settlement.id is null then null else jsonb_build_object(
              'outcome', settlement.outcome,
              'returnedCenticredits', settlement.returned_centicredits,'playerEvidenceVersion',(select b.version from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id),'playerCorrectionReason',(select b.reason from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id and b.version>1),'finalYards',(select b.value from private.player_evidence_bundles b where b.id=settlement.player_evidence_bundle_id)
            ) end
          ) order by event.scheduled_start_at, receipt.accepted_at
        )
        from private.effective_position_receipts as receipt
        join private.sports_events as event on event.id = receipt.event_id
        left join lateral (
          select candidate.*
          from private.settlement_versions as candidate
          where candidate.receipt_id = receipt.id
          order by candidate.created_at desc, candidate.id desc
          limit 1
        ) as settlement on true
        where receipt.card_id = v_opponent_card_id
          and (event.state='VOID' or (event.state in ('LIVE','FINAL','CORRECTED') and event.actual_started_at is not null and event.actual_started_at<=private.card_confirmation_time(v_season.id)))
      ), '[]'::jsonb),
      'futureSealed', exists (
        select 1
        from private.sports_events as event
        where event.week_id = v_week.id
        and exists (
          select 1
          from private.slate_items as effective_item
          where effective_item.event_id = event.id
            and effective_item.week_id = v_week.id
            and private.is_effective_slate_item(effective_item.id)
        )
          and event.state not in ('LIVE', 'FINAL', 'VOID', 'CORRECTED')
      ),
      'result', (
        select jsonb_build_object(
          'selfDecision', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_a_decision
            else result.side_b_decision
          end,
          'opponentDecision', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_b_decision
            else result.side_a_decision
          end,
          'selfPointsForCenticredits', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_a_points_for_centicredits
            else result.side_b_points_for_centicredits
          end,
          'opponentPointsForCenticredits', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_b_points_for_centicredits
            else result.side_a_points_for_centicredits
          end,
          'status', result.status
        )
        from private.matchup_result_versions as result
        where result.matchup_id = v_matchup.id
        order by result.created_at desc, result.id desc
        limit 1
      )
    ) end,
    'standingsThroughWeek', (select standings.through_week from private.standings_snapshots standings
      where standings.season_id=v_season.id and standings.through_week<=v_week.nfl_week
      order by standings.through_week desc,standings.created_at desc,standings.id desc limit 1),
    'standings', coalesce((
      select standings.ordered_rows
      from private.standings_snapshots as standings
      where standings.season_id = v_season.id
        and standings.through_week <= v_week.nfl_week
      order by standings.through_week desc, standings.created_at desc, standings.id desc
      limit 1
    ), '[]'::jsonb),
    'commissioner', jsonb_build_object(
      'isCommissioner', v_is_commissioner,
      'readyCount', case when v_week.state in ('LOCKED', 'PROVISIONAL', 'FINAL') then (
        select count(*)
        from private.weekly_cards as card
        where card.week_id = v_week.id and card.compliance = 'COMPLIANT'
      ) else null end,
      'cardCount', case when v_week.id is null then 0 else (
        select count(*) from private.weekly_cards as card where card.week_id = v_week.id
      ) end,
      'correctionCount', case when v_week.id is null then 0 else (
        select count(*) from private.corrections as correction where correction.week_id = v_week.id
      ) end
    )
  );
  if v_week.id is not null and v_matchup.id is not null then
    v_rolling_public := private.rolling_card_public_fields(v_opponent_card_id, v_week.id);
    v_state := jsonb_set(v_state, '{matchup}', (v_state -> 'matchup') || jsonb_build_object(
      'opponentSelectedGames', v_rolling_public -> 'selectedGames',
      'opponentSubmitted', v_rolling_public -> 'submitted'
    ));
  end if;
  if v_week.id is not null and private.is_rolling_week(v_week.id) then
    v_entry_closed := private.rolling_week_entries_closed(v_week.id);
    v_common_visible := coalesce(private.stage1_season_time(v_week.season_id) >= v_week.common_lock_at, false);
    v_state := jsonb_set(v_state, '{week}', (v_state -> 'week') || jsonb_build_object(
      'rollingSubmissionsEnabled', true,
      'entryClosesAt', private.week_entry_closes_at(v_week.id),
      'entryClosed', v_entry_closed
    ));
    v_state := jsonb_set(v_state, '{slate}', coalesce((
      select jsonb_agg(item || jsonb_build_object(
        'entryClosesAt', private.event_entry_closes_at((item ->> 'id')::uuid),
        'entryOpen', private.event_accepts_entries((item ->> 'id')::uuid)
      ) order by ordinal)
      from jsonb_array_elements(v_state -> 'slate') with ordinality as event(item, ordinal)
    ), '[]'::jsonb));
    if v_card.id is not null then
      v_state := jsonb_set(v_state, '{ownerCard}', (v_state -> 'ownerCard') || jsonb_build_object(
        'rollingSubmissionsEnabled', true,
        'canSubmit', private.rolling_card_can_submit(v_card.id)
      ));
    end if;
    if v_matchup.id is not null then
      v_state := jsonb_set(v_state, '{matchup}', (v_state -> 'matchup') || jsonb_build_object(
        'opponentSealed', v_rolling_public -> 'submitted',
        'opponentAvailableCredits', v_rolling_public -> 'availableCredits',
        'opponentExpiredCredits', v_rolling_public -> 'expiredCredits',
        'opponentCanSubmit', v_rolling_public -> 'canSubmit',
        'opponentReadiness', case when not v_common_visible or v_opponent_card_id is null then null
          when (v_rolling_public ->> 'submitted')::boolean then 'COMPLIANT'
          when v_entry_closed then 'INCOMPLETE' else 'PENDING' end
      ));
    end if;
  end if;
  return v_state;
end;
$function$;
