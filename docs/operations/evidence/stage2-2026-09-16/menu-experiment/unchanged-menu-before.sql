-- Stage 1 effective definition, retained only for disposable A/B measurements.
-- Original prosrc SHA-256: 05b16297f8452ebd9485e6202f7f3a0204c7761977371621b6bd049e1a6fc267
CREATE OR REPLACE FUNCTION private.get_player_prop_menu_before_automation(p_league_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare answer jsonb;wk uuid;slots jsonb;
begin
 answer:=private.get_player_prop_menu_before_progressive(p_league_slug);wk:=(answer->>'weekId')::uuid;
 select coalesce(jsonb_agg(original.slot||jsonb_build_object(
 'publicationMode',case when audit.subject_id is not null then 'AUTOMATIC' when original.slot->>'subjectId' is not null and (original.slot->>'confirmed')::boolean then 'COMMISSIONER' else null end,
 'publishedAt',case when audit.subject_id is not null then to_jsonb(audit.published_at) when original.slot->>'subjectId' is not null then to_jsonb(menu.frozen_at) else 'null'::jsonb end,
 'lateFillEligible',exists(select 1 from private.player_catalog_pending_slots(wk) pending where pending.event_id=menu.event_id and pending.team=menu.team and pending.slot=menu.slot)) order by ord),'[]') into slots
 from jsonb_array_elements(answer->'slots') with ordinality original(slot,ord)
 join private.week_player_menu menu on menu.week_id=wk and menu.event_id=(original.slot->>'eventId')::uuid and menu.team=original.slot->>'team' and menu.slot=original.slot->>'slot'
 left join private.player_prop_slot_publications audit on audit.event_id=menu.event_id and audit.team=menu.team and audit.slot=menu.slot;
 return answer||jsonb_build_object('frozen',((answer->>'frozen')::boolean or exists(select 1 from private.player_prop_progressive_activations where week_id=wk)),'progressiveActivated',exists(select 1 from private.player_prop_progressive_activations where week_id=wk),'progressiveAvailability',exists(select 1 from private.player_prop_progressive_authorizations where week_id=wk),'canOpen',case when exists(select 1 from private.player_prop_progressive_authorizations where week_id=wk) then coalesce((answer->>'canOpen')::boolean,false) and private.progressive_initial_menu_ready(wk) else coalesce((answer->>'canOpen')::boolean,false) end,'slots',slots);
end; $function$;

