-- Closed games can remain in a shared response acquired before their cutoff.
-- Skip them before comparing provider identity; do not change the event, its
-- cutoff, snapshots, receipts, or the strict identity checks for open games.
do $migration$
declare
 definition text := pg_get_functiondef('private.apply_shared_quote_events(uuid,uuid,uuid[],boolean,text[])'::regprocedure);
 original text := $old$   if e.away_team<>src->>'awayTeam' or e.home_team<>src->>'homeTeam' or e.scheduled_start_at<>(src->>'scheduledStartAt')::timestamptz then raise exception 'EVENT_IDENTITY_CHANGED'; end if;
   if not private.event_accepts_entries(e.id) then continue; end if;$old$;
 replacement text := $new$   if not private.event_accepts_entries(e.id) then continue; end if;
   if e.away_team<>src->>'awayTeam' or e.home_team<>src->>'homeTeam' or e.scheduled_start_at<>(src->>'scheduledStartAt')::timestamptz then raise exception 'EVENT_IDENTITY_CHANGED'; end if;$new$;
begin
 if encode(extensions.digest(definition,'sha256'),'hex') <> 'c620cdd199f5397d1461c2cccfc132d89391b86a67e5c5b0f3bea96529462ae1'
    or strpos(definition,original)=0 then
  raise exception 'Unexpected shared quote application definition; review before repairing';
 end if;
 execute replace(definition,original,replacement);
 if encode(extensions.digest(pg_get_functiondef('private.apply_shared_quote_events(uuid,uuid,uuid[],boolean,text[])'::regprocedure),'sha256'),'hex')
    <> 'bd5817e0247c85f341a766cb51a706593e300777759b31fdeda508a5537a11dd' then
  raise exception 'Shared quote closed-game repair parity failed';
 end if;
end $migration$;
