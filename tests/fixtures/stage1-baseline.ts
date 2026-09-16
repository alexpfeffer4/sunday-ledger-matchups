import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { nflCatalogTeams } from "../../src/adapters/providers/player-catalog-normalizer";
import {
  easternInstant,
  normalizeAutomationSchedule,
} from "../../src/application/automation/schedule";
import { quoteSql as q } from "./player-props-acceptance.mjs";

export function requireDisposable(baseURL: string | undefined) {
  for (const value of [
    baseURL,
    process.env.TEST_SUPABASE_URL,
    process.env.TEST_SUPABASE_DB_URL,
  ]) {
    if (!value || !["localhost", "127.0.0.1"].includes(new URL(value).hostname))
      throw new Error("Stage 1 requires loopback app, Auth and database");
  }
  if (
    process.env.STAGE1_BASELINE !== "1" ||
    !process.env.ODDS_TEST_FIXTURE ||
    !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error("Stage 1 requires isolated provider substitutions");
}
export function sql(statement: string): string {
  requireDisposable("http://127.0.0.1:3000");
  return execFileSync(
    "psql",
    [process.env.TEST_SUPABASE_DB_URL!, "-X", "-v", "ON_ERROR_STOP=1", "-qAt"],
    { input: statement, encoding: "utf8" },
  ).trim();
}
export function client(secret = false) {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    secret
      ? process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!
      : process.env.TEST_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function rpc(
  connection: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await connection.schema("api").rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message}`).toBeNull();
  return result.data;
}
function marked(file: string, marker: string) {
  const result = readFileSync(file, "utf8")
    .split(`-- BEGIN ${marker}`)[1]
    ?.split(`-- END ${marker}`)[0];
  if (!result) throw new Error(`Missing fixture ${marker}`);
  return result;
}
export async function prerequisites(slug: string) {
  const identity = {
    email: `${slug}@acceptance.test`,
    password: `Stage1-${slug}-48!`,
  };
  const admin = client(true);
  const created = await admin.auth.admin.createUser({
    ...identity,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const helpers = [
    marked(
      "supabase/tests/open_week2_props_after_reset.test.sql",
      "AFTER RESET CUTOVER HELPERS",
    ),
    marked(
      "supabase/tests/progressive_player_props.test.sql",
      "PROGRESSIVE PLAYER PROPS HELPERS",
    ),
    readFileSync("supabase/tests/fixtures/season_automation.sql.inc", "utf8"),
  ].join("\n");
  // Prerequisites only: existing approved source policy, standing consent, locked
  // ten-member roster/schedule and preceding Week 2 FINAL. The existing helper
  // retains its historical accept/reset audit. No Week 3 or successful run is seeded.
  const fixture = JSON.parse(
    sql(`begin; ${helpers}
    create temporary table baseline_context as select pg_temp.automation_context(${q(slug)},${q(created.data.user!.id)}::uuid,false) c;
    do $$ declare c jsonb; u uuid; ids uuid[]; matches jsonb; begin
      select baseline_context.c into c from baseline_context;
      -- Use the established postseason fixture's prerequisite construction:
      -- finish the synthetic roster before taking real standing consent.
      update private.seasons set lifecycle='DRAFT',roster_locked_at=null where id=(c->>'season')::uuid;
      for i in 5..10 loop
        u:=gen_random_uuid();
        insert into auth.users(id,email) values(u,u::text||'@acceptance.test');
        insert into private.profiles(id,display_name) values(u,'Baseline member '||i);
        insert into private.league_memberships(league_id,user_id,role) values((c->>'league')::uuid,u,'MEMBER');
        insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak) values((c->>'season')::uuid,(c->>'league')::uuid,u,lpad(i::text,64,'0'));
      end loop;
      update private.seasons set lifecycle='REGULAR',roster_locked_at=clock_timestamp() where id=(c->>'season')::uuid;
      select array_agg(id order by standing_tiebreak) into ids from private.season_entries where season_id=(c->>'season')::uuid;
      select jsonb_agg(jsonb_build_object('week',wk,'sideAEntryId',ids[pair*2-1],'sideBEntryId',ids[pair*2])) into matches from generate_series(1,14)wk cross join generate_series(1,5)pair;
      insert into private.schedule_publications(season_id,league_id,version,algorithm_version,seed,ordered_entry_ids,output_hash,created_by,schedule_json)
      values((c->>'season')::uuid,(c->>'league')::uuid,3,'circle-v1','baseline-fixture',ids,repeat('e',64),(c->>'owner')::uuid,jsonb_build_object('matchups',matches));
      perform api.configure_season_automation(c->>'slug','ENABLE',3,'ALL_NFL_GAMES',private.season_automation_policy_hash());
      perform api.complete_player_catalog_job((c->>'leaseId')::uuid,'PENDING',24,'CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED');
    end $$;
    select c from baseline_context; commit;`),
  );
  const owner = client();
  expect((await owner.auth.signInWithPassword(identity)).error).toBeNull();
  return { fixture, identity, owner, admin };
}

export function providerData(slug: string, pending: boolean) {
  const codes = [
    ...new Map(
      Object.entries(nflCatalogTeams).map(([code, name]) => [name, code]),
    ).values(),
  ];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = new Date(`${today}T12:00Z`);
  // Games on the next Sunday (or Monday evening when Sunday has passed) keep
  // the real Tuesday due calculation. No database clock/function is replaced.
  const untilSunday = (7 - day.getUTCDay()) % 7;
  const selected = new Date(
    day.getTime() + (day.getUTCDay() === 1 ? 0 : untilSunday) * 86400000,
  );
  const rows = [
    "game_id,season,week,game_type,away_team,home_team,gameday,gametime",
  ];
  const year = selected.getUTCFullYear();
  for (let week = 1; week <= 18; week++)
    for (let pair = 0; pair < 16; pair++) {
      if ((week === 9 && pair >= 8) || (week === 10 && pair < 8)) continue;
      const date = new Date(selected.getTime() + (week - 3) * 7 * 86400000)
        .toISOString()
        .slice(0, 10);
      const away = codes[pair * 2],
        home = codes[pair * 2 + 1];
      rows.push(
        `${year}_${String(week).padStart(2, "0")}_${away}_${home},${year},${week},REG,${away},${home},${date},23:00`,
      );
    }
  const scheduleCsv = rows.join("\n");
  const games = normalizeAutomationSchedule(scheduleCsv, year).filter(
    (g) => g.week === 3,
  );
  const roster = [
    "season,team,position,status,gsis_id,espn_id,pfr_id,full_name",
  ];
  codes.forEach((code, i) =>
    ["QB", "RB", "WR"].forEach((position, j) => {
      const id = i * 3 + j + 1;
      roster.push(
        `${year},${code},${position},ACT,00-${String(id).padStart(7, "0")},${10000 + id},Stage${id},${code} Fixture ${position}`,
      );
    }),
  );
  const makeMain = (price = 140) =>
    games.map((g, index) => ({
      id: `${slug}-event-${index}`,
      sport_key: "americanfootball_nfl",
      commence_time: g.scheduledStartAt!,
      away_team: g.awayTeam,
      home_team: g.homeTeam,
      bookmakers: [
        {
          key: "draftkings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: g.awayTeam, price: -160 },
                { name: g.homeTeam, price },
              ],
            },
            {
              key: "spreads",
              outcomes: [
                { name: g.awayTeam, price: -110, point: -3.5 },
                { name: g.homeTeam, price: -110, point: 3.5 },
              ],
            },
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: -110, point: 44.5 },
                { name: "Under", price: -110, point: 44.5 },
              ],
            },
          ].map((m) => ({ ...m, last_update: new Date().toISOString() })),
        },
      ],
    }));
  const main = makeMain();
  const props = Object.fromEntries(
    main.map((event, index) => [
      event.id,
      {
        ...event,
        bookmakers: [
          {
            key: "draftkings",
            markets:
              pending && index >= 10
                ? []
                : [
                    "player_pass_yds",
                    "player_rush_yds",
                    "player_reception_yds",
                  ].map((family, j) => ({
                    key: family,
                    last_update: new Date().toISOString(),
                    outcomes: [event.away_team, event.home_team].flatMap(
                      (team) =>
                        ["Over", "Under"].map((name) => ({
                          name,
                          description: `${codes.find((code) => nflCatalogTeams[code] === team)} Fixture ${["QB", "RB", "WR"][j]}`,
                          price: -110,
                          point: [250.5, 80.5, 65.5][j],
                        })),
                    ),
                  })),
          },
        ],
      },
    ]),
  );
  const file = process.env.ODDS_TEST_FIXTURE!;
  writeFileSync(
    `${file}.nflverse`,
    JSON.stringify({ scheduleCsv, rosterCsv: roster.join("\n") }),
  );
  writeFileSync(
    `${file}.props`,
    JSON.stringify({ events: props, remaining: 19900, used: 100 }),
  );
  writeFileSync(`${file}.calls`, "");
  const writeMain = (price = 140, omit = false, delayMs = 0) =>
    writeFileSync(
      file,
      JSON.stringify({
        payload: omit ? makeMain(price).slice(0, -1) : makeMain(price),
        remaining: 19900,
        used: 100,
        last: 3,
        delayMs,
      }),
    );
  writeMain();
  return {
    year,
    scheduleCsv,
    main,
    writeMain,
    opensAt: easternInstant(
      new Date(selected.getTime() - ((selected.getUTCDay() + 5) % 7) * 86400000)
        .toISOString()
        .slice(0, 10),
      "10:00",
    ),
  };
}
export async function signIn(
  page: Page,
  identity: { email: string; password: string },
  path: string,
) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**${path}`);
}
