-- Read-only verification of this release; no worker, data or policy mutation.
select count(*)=2 and coalesce(bool_and(
 encode(extensions.digest(p.prosrc,'sha256'),'hex')=expected.hash
 and p.prosecdef and p.provolatile='s' and p.prorettype='jsonb'::regtype
 and p.pronargdefaults=0 and p.proconfig=array['search_path=""']
 and has_function_privilege('authenticated',p.oid,'execute')=expected.member_access
 and not has_function_privilege('anon',p.oid,'execute')
 and not has_function_privilege('service_role',p.oid,'execute')
),false) as matches_stage2_read_release
from (values
  ('private.get_player_prop_menu_before_automation(text)','05b16297f8452ebd9485e6202f7f3a0204c7761977371621b6bd049e1a6fc267',false),
  ('api.get_card_review_context(text)','3ccc72a2439e17e2a31eac78c5bd930adb2aa2193e1844417f26939a71e0b801',true)
) expected(signature,hash,member_access)
join pg_proc p on p.oid=to_regprocedure(expected.signature);
