-- Bound LIVE page payloads by current market heads, not retained history.
-- Change only the market read. Auth, reveal, receipts, rules and Simulation
-- remain in the same function with the same signature, owner and grants.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('api.get_stage1_state(text)'::regprocedure);
  old_fragment text := $old$            from private.slate_items as item
            join private.market_snapshots as snapshot on snapshot.id = item.market_snapshot_id
            where item.event_id = event.id and item.week_id = v_week.id
              and private.is_effective_slate_item(item.id)$old$;
begin
  if (length(definition) - length(replace(definition, old_fragment, '')))
       / length(old_fragment) <> 1 then
    raise exception 'Current-state market read baseline changed; migration refused';
  end if;
  execute replace(definition, old_fragment, $new$            from (
              -- LIVE pages need only current heads. Retain every snapshot for
              -- immutable receipts/audits, without aggregating its old prices.
              select head.market_snapshot_id
              from private.live_quote_heads as head
              where v_season.mode = 'LIVE'
                and head.event_id = event.id and head.week_id = v_week.id
                and exists (
                  select 1 from private.slate_items as current_item
                  where current_item.market_snapshot_id = head.market_snapshot_id
                    and current_item.event_id = head.event_id
                    and current_item.week_id = head.week_id
                    and private.is_effective_slate_item(current_item.id)
                )
              union all
              -- Simulation/rehearsal retain their existing slate contract.
              select item.market_snapshot_id
              from private.slate_items as item
              where v_season.mode <> 'LIVE'
                and item.event_id = event.id and item.week_id = v_week.id
                and private.is_effective_slate_item(item.id)
            ) as current_items
            join private.market_snapshots as snapshot
              on snapshot.id = current_items.market_snapshot_id$new$);
end;
$migration$;
commit;
