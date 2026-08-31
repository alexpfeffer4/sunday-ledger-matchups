-- Phase 8A follow-up: preserve the original Week 14 standings FK coverage,
-- reject corrections after a card seals, and retire slate items owned by a
-- superseded postseason round without mutating their append-only facts.

create index playoff_publications_week14_standings_snapshot_id_idx
  on private.playoff_publications (week14_standings_snapshot_id);

create or replace function private.is_week_card_sealed(p_week_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (
      select 1
      from private.weekly_cards as card
      where card.week_id = p_week_id
        and card.locked_at is not null
    )
    or exists (
      select 1
      from private.position_receipts as receipt
      join private.weekly_cards as card on card.id = receipt.card_id
      where card.week_id = p_week_id
    )
    or exists (
      select 1
      from private.slates as slate
      where slate.week_id = p_week_id
        and slate.frozen_at is not null
    );
$$;

revoke execute on function private.is_week_card_sealed(uuid)
from public, anon, authenticated;

create or replace function private.is_effective_slate_item(p_slate_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from private.playoff_round_publications as any_round
      where any_round.week_id = item.week_id
    ) then true
    else exists (
      select 1
      from private.playoff_round_publications as round
      join private.playoff_publications as publication
        on publication.id = round.playoff_publication_id
      where round.week_id = item.week_id
        and round.version = slate.version
        and not exists (
          select 1
          from private.playoff_round_publications as successor
          where successor.supersedes_id = round.id
        )
        and not exists (
          select 1
          from private.playoff_publications as successor
          where successor.supersedes_id = publication.id
        )
    )
  end
  from private.slate_items as item
  join private.slates as slate on slate.id = item.slate_id
  where item.id = p_slate_item_id;
$$;

revoke execute on function private.is_effective_slate_item(uuid)
from public, anon, authenticated;

do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_occurrences integer;
begin
  select pg_get_functiondef('api.publish_playoff_qualification(uuid,text)'::regprocedure)
  into v_definition;
  v_old := E'exists (\n    select 1 from private.weekly_cards as card\n    join private.season_weeks as downstream on downstream.id = card.week_id\n    where downstream.season_id = v_season.id and downstream.nfl_week between 15 and 17\n      and card.locked_at is not null\n  )';
  v_new := E'exists (\n    select 1 from private.season_weeks as downstream\n    where downstream.season_id = v_season.id and downstream.nfl_week between 15 and 17\n      and private.is_week_card_sealed(downstream.id)\n  )';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_playoff_qualification seal guard changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);

  select pg_get_functiondef('api.publish_postseason_week(uuid,uuid,text[],text)'::regprocedure)
  into v_definition;
  v_old := 'if exists (select 1 from private.weekly_cards as card where card.week_id = v_latest_week.id and card.locked_at is not null) then';
  v_new := 'if private.is_week_card_sealed(v_latest_week.id) then';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_postseason_week seal guard changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);

  select pg_get_functiondef('api.accept_stage1_card(text,jsonb,text)'::regprocedure)
  into v_definition;
  v_old := 'and slate_item.week_id = v_week.id';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_occurrences <> 2 then
    raise exception 'accept_stage1_card slate selectors changed; migration refused';
  end if;
  v_definition := replace(
    v_definition,
    v_old,
    v_old || E'\n   and private.is_effective_slate_item(slate_item.id)'
  );
  execute v_definition;

  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure)
  into v_definition;
  v_old := 'where item.event_id = event.id and item.week_id = v_week.id';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_stage1_state market slate selector changed; migration refused';
  end if;
  v_definition := replace(
    v_definition,
    v_old,
    v_old || E'\n              and private.is_effective_slate_item(item.id)'
  );

  v_old := 'where event.week_id = v_week.id';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_old, '')))
    / length(v_old);
  if v_occurrences <> 2 then
    raise exception 'get_stage1_state event slate selectors changed; migration refused';
  end if;
  v_definition := replace(
    v_definition,
    v_old,
    v_old || E'\n        and exists (\n          select 1\n          from private.slate_items as effective_item\n          where effective_item.event_id = event.id\n            and effective_item.week_id = v_week.id\n            and private.is_effective_slate_item(effective_item.id)\n        )'
  );
  execute v_definition;
end;
$migration$;
