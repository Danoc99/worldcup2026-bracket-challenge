import fs from "fs";
import assert from "assert";
import { ordersFromStandings, ordersFromMatches, matchesFromFeed } from "../functions/_lib/transform.js";
import { CANONICAL_TEAMS } from "../functions/_lib/teamMap.js";
import { onRequestPost as submitEntry } from "../functions/api/entry.js";
import { onRequestPost as adminPost } from "../functions/api/admin.js";
import { onRequestGet as stateGet } from "../functions/api/state.js";
import { LOCK_ISO, hashStr } from "../functions/_lib/util.js";
import { tallyPicks } from "../src/data.js";

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

// 7) tallyPicks — contrarian/consensus tallies feed the post-lock UI.
//    Empty/missing inputs must not throw; counts must be slot-accurate per group.
{
  const t = tallyPicks([]);
  ok("tallyPicks([]) total === 0", t.total === 0);
  ok("tallyPicks([]) seeds all 12 groups", Object.keys(GROUPS).every((g) => Array.isArray(t[g]) && t[g].length === 4));
  ok("tallyPicks([]) empty buckets", Object.keys(t.A[0]).length === 0);
}
{
  const t = tallyPicks(null);
  ok("tallyPicks(null) total === 0", t.total === 0);
}
{
  // Three players, all picking Brazil 1st in C; two picking Morocco 2nd, one picking Scotland 2nd.
  // Player without predictions for C still counts toward total but not toward C's buckets.
  const e1 = { name: "a", predictions: { C: ["Brazil", "Morocco", "Scotland", "Haiti"] } };
  const e2 = { name: "b", predictions: { C: ["Brazil", "Morocco", "Haiti", "Scotland"] } };
  const e3 = { name: "c", predictions: { C: ["Brazil", "Scotland", "Morocco", "Haiti"] } };
  const t = tallyPicks([e1, e2, e3]);
  ok("tallyPicks total counts entries", t.total === 3);
  ok("tallyPicks: 3/3 picked Brazil 1st in C", t.C[0]["Brazil"] === 3);
  ok("tallyPicks: 2/3 picked Morocco 2nd in C", t.C[1]["Morocco"] === 2);
  ok("tallyPicks: 1/3 picked Scotland 2nd in C", t.C[1]["Scotland"] === 1);
  ok("tallyPicks: untouched group has empty buckets", Object.keys(t.A[0]).length === 0);
}
{
  // Entry with no predictions object is excluded from total — the "X of N picked"
  // denominator should be people who could have picked, not no-shows.
  const t = tallyPicks([{ name: "x" }, { name: "y", predictions: { A: ["Mexico", "Czechia", "South Korea", "South Africa"] } }]);
  ok("tallyPicks: missing-predictions entries excluded from total", t.total === 1);
  ok("tallyPicks: entries with picks fill buckets", t.A[0]["Mexico"] === 1);
}

// 8) matchesFromFeed — Matches tab needs every status (not just FINISHED),
//    sorted chronologically, with scores ONLY on FINISHED matches.
{
  const feed = {
    matches: [
      // Out of order on purpose to test the sort.
      { id: 2, utcDate: "2026-06-12T19:00:00Z", stage: "GROUP_STAGE", group: "GROUP_B", status: "SCHEDULED",
        homeTeam: { name: "Canada", tla: "CAN" }, awayTeam: { name: "Switzerland", tla: "SUI" } },
      { id: 1, utcDate: "2026-06-11T20:00:00Z", stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "South Korea", tla: "KOR" },
        score: { fullTime: { home: 2, away: 1 } } },
      { id: 3, utcDate: "2026-06-13T18:00:00Z", stage: "GROUP_STAGE", group: "GROUP_C", status: "TIMED",
        homeTeam: { name: "Brazil", tla: "BRA" }, awayTeam: { name: "Scotland", tla: "SCO" } },
    ],
  };
  const { matches, unmapped } = matchesFromFeed(feed);
  ok("matchesFromFeed: includes all 3 statuses (FINISHED+SCHEDULED+TIMED)", matches.length === 3);
  ok("matchesFromFeed: sorted ascending by utcDate", matches[0].id === 1 && matches[1].id === 2 && matches[2].id === 3);
  ok("matchesFromFeed: FINISHED carries final score", matches[0].homeScore === 2 && matches[0].awayScore === 1);
  ok("matchesFromFeed: non-FINISHED has null score", matches[1].homeScore === null && matches[2].homeScore === null);
  ok("matchesFromFeed: strips GROUP_ prefix from group letter", matches[0].group === "A" && matches[1].group === "B");
  ok("matchesFromFeed: nothing unmapped for canonical names", unmapped.length === 0);
}

// Skip matches with an unmappable team — better to drop the row than render
// gibberish, since admins have no per-match override.
{
  const feed = {
    matches: [
      { id: 1, utcDate: "2026-06-11T20:00:00Z", status: "FINISHED",
        homeTeam: { name: "Wakanda" }, awayTeam: { name: "Mexico", tla: "MEX" },
        score: { fullTime: { home: 0, away: 3 } } },
      { id: 2, utcDate: "2026-06-12T20:00:00Z", status: "FINISHED",
        homeTeam: { name: "Canada", tla: "CAN" }, awayTeam: { name: "Switzerland", tla: "SUI" },
        score: { fullTime: { home: 1, away: 1 } } },
    ],
  };
  const { matches, unmapped } = matchesFromFeed(feed);
  ok("matchesFromFeed: drops match with unmappable team", matches.length === 1 && matches[0].id === 2);
  ok("matchesFromFeed: reports the unmapped name", unmapped.includes("Wakanda"));
}

// Empty / missing inputs must not throw.
{
  const a = matchesFromFeed(null);
  const b = matchesFromFeed({});
  const c = matchesFromFeed({ matches: [] });
  ok("matchesFromFeed(null) safe", a.matches.length === 0);
  ok("matchesFromFeed({}) safe", b.matches.length === 0);
  ok("matchesFromFeed({matches:[]}) safe", c.matches.length === 0);
}

// 9) admin.js setMatchScore — safeguard for FINISHED matches that arrive
//    from the feed with null scores, or admin corrections to a wrong score.
//    Writes to a new KV key `manualMatchScores` keyed by football-data match id.
{
  const ADMIN_PW = "letmein";
  function makePool(seed = {}) {
    const kv = { config: { poolName: "p", adminHash: hashStr(ADMIN_PW), createdAt: 0 }, ...seed };
    return {
      get: async (k, t) => { const v = kv[k] ?? null; return t === "json" || v == null ? v : JSON.stringify(v); },
      put: async (k, v) => { kv[k] = JSON.parse(v); },
      delete: async (k) => { delete kv[k]; },
      _kv: kv,
    };
  }
  async function adminCall(POOL, body) {
    const req = new Request("http://x/api/admin", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const res = await adminPost({ request: req, env: { POOL } });
    return { status: res.status, payload: await res.json() };
  }

  // Wrong password is rejected before any KV write.
  {
    const POOL = makePool();
    const r = await adminCall(POOL, { adminPassword: "nope", action: "setMatchScore", matchId: 537327, home: 2, away: 1 });
    ok("setMatchScore: wrong password → 403", r.status === 403);
    ok("setMatchScore: wrong password → no KV write", POOL._kv.manualMatchScores === undefined);
  }
  // Valid write persists under the match id.
  {
    const POOL = makePool();
    const r = await adminCall(POOL, { adminPassword: ADMIN_PW, action: "setMatchScore", matchId: 537327, home: 2, away: 1 });
    ok("setMatchScore: valid write → 200", r.status === 200 && r.payload.ok === true);
    ok("setMatchScore: persisted under id", POOL._kv.manualMatchScores?.["537327"]?.home === 2);
    ok("setMatchScore: persisted away score", POOL._kv.manualMatchScores?.["537327"]?.away === 1);
  }
  // Bad payloads rejected (non-integer, negative, missing id).
  {
    const POOL = makePool();
    const bad1 = await adminCall(POOL, { adminPassword: ADMIN_PW, action: "setMatchScore", matchId: 0, home: 1, away: 0 });
    const bad2 = await adminCall(POOL, { adminPassword: ADMIN_PW, action: "setMatchScore", matchId: 1, home: -1, away: 0 });
    const bad3 = await adminCall(POOL, { adminPassword: ADMIN_PW, action: "setMatchScore", matchId: 1, home: 1.5, away: 0 });
    ok("setMatchScore: rejects matchId 0", bad1.status === 400);
    ok("setMatchScore: rejects negative score", bad2.status === 400);
    ok("setMatchScore: rejects non-integer score", bad3.status === 400);
  }
  // Empty/null clears the override for that match without disturbing others.
  {
    const POOL = makePool({ manualMatchScores: { "1": { home: 2, away: 1 }, "2": { home: 0, away: 0 } } });
    const r = await adminCall(POOL, { adminPassword: ADMIN_PW, action: "setMatchScore", matchId: 1, home: "", away: "" });
    ok("setMatchScore: clear → 200 with cleared:true", r.status === 200 && r.payload.cleared === true);
    ok("setMatchScore: cleared entry removed", POOL._kv.manualMatchScores["1"] === undefined);
    ok("setMatchScore: other entries untouched", POOL._kv.manualMatchScores["2"]?.home === 0);
  }
}

// 10) state.js — admin manualMatchScores overlay merges onto feed matches by id.
//     Override always wins, including over a non-null feed score. Matches with
//     no override pass through untouched. Achieved by prepopulating the
//     fd.js caches (cache:standings, cache:matches) so state.js never fetches.
{
  const now = Date.now();
  function makeStatePool(seed = {}) {
    const kv = {
      config: { poolName: "p", adminHash: "x", createdAt: 0 },
      "cache:standings": { groups: {}, unmapped: [], fetchedAt: now },
      "cache:matches": {
        matches: [
          { id: 100, utcDate: "2026-06-11T19:00:00Z", group: "A", status: "FINISHED", home: "Mexico", away: "South Africa", homeScore: null, awayScore: null },
          { id: 101, utcDate: "2026-06-12T19:00:00Z", group: "B", status: "FINISHED", home: "Canada",  away: "Switzerland",  homeScore: 1,    awayScore: 0 },
          { id: 102, utcDate: "2026-06-13T19:00:00Z", group: "C", status: "SCHEDULED", home: "Brazil", away: "Scotland",     homeScore: null, awayScore: null },
        ],
        unmapped: [], fetchedAt: now,
      },
      ...seed,
    };
    return {
      get: async (k, t) => { const v = kv[k] ?? null; return t === "json" || v == null ? v : JSON.stringify(v); },
      put: async (k, v) => { kv[k] = JSON.parse(v); },
      delete: async (k) => { delete kv[k]; },
      list: async () => ({ keys: [] }),
    };
  }
  async function callState(POOL) {
    const res = await stateGet({ env: { POOL } });
    return await res.json();
  }

  // No overrides → matches pass through untouched.
  {
    const s = await callState(makeStatePool());
    ok("state overlay: no override → match untouched", s.matches.find((m) => m.id === 100).homeScore === null);
    ok("state overlay: no override → scoreSource absent", s.matches.find((m) => m.id === 101).scoreSource === undefined);
  }
  // Override fills a null feed score (the safeguard case).
  {
    const s = await callState(makeStatePool({ manualMatchScores: { "100": { home: 2, away: 1 } } }));
    const m = s.matches.find((x) => x.id === 100);
    ok("state overlay: override fills null feed score", m.homeScore === 2 && m.awayScore === 1);
    ok("state overlay: override flagged with scoreSource:admin", m.scoreSource === "admin");
  }
  // Override wins over a non-null feed score (admin correction).
  {
    const s = await callState(makeStatePool({ manualMatchScores: { "101": { home: 3, away: 3 } } }));
    const m = s.matches.find((x) => x.id === 101);
    ok("state overlay: override beats feed score", m.homeScore === 3 && m.awayScore === 3);
  }
  // Override for an id not in the feed is ignored (no match to attach to).
  {
    const s = await callState(makeStatePool({ manualMatchScores: { "999": { home: 5, away: 5 } } }));
    ok("state overlay: phantom-id override doesn't add a match", s.matches.length === 3);
    ok("state overlay: phantom-id override doesn't mutate others", s.matches.every((m) => m.scoreSource === undefined));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
