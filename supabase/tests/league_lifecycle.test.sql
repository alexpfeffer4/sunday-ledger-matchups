begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

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

select * from finish();
rollback;
