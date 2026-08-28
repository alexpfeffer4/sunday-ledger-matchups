begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

select has_function(
  'api',
  'update_profile_display_name',
  array['text'],
  'username update RPC is exposed'
);

select function_privs_are(
  'api',
  'update_profile_display_name',
  array['text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot update usernames'
);

select function_privs_are(
  'api',
  'update_profile_display_name',
  array['text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can update their own username'
);

select * from finish();
rollback;
