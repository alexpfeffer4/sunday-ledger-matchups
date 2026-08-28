begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

select has_function(
  'api',
  'get_league_invite_preview',
  array['text'],
  'private invitation preview RPC is exposed'
);

select has_function(
  'api',
  'list_league_invites',
  array['text'],
  'commissioner invitation list RPC is exposed'
);

select has_function(
  'api',
  'revoke_league_invite',
  array['uuid', 'uuid'],
  'commissioner invitation revocation RPC is exposed'
);

select function_privs_are(
  'api',
  'get_league_invite_preview',
  array['text'],
  'anon',
  array['EXECUTE'],
  'anonymous visitors can preview a valid private invitation'
);

select function_privs_are(
  'api',
  'get_league_invite_preview',
  array['text'],
  'authenticated',
  array['EXECUTE'],
  'signed-in visitors can preview a valid private invitation'
);

select function_privs_are(
  'api',
  'list_league_invites',
  array['text'],
  'anon',
  array[]::text[],
  'anonymous visitors cannot list league invitations'
);

select function_privs_are(
  'api',
  'list_league_invites',
  array['text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated commissioners can request their invitation list'
);

select function_privs_are(
  'api',
  'revoke_league_invite',
  array['uuid', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous visitors cannot revoke invitations'
);

select function_privs_are(
  'api',
  'revoke_league_invite',
  array['uuid', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated commissioners can request invitation revocation'
);

select * from finish();
rollback;
