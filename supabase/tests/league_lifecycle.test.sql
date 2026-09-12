begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column(
  'private',
  'leagues',
  'archived_at',
  'leagues record their archive state'
);

select has_column('api', 'my_leagues', 'archived_at', 'league list exposes archive state');
select has_column('api', 'my_leagues', 'can_delete', 'league list exposes safe delete eligibility');
select has_column('api', 'my_leagues', 'member_count', 'league list exposes member count');

select has_index(
  'private',
  'league_memberships',
  'league_memberships_one_commissioner_idx',
  'a league can have at most one commissioner'
);

select has_function('api', 'rename_league', array['text', 'text']);
select has_function('api', 'set_league_archived', array['text', 'boolean']);
select has_function('api', 'delete_empty_draft_league', array['text', 'text']);
select has_function('api', 'remove_league_member', array['text', 'uuid']);
select has_function('api', 'leave_league', array['text']);
select has_function('api', 'transfer_league_commissioner', array['text', 'uuid']);

select function_privs_are('api', 'rename_league', array['text', 'text'], 'anon', array[]::text[]);
select function_privs_are('api', 'rename_league', array['text', 'text'], 'authenticated', array['EXECUTE']);
select function_privs_are('api', 'set_league_archived', array['text', 'boolean'], 'anon', array[]::text[]);
select function_privs_are('api', 'set_league_archived', array['text', 'boolean'], 'authenticated', array['EXECUTE']);
select function_privs_are('api', 'delete_empty_draft_league', array['text', 'text'], 'anon', array[]::text[]);
select function_privs_are('api', 'delete_empty_draft_league', array['text', 'text'], 'authenticated', array['EXECUTE']);
select function_privs_are('api', 'remove_league_member', array['text', 'uuid'], 'anon', array[]::text[]);
select function_privs_are('api', 'remove_league_member', array['text', 'uuid'], 'authenticated', array['EXECUTE']);
select function_privs_are('api', 'leave_league', array['text'], 'anon', array[]::text[]);
select function_privs_are('api', 'leave_league', array['text'], 'authenticated', array['EXECUTE']);
select function_privs_are('api', 'transfer_league_commissioner', array['text', 'uuid'], 'anon', array[]::text[]);
select function_privs_are('api', 'transfer_league_commissioner', array['text', 'uuid'], 'authenticated', array['EXECUTE']);

-- Exercise the guard, not just its existence/grants. Its old SQL body still
-- referred to live_season_archives after the Phase 8B table rename.
select function_privs_are('private', 'can_delete_empty_draft_league', array['uuid'], 'anon', array[]::text[], 'anonymous clients cannot invoke the private eligibility helper');
select function_privs_are('private', 'can_delete_empty_draft_league', array['uuid'], 'authenticated', array[]::text[], 'members cannot invoke the private eligibility helper');
select is(private.can_delete_empty_draft_league(gen_random_uuid()), false, 'anonymous eligibility read is false without an undefined-table error');

insert into auth.users(id,email) values
 ('76000000-0000-4000-8000-000000000001','lifecycle-owner@example.test'),
 ('76000000-0000-4000-8000-000000000002','lifecycle-outsider@example.test');
insert into private.profiles(id,display_name) values
 ('76000000-0000-4000-8000-000000000001','Lifecycle Owner'),
 ('76000000-0000-4000-8000-000000000002','Lifecycle Outsider');
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table empty_draft as select league_id,season_id from api.create_league(
 p_name=>'Untouched Draft',p_slug=>'untouched-delete-test',p_mode=>'LIVE',p_nfl_year=>2026);
select is((select private.can_delete_empty_draft_league(league_id) from empty_draft),true,'an untouched one-member draft is eligible');
select is((select can_delete from api.my_leagues where slug='untouched-delete-test'),true,'the actual league-list view computes eligibility after the archive rename');
select throws_ok($$select api.delete_empty_draft_league('untouched-delete-test','Wrong name')$$,'22023','League name confirmation does not match.','exact name confirmation remains required');
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select api.delete_empty_draft_league('untouched-delete-test','Untouched Draft')$$,'42501','Commissioner membership required.','an outsider cannot delete an eligible draft');
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(api.delete_empty_draft_league('untouched-delete-test','Untouched Draft'),true,'the owner can delete an untouched draft through the real API');
select is((select count(*) from private.leagues where id=(select league_id from empty_draft)),0::bigint,'the eligible draft is removed');

create temporary table joined_draft as select league_id,season_id from api.create_league(
 p_name=>'Joined Draft',p_slug=>'joined-delete-test',p_mode=>'LIVE',p_nfl_year=>2026);
insert into private.league_memberships(league_id,user_id,role)
 select league_id,'76000000-0000-4000-8000-000000000002','MEMBER' from joined_draft;
select is((select private.can_delete_empty_draft_league(league_id) from joined_draft),false,'a second member prevents deletion');
select is((select can_delete from api.my_leagues where slug='joined-delete-test'),false,'league-list eligibility preserves the joined-draft boundary');
select throws_ok($$select api.delete_empty_draft_league('joined-delete-test','Joined Draft')$$,'55000','Only an untouched one-member Draft league can be deleted. Archive this league instead.','the real API rejects a joined draft cleanly');
select is((select count(*) from private.league_memberships where league_id=(select league_id from joined_draft)),2::bigint,'denied deletion preserves both memberships');
select is((select count(*) from private.seasons where id=(select season_id from joined_draft)),1::bigint,'denied deletion preserves the season');

select * from finish();
rollback;
