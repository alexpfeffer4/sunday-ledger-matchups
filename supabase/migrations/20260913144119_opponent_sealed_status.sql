-- Owner-approved September 13: scheduled opponents may see the one-bit sealed
-- status before common lock. Draft activity and unrevealed receipt metadata stay
-- private. Add only this field to the existing authenticated, member-scoped read.
do $migration$
declare
  v_definition text;
  v_anchor text := $old$      'opponentReadiness', case$old$;
  v_replacement text := $new$      'opponentSealed', case when v_opponent_card_id is null then null else (
        select coalesce(sum(receipt.stake_credits), 0) = 1000
        from private.position_receipts as receipt
        where receipt.card_id = v_opponent_card_id
      ) end,
      'opponentReadiness', case$new$;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure)
  into v_definition;
  if (length(v_definition) - length(replace(v_definition, v_anchor, '')))
      / length(v_anchor) <> 1
      or strpos(v_definition, '''opponentSealed''') > 0 then
    raise exception 'get_stage1_state opponent projection changed; migration refused';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$migration$;
