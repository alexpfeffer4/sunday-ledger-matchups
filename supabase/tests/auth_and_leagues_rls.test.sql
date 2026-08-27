begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('private', 'profiles', 'profiles table exists');
select has_table('private', 'league_memberships', 'memberships table exists');
select has_function('api', 'ensure_profile', array['text'], 'ensure_profile is exposed');
select has_function('api', 'join_league', array['text'], 'join_league is exposed');

select policies_are(
  'private',
  'profiles',
  array['profiles_insert_self', 'profiles_select_same_league', 'profiles_update_self'],
  'profiles has only reviewed policies'
);

select policies_are(
  'private',
  'leagues',
  array['leagues_select_member'],
  'leagues is read-only through membership'
);

select policies_are(
  'private',
  'league_memberships',
  array['memberships_select_same_league'],
  'memberships is read-only within the league'
);

select policies_are(
  'private',
  'league_invites',
  array[]::text[],
  'invite hashes have no direct participant policy'
);

select table_privs_are(
  'private',
  'league_invites',
  'authenticated',
  array[]::text[],
  'authenticated has no direct invite privileges'
);

select table_privs_are(
  'private',
  'leagues',
  'authenticated',
  array['SELECT'],
  'authenticated can only select league rows allowed by RLS'
);

select function_privs_are(
  'api',
  'join_league',
  array['text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot execute join_league'
);

select function_privs_are(
  'api',
  'join_league',
  array['text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can execute join_league'
);

select * from finish();
rollback;
