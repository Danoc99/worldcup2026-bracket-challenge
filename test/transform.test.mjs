import fs from "fs";
import assert from "assert";
import { ordersFromStandings, ordersFromMatches } from "../functions/_lib/transform.js";
import { CANONICAL_TEAMS } from "../functions/_lib/teamMap.js";
import { onRequestPost as submitEntry } from "../functions/api/entry.js";
import { LOCK_ISO } from "../functions/_lib/util.js";

// Our canonical groups (must match the front end)
const GROUPS = {
  A: ["Mexico", "South Korea", "South Africa", "Czechia"],
  B: ["Canada", "Switzerland", "Qatar", "Bosnia and Herzegovina"],
  C: ["Brazil", "Scotland", "Morocco", "Haiti"],
  D: ["United States", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Ecuador", "Ivory Coast", "Curaçao"],
  F: ["Netherlands", "Japan", "Tunisia", "Sweden"],
  G: ["Belgium", "Iran", "Egypt", "New Zealand"],
  H: ["Spain", "Uruguay", "Saudi Arabia", "Cape Verde"],
  I: ["France", "Norway", "Senegal", "Iraq"],
  J: ["Argentina", "Austria", "Algeria", "Jordan"],
  K: ["Portugal", "Colombia", "Uzbekistan", "DR Congo"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name); } };

// 1) Every canonical team appears in exactly one group (sanity of our own data)
const allCanon = Object.values(GROUPS).flat();
ok("48 teams total", allCanon.length === 48);
ok("48 unique teams", new Set(allCanon).size === 48);
ok("teamMap knows all 48", allCanon.every((t) => CANONICAL_TEAMS.includes(t)));

// 2) Transform the realistic (tricky-name) API payload
const json = JSON.parse(fs.readFileSync(new URL("./fixtures/wc-standings.json", import.meta.url)));
const { groups, unmapped } = ordersFromStandings(json);

ok("no unmapped team names", unmapped.length === 0);
if (unmapped.length) console.log("    unmapped:", [...new Set(unmapped)]);

ok("all 12 groups parsed", Object.keys(groups).length === 12);

// 3) Each parsed group contains exactly the 4 correct teams (as a set)
for (const L of Object.keys(GROUPS)) {
  const got = groups[L]?.order || [];
  const same = got.length === 4 && new Set(got).size === 4 &&
    [...got].sort().join("|") === [...GROUPS[L]].sort().join("|");
  ok(`group ${L} maps to correct 4 teams`, same);
}

// 4) Status detection: A finished (3 games), others live (2 games)
ok("group A detected final", groups.A?.status === "final");
ok("group B detected live", groups.B?.status === "live");

// 4b) Pending detection — pre-kickoff feeds report 0 playedGames for every team.
//     ordersFromStandings should mark the group "pending" so the UI hides the
//     seed/draw order instead of projecting nonsense points from it.
{
  const pendingFeed = {
    standings: [{
      group: "GROUP_A", type: "TOTAL",
      table: [
        { position: 1, team: { name: "Mexico", tla: "MEX" }, playedGames: 0 },
        { position: 2, team: { name: "South Korea", tla: "KOR" }, playedGames: 0 },
        { position: 3, team: { name: "South Africa", tla: "RSA" }, playedGames: 0 },
        { position: 4, team: { name: "Czechia", tla: "CZE" }, playedGames: 0 },
      ],
    }],
  };
  const { groups: g } = ordersFromStandings(pendingFeed);
  ok("ordersFromStandings: 0/0/0/0 played → pending", g.A?.status === "pending");
  ok("ordersFromStandings: pending still emits 4-team order", g.A?.order?.length === 4);
}

// Regression guard: if even one team has played, the group is live (not pending).
{
  const liveFeed = {
    standings: [{
      group: "GROUP_A", type: "TOTAL",
      table: [
        { position: 1, team: { name: "Mexico", tla: "MEX" }, playedGames: 1 },
        { position: 2, team: { name: "South Korea", tla: "KOR" }, playedGames: 0 },
        { position: 3, team: { name: "South Africa", tla: "RSA" }, playedGames: 1 },
        { position: 4, team: { name: "Czechia", tla: "CZE" }, playedGames: 0 },
      ],
    }],
  };
  const { groups: g } = ordersFromStandings(liveFeed);
  ok("ordersFromStandings: any team played → live", g.A?.status === "live");
}

// Fallback path (ordersFromMatches) should also flag all-scheduled groups pending.
{
  const scheduledMatches = {
    matches: [
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "SCHEDULED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "South Korea", tla: "KOR" } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "SCHEDULED",
        homeTeam: { name: "South Africa", tla: "RSA" }, awayTeam: { name: "Czechia", tla: "CZE" } },
    ],
  };
  const { groups: g } = ordersFromMatches(scheduledMatches);
  ok("ordersFromMatches: all SCHEDULED → pending", g.A?.status === "pending");
}

// 5) Scoring matrix sanity (mirrors front end)
const M = [[25,15,5,0],[15,20,5,0],[5,5,15,0],[0,0,0,0]];
function scoreGroup(pred, actual) {
  let p = 0;
  for (let a = 0; a < 4; a++) { const i = pred.indexOf(actual[a]); if (i >= 0) p += M[a][i]; }
  return p;
}
const actual = ["Türkiye", "United States", "Australia", "Paraguay"];
ok("perfect group = 60", scoreGroup(["Türkiye","United States","Australia","Paraguay"], actual) === 60);
ok("swapped top two (3rd/4th exact) = 45", scoreGroup(["United States","Türkiye","Australia","Paraguay"], actual) === 45);
// Pitfall: 4th place must never contribute points.
ok("4th-place row is all zeros", M[3].every((v) => v === 0));
// Scrambled top three, correct 4th -> scores only the top-three partial credit, nothing for the 4th.
ok("scrambled top 3 + correct 4th = 25",
   scoreGroup(["United States","Australia","Türkiye","Paraguay"], actual) === 25);

// 6) entry.js — lock behavior. After LOCK_ISO, reject BOTH new entries and edits.
const LOCK_MS = new Date(LOCK_ISO).getTime();
const validPreds = Object.fromEntries(Object.entries(GROUPS).map(([L, arr]) => [L, [...arr]]));

async function postEntry({ body, kvData = {}, now }) {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const POOL = {
      get: async (k) => kvData[k] ?? null,
      put: async (k, v) => { kvData[k] = JSON.parse(v); },
    };
    const req = new Request("http://x/api/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await submitEntry({ request: req, env: { POOL } });
    return { status: res.status, payload: await res.json(), kvData };
  } finally {
    Date.now = realNow;
  }
}

const baseBody = { name: "Daniel", pin: "1234", predictions: validPreds };

// before lock: new entry accepted (sanity)
{
  const r = await postEntry({ body: baseBody, now: LOCK_MS - 1000 });
  ok("before lock: new entry accepted (200)", r.status === 200 && r.payload.ok === true);
  ok("before lock: entry written to KV", !!r.kvData["entry:daniel"]);
}

// after lock: new entry rejected (the fix for task 2)
{
  const r = await postEntry({ body: baseBody, now: LOCK_MS + 1000 });
  ok("after lock: new entry rejected (423)", r.status === 423);
  ok("after lock: no KV write for new entry", !r.kvData["entry:daniel"]);
}

// after lock: edits to existing entries still rejected (regression guard)
{
  const kvData = { "entry:daniel": { name: "Daniel", pin: "1234", predictions: validPreds, updatedAt: 0 } };
  const r = await postEntry({ body: baseBody, kvData, now: LOCK_MS + 1000 });
  ok("after lock: edit rejected (423)", r.status === 423);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
