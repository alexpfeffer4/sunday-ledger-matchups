import { expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "./stage1-baseline";
import { quoteSql as q } from "./player-props-acceptance.mjs";

// Reuse the actual Stage 1 worker-created league. All definition changes and
// cutoff inputs below are rolled back within the loopback-only fixture helper.
export function verifyStage2Reads(slug: string, pending: boolean) {
  const before = readFileSync("tests/fixtures/stage2-menu-before.sql", "utf8");
  const after =
    sql(
      "select pg_get_functiondef('private.get_player_prop_menu_before_automation(text)'::regprocedure);",
    ) + ";";
  const subjects = JSON.parse(
    sql(`select jsonb_agg(jsonb_build_object('id',m.user_id,'role',m.role))
    from private.league_memberships m join private.leagues l on l.id=m.league_id where l.slug=${q(slug)};`),
  ) as { id: string; role: string }[];
  const owner = subjects.find((s) => s.role === "COMMISSIONER")!;
  const member = subjects.find((s) => s.role === "MEMBER")!;
  const claims = (id: string) =>
    `select set_config('request.jwt.claims',${q(JSON.stringify({ sub: id, role: "authenticated" }))},true);set local role authenticated;`;
  const statements = [
    "begin; create temporary table stage2_results(label text, value jsonb); grant all on stage2_results to authenticated;",
  ];
  for (const subject of [owner, member]) {
    for (const cutoff of [false, true]) {
      statements.push("savepoint fixture_state;");
      if (cutoff)
        statements.push(`update private.sports_events set actual_started_at=clock_timestamp(),state='LIVE'
        where week_id=(select w.id from private.season_weeks w join private.leagues l on l.id=w.league_id where l.slug=${q(slug)} order by nfl_week desc limit 1);`);
      for (const [version, definition] of [
        ["before", before],
        ["after", after],
      ] as const) {
        statements.push(definition, claims(subject.id));
        statements.push(
          `insert into stage2_results values(${q(`${subject.role}-${cutoff}-${version}`)},api.get_player_prop_menu(${q(slug)}));reset role;`,
        );
      }
      statements.push(`do $$ begin
        if (select value from stage2_results where label=${q(`${subject.role}-${cutoff}-before`)}) is distinct from
           (select value from stage2_results where label=${q(`${subject.role}-${cutoff}-after`)}) then
          raise exception 'Stage 2 menu output changed'; end if;
        ${cutoff ? `if exists(select 1 from stage2_results r cross join lateral jsonb_array_elements(r.value->'slots') s where r.label=${q(`${subject.role}-${cutoff}-after`)} and (s->>'lateFillEligible')::boolean) then raise exception 'Cutoff exposed eligible slot';end if;` : ""}
        end $$; rollback to fixture_state;`);
    }
    statements.push(
      claims(subject.id),
      `do $$ declare full_state jsonb; review jsonb;expected jsonb;begin
      full_state:=api.get_stage1_state(${q(slug)});review:=api.get_card_review_context(${q(slug)});
      expected:=jsonb_build_object('league',jsonb_build_object('id',full_state#>'{league,id}','mode',full_state#>'{league,mode}'),
      'season',jsonb_build_object('rulesetSnapshot',full_state#>'{season,rulesetSnapshot}'),
      'week',jsonb_build_object('state',full_state#>'{week,state}','entryClosed',coalesce(full_state#>'{week,entryClosed}','false'::jsonb)),
      'ownerCard',jsonb_build_object('remainingCredits',full_state#>'{ownerCard,remainingCredits}','allocatedCredits',full_state#>'{ownerCard,allocatedCredits}',
      'positionCount',jsonb_array_length(full_state#>'{ownerCard,positions}')));
      if review is distinct from expected then raise exception 'Review preflight differs from authorized state';end if;
      end $$;reset role;`,
    );
  }
  // A valid identity from another league and an unknown outsider cannot use the
  // new read; anonymous execution is denied at the existing privilege boundary.
  statements.push(`do $$ declare outsider uuid;begin
    select m.user_id into outsider from private.league_memberships m where not exists(
      select 1 from private.league_memberships mine join private.leagues l on l.id=mine.league_id where l.slug=${q(slug)} and mine.user_id=m.user_id) limit 1;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',coalesce(outsider,gen_random_uuid()),'role','authenticated')::text,true);
    begin perform api.get_card_review_context(${q(slug)});raise exception 'Outsider allowed';exception when insufficient_privilege then null;end;
    if has_function_privilege('anon','api.get_card_review_context(text)','execute') or
       has_function_privilege('service_role','api.get_card_review_context(text)','execute') or
       has_function_privilege('authenticated','private.get_player_prop_menu_before_automation(text)','execute') then raise exception 'Read privileges broadened';end if;
    end $$; rollback;`);
  sql(statements.join("\n"));

  const plans: unknown[] = [];
  // Alternating same-process, same-fixture A/B calls avoid attributing runner
  // variance to the SQL change. Cold execution remains separately labeled.
  for (let run = 0; run <= 5; run++) {
    for (const version of run % 2 ? ["after", "before"] : ["before", "after"]) {
      const definition = version === "before" ? before : after;
      const output = sql(`begin;${definition}\n${claims(owner.id)}
        explain (analyze,buffers,verbose,format json) select api.get_player_prop_menu(${q(slug)});rollback;`);
      plans.push({
        version,
        run,
        name: "get_player_prop_menu",
        plan: JSON.parse(output.slice(output.indexOf("["))),
      });
    }
    for (const name of ["get_stage1_state", "get_card_review_context"]) {
      const output = sql(`begin read only;${claims(owner.id)}
        explain (analyze,buffers,verbose,format json) select api.${name}(${q(slug)});rollback;`);
      plans.push({
        version:
          name === "get_stage1_state" ? "before-context" : "after-context",
        run,
        name,
        plan: JSON.parse(output.slice(output.indexOf("["))),
      });
    }
  }
  const sizes = JSON.parse(
    sql(`begin read only;${claims(owner.id)}select jsonb_build_object(
    'menu',octet_length(api.get_player_prop_menu(${q(slug)})::text),
    'fullState',octet_length(api.get_stage1_state(${q(slug)})::text),
    'reviewContext',octet_length(api.get_card_review_context(${q(slug)})::text));rollback;`)
      .split("\n")
      .at(-1)!,
  );
  expect(sizes.reviewContext).toBeLessThan(sizes.fullState);
  writeFileSync(
    `acceptance-reports/stage2-reads-${pending ? "pending" : "complete"}.json`,
    JSON.stringify(
      {
        comparisons:
          "Exact menu equality for commissioner/member before/after kickoff; exact owner review projection; outsider/privilege denial",
        sizes,
        plans,
      },
      null,
      2,
    ),
  );
}
