-- Read-only release check. A single true row is required. No worker or provider
-- is invoked, and no installed function, setting, consent or row is changed.
select coalesce(bool_and(
 encode(extensions.digest(p.prosrc,'sha256'),'hex')='b1a3280051b6a95ef4d141237e19c3fc7346bda22c413c1f10b5102c1f14690c'
 and p.prosecdef and p.provolatile='v' and p.prorettype='uuid'::regtype
 and p.pronargdefaults=0 and p.proconfig=array['search_path=""']
 and has_function_privilege('service_role',p.oid,'execute')
 and not has_function_privilege('anon',p.oid,'execute')
 and not has_function_privilege('authenticated',p.oid,'execute')
),false) as matches_stage1_preparation_release
from pg_proc p where p.oid=to_regprocedure('api.claim_season_automation_odds(uuid)');
