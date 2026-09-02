begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'api', 'get_my_command_receipt', array['text', 'text'],
  'a caller can reconcile only their own stable command result'
);
select has_function(
  'api', 'create_league_invite_retry_safe',
  array['uuid', 'integer', 'integer', 'text'],
  'invitation creation has a retry-safe command boundary'
);

select function_privs_are(
  'private', 'guard_stage1_roster_membership', array[]::text[],
  'authenticated', array[]::text[],
  'authenticated callers cannot execute the roster trigger helper'
);
select function_privs_are(
  'private', 'stage1_season_time', array['uuid'],
  'authenticated', array[]::text[],
  'authenticated callers cannot execute the private season clock helper'
);
select function_privs_are(
  'private', 'recompute_stage1_week', array['uuid', 'uuid'],
  'authenticated', array[]::text[],
  'authenticated callers cannot execute the private recomputation helper'
);
select function_privs_are(
  'private', 'guard_stage1_roster_membership', array[]::text[],
  'anon', array[]::text[],
  'anonymous callers cannot execute the roster trigger helper'
);
select function_privs_are(
  'private', 'stage1_season_time', array['uuid'],
  'anon', array[]::text[],
  'anonymous callers cannot execute the private season clock helper'
);
select function_privs_are(
  'private', 'recompute_stage1_week', array['uuid', 'uuid'],
  'anon', array[]::text[],
  'anonymous callers cannot execute the private recomputation helper'
);
select ok(
  not exists (
    select 1
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    cross join lateral aclexplode(
      coalesce(proc.proacl, acldefault('f', proc.proowner))
    ) as acl
    where namespace.nspname = 'private'
      and proc.proname in (
        'guard_stage1_roster_membership',
        'stage1_season_time',
        'recompute_stage1_week'
      )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no default execute grant on the confirmed private helpers'
);

select function_privs_are(
  'api', 'get_my_command_receipt', array['text', 'text'],
  'anon', array[]::text[],
  'anonymous callers cannot inspect command results'
);
select function_privs_are(
  'api', 'get_my_command_receipt', array['text', 'text'],
  'authenticated', array['EXECUTE'],
  'authenticated callers can reconcile their own command results'
);
select function_privs_are(
  'api', 'create_league_invite', array['uuid', 'timestamp with time zone', 'integer'],
  'authenticated', array[]::text[],
  'the non-retry-safe invitation command is retired'
);
select function_privs_are(
  'api', 'create_league_invite_retry_safe',
  array['uuid', 'integer', 'integer', 'text'],
  'authenticated', array['EXECUTE'],
  'authenticated commissioners can use retry-safe invitation creation'
);

insert into auth.users (id, email)
values
  ('f1000000-0000-4000-8000-000000000001', 'reliability-commissioner@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'reliability-outsider@example.test');
insert into private.profiles (id, display_name)
values
  ('f1000000-0000-4000-8000-000000000001', 'Reliability Commissioner'),
  ('f1000000-0000-4000-8000-000000000002', 'Reliability Outsider');
insert into private.leagues (id, name, slug, created_by)
values (
  'f2000000-0000-4000-8000-000000000001',
  'Reliability Test',
  'reliability-test',
  'f1000000-0000-4000-8000-000000000001'
);
insert into private.league_memberships (league_id, user_id, role)
values (
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'COMMISSIONER'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temporary table reliability_receipts as
select api.create_league_invite_retry_safe(
  'f2000000-0000-4000-8000-000000000001',
  7,
  3,
  'op:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as first_result;

alter table reliability_receipts add column replay_result jsonb;
update reliability_receipts
set replay_result = api.create_league_invite_retry_safe(
  'f2000000-0000-4000-8000-000000000001',
  7,
  3,
  'op:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);

select is(
  (select replay_result ->> 'token' from reliability_receipts),
  (select first_result ->> 'token' from reliability_receipts),
  'a lost-response retry returns the original private invitation token'
);
select is(
  (select replay_result ->> 'replayed' from reliability_receipts),
  'true',
  'the retry is explicitly identified as the original completed command'
);
select is(
  (select count(*) from private.league_invites
   where league_id = 'f2000000-0000-4000-8000-000000000001'),
  1::bigint,
  'retrying invitation creation does not duplicate invitations'
);
select is(
  (select count(*) from private.command_receipts
   where league_id = 'f2000000-0000-4000-8000-000000000001'
     and command_name = 'CREATE_LEAGUE_INVITE'),
  1::bigint,
  'retrying invitation creation does not duplicate command receipts'
);
select is(
  api.get_my_command_receipt(
    'CREATE_LEAGUE_INVITE',
    'op:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ) ->> 'token',
  (select first_result ->> 'token' from reliability_receipts),
  'the commissioner can recover the original authoritative result after reload'
);
select throws_ok(
  $$select api.create_league_invite_retry_safe(
    'f2000000-0000-4000-8000-000000000001',
    14,
    3,
    'op:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )$$,
  '22000',
  'Idempotency key was reused with a different request.',
  'changed reviewed inputs cannot reuse an ambiguous operation key'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  api.get_my_command_receipt(
    'CREATE_LEAGUE_INVITE',
    'op:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  null::jsonb,
  'another authenticated user cannot recover the commissioner private token'
);

select * from finish();
rollback;
