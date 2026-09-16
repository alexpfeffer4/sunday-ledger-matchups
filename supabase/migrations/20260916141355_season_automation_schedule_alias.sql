-- Forward-only repair: preserve every schedule/fencing guard and remove a
-- PL/pgSQL variable/query-alias collision in the first live synchronization.
create or replace function private.record_automation_schedule(p_run uuid,p_schedule jsonb) returns void
language plpgsql set search_path='' as $$
declare r private.season_automation_runs%rowtype;s private.seasons%rowtype;game_record jsonb;h text;
begin
 r:=private.assert_season_automation_run(p_run);select * into strict s from private.seasons where id=r.season_id;
 if r.operation not in('SYNC_SCHEDULE','PREPARE') or jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)<>272 then
 raise exception using errcode='22023',message='A complete official regular-season schedule is required.';end if;
 if (select count(distinct item->>'gameId') from jsonb_array_elements(p_schedule)item)<>272
 or (select count(distinct (item->>'week')::integer) from jsonb_array_elements(p_schedule)item)<>18
 or (select count(distinct team) from jsonb_array_elements(p_schedule)item cross join lateral unnest(array[item->>'awayTeam',item->>'homeTeam'])team)<>32
 or exists(select 1 from jsonb_array_elements(p_schedule)item cross join lateral unnest(array[item->>'awayTeam',item->>'homeTeam'])team group by team having count(*)<>17)
 or exists(select 1 from jsonb_array_elements(p_schedule)item cross join lateral unnest(array[item->>'awayTeam',item->>'homeTeam'])team group by item->>'week',team having count(*)<>1) then
 raise exception using errcode='22023',message='The official schedule is incomplete or ambiguous.';end if;
 for game_record in select value from jsonb_array_elements(p_schedule) loop
 if game_record->>'season' is null or (game_record->>'season')::integer<>s.nfl_year or game_record->>'gameType' is distinct from 'REG'
 or game_record->>'week' is null or (game_record->>'week')::integer not between 1 and 18 or game_record->>'gameId' is null
 or game_record->>'awayTeam' is null or game_record->>'homeTeam' is null or game_record->>'awayTeam'=game_record->>'homeTeam'
 or game_record->>'gameDate' is null or extract(year from (game_record->>'gameDate')::date) not in(s.nfl_year,s.nfl_year+1)
 or (game_record->>'scheduledStartAt' is not null and (((game_record->>'scheduledStartAt')::timestamptz at time zone 'America/New_York')::date<>(game_record->>'gameDate')::date
 or ((game_record->>'scheduledStartAt')::timestamptz at time zone 'America/New_York')::time<>(game_record->>'gameTime')::time)) then
 raise exception using errcode='22023',message='Official game identity or season is invalid.';end if;
 end loop;
 select encode(extensions.digest(jsonb_agg(item order by item->>'gameId')::text,'sha256'),'hex') into h from jsonb_array_elements(p_schedule)item;
 update private.season_automation set schedule=p_schedule,schedule_hash=h,schedule_fetched_at=clock_timestamp() where season_id=s.id;
end $$;
