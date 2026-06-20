import fs from "fs";
import assert from "assert";
import {
  ordersFromStandings, ordersFromMatches, matchesFromFeed,
  clinchedPositions, clinchedPositionsHTH, buildH2H, groupRemainingMatches, movementVsPrev,
  rankPlayers, playerMovementBetween,
} from "../functions/_lib/transform.js";
import { CANONICAL_TEAMS } from "../functions/_lib/teamMap.js";
import { onRequestPost as submitEntry } from "../functions/api/entry.js";
import { onRequestPost as adminPost } from "../functions/api/admin.js";
import { onRequestGet as stateGet } from "../functions/api/state.js";
import { writePlayerSnapshot } from "../functions/_lib/fd.js";
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

// 11) clinchedPositions — a team's slot is "clinched" iff no remaining-match
//     scenario can move them out. We use a strict points-only check (no GD/H2H
//     assumption) so we never give a false positive: tied-points scenarios always
//     resolve to "not clinched" because goal margins are unbounded.
{
  // Strong leader: 9 pts after 3 games (group fully done) → 1st clinched trivially.
  // We still run the check on this shape to confirm "all played" → all clinched.
  const finalGroup = [
    { team: "Mexico",       points: 9, played: 3, gf: 6, ga: 1 },
    { team: "South Africa", points: 4, played: 3, gf: 3, ga: 3 },
    { team: "Czechia",      points: 3, played: 3, gf: 2, ga: 4 },
    { team: "South Korea",  points: 1, played: 3, gf: 1, ga: 4 },
  ];
  const c = clinchedPositions(finalGroup);
  ok("clinched: fully played → all teams clinched", c.Mexico === 1 && c["South Africa"] === 2 && c.Czechia === 3 && c["South Korea"] === 4);

  // Leader 7 pts, 1 game left. 2nd has 3 pts, 1 game left (max 6 < 7). Clinched.
  const bigLead = [
    { team: "Mexico",       points: 7, played: 2, gf: 4, ga: 0 },
    { team: "South Africa", points: 3, played: 2, gf: 1, ga: 1 },
    { team: "Czechia",      points: 1, played: 2, gf: 1, ga: 2 },
    { team: "South Korea",  points: 0, played: 2, gf: 0, ga: 3 },
  ];
  const c2 = clinchedPositions(bigLead);
  ok("clinched: leader 7 vs max-6 → 1st locked", c2.Mexico === 1);
  ok("clinched: gap below not yet locked → 2nd/3rd null", c2["South Africa"] === null && c2.Czechia === null);

  // Mexico's reported case: 6 pts after 2 games, 2nd has 3. 2nd's max is 6 → tied
  // possible → NOT clinched on points alone (could be passed via GD). Documented
  // limitation: this fires the user's exact scenario as "not clinched".
  const tiedPossible = [
    { team: "Mexico",       points: 6, played: 2, gf: 3, ga: 0 },
    { team: "South Africa", points: 3, played: 2, gf: 2, ga: 2 },
    { team: "Czechia",      points: 3, played: 2, gf: 1, ga: 1 },
    { team: "South Korea",  points: 0, played: 2, gf: 0, ga: 3 },
  ];
  const c3 = clinchedPositions(tiedPossible);
  ok("clinched: tied-points-possible → not clinched (conservative)", c3.Mexico === null);

  // Pre-tournament (all 0/0/0). No team is clinched.
  const pending = [
    { team: "Mexico",       points: 0, played: 0, gf: 0, ga: 0 },
    { team: "South Africa", points: 0, played: 0, gf: 0, ga: 0 },
    { team: "Czechia",      points: 0, played: 0, gf: 0, ga: 0 },
    { team: "South Korea",  points: 0, played: 0, gf: 0, ga: 0 },
  ];
  const c4 = clinchedPositions(pending);
  ok("clinched: all 0 pts → nothing clinched", Object.values(c4).every((v) => v === null));

  // Bottom-clinch: last place after MD2 with 0 pts, max 3, next-up has 7. 4th locked.
  const bottomLocked = [
    { team: "Mexico",       points: 7, played: 2, gf: 5, ga: 0 },
    { team: "South Africa", points: 7, played: 2, gf: 4, ga: 1 },
    { team: "Czechia",      points: 7, played: 2, gf: 3, ga: 1 },
    { team: "South Korea",  points: 0, played: 2, gf: 0, ga: 6 },
  ];
  const c5 = clinchedPositions(bottomLocked);
  ok("clinched: bottom team can't catch any → 4th locked", c5["South Korea"] === 4);
}

// 12) movementVsPrev — ▲/▼ relative to the prior matchday's end-of-MD order.
{
  const prev = ["A", "B", "C", "D"];
  // Same order → all null.
  {
    const m = movementVsPrev(["A","B","C","D"], prev);
    ok("movement: same order → all null", Object.values(m).every((v) => v === null));
  }
  // B moved up (was 2nd, now 1st); A moved down (was 1st, now 2nd).
  {
    const m = movementVsPrev(["B","A","C","D"], prev);
    ok("movement: B up", m.B === "up");
    ok("movement: A down", m.A === "down");
    ok("movement: C/D unchanged → null", m.C === null && m.D === null);
  }
  // D leaped from 4th to 1st (up); A fell from 1st to 4th (down).
  {
    const m = movementVsPrev(["D","B","C","A"], prev);
    ok("movement: D leap up", m.D === "up");
    ok("movement: A fall down", m.A === "down");
  }
  // No prev snapshot → every team null.
  {
    const m = movementVsPrev(["A","B","C","D"], null);
    ok("movement: no snapshot → all null", Object.values(m).every((v) => v === null));
  }
  // Empty current order is safe and returns {}.
  {
    const m = movementVsPrev([], prev);
    ok("movement: empty current → {}", Object.keys(m).length === 0);
  }
  // Team absent from prev (e.g., feed renamed) → null for that team.
  {
    const m = movementVsPrev(["A","B","C","NEW"], prev);
    ok("movement: team missing from prev → null", m.NEW === null);
  }
}

// 13) Integration: ordersFromStandings now emits a `clinched` field per group
//     (additive — no shape break). Empty for pending groups.
{
  const finalFeed = {
    standings: [{
      group: "GROUP_A", type: "TOTAL",
      table: [
        { position: 1, team: { name: "Mexico", tla: "MEX" }, playedGames: 3, points: 9, goalsFor: 6, goalsAgainst: 1 },
        { position: 2, team: { name: "South Africa", tla: "RSA" }, playedGames: 3, points: 4, goalsFor: 3, goalsAgainst: 3 },
        { position: 3, team: { name: "Czechia", tla: "CZE" }, playedGames: 3, points: 3, goalsFor: 2, goalsAgainst: 4 },
        { position: 4, team: { name: "South Korea", tla: "KOR" }, playedGames: 3, points: 1, goalsFor: 1, goalsAgainst: 4 },
      ],
    }],
  };
  const { groups: g } = ordersFromStandings(finalFeed);
  ok("ordersFromStandings: emits clinched on final group", g.A?.clinched?.Mexico === 1 && g.A?.clinched?.["South Korea"] === 4);

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
  const { groups: g2 } = ordersFromStandings(pendingFeed);
  ok("ordersFromStandings: pending group has empty clinched", g2.A?.clinched && Object.keys(g2.A.clinched).length === 0);
}

// 14) clinchedPositionsHTH — H2H-aware clinch via full W/D/L simulation.
//     FIFA 2026 tiebreaker: Points → H2H mini-table (pts/GD/GS) → overall GD →
//     overall GS → fair play → ranking. The simulation models pts + H2H pts only
//     (still-tied subgroups after H2H pts are returned as ambiguous, since per-
//     scenario GD is unknown). Conservative on ambiguity: never false-positive.
{
  // Mexico's reported case. After MD2:
  //   Mexico        6 pts (W vs South Korea, W vs Czechia) — played 2
  //   South Africa  3 pts (W vs Czechia,     L vs Mexico would be MD3...)
  //   Czechia       3 pts (W vs South Korea, L vs South Africa)
  //   South Korea   0 pts (L all)
  // Remaining: Mexico v South Africa (MD3), South Korea v Czechia (MD3).
  // Mexico's worst: lose to South Africa → stays at 6. South Africa wins → 6.
  // Could tie at 6. H2H: Mexico already beat South Korea (not SA). The decisive
  // MD3 match IS Mexico v South Africa, so in the tie scenario SA beat Mexico
  // → SA wins H2H tiebreaker → Mexico is NOT clinched against SA. Correct
  // behavior: Mexico null. (The user's intuition was based on assuming Mexico
  // had already played all the relevant teams; the H2H sim correctly flags
  // that the pending Mexico-SA match controls the tie.)
  const mexAfterMD2 = [
    { team: "Mexico",       points: 6, played: 2 },
    { team: "South Africa", points: 3, played: 2 },
    { team: "Czechia",      points: 3, played: 2 },
    { team: "South Korea",  points: 0, played: 2 },
  ];
  const h2hPending = {
    "Mexico|South Korea": "Mexico",
    "Czechia|Mexico": "Mexico",
    "Czechia|South Africa": "South Africa",
    "Czechia|South Korea": "Czechia",
  };
  const remPending = [
    { home: "Mexico", away: "South Africa" },
    { home: "South Korea", away: "Czechia" },
  ];
  const cMex = clinchedPositionsHTH(mexAfterMD2, h2hPending, remPending);
  ok("HTH: pending Mexico-SA match → Mexico not yet clinched", cMex.Mexico === null);
  ok("HTH: pending Mexico-SA match → SA not yet clinched", cMex["South Africa"] === null);

  // Now imagine Mexico already played all 3 (won all → 9 pts), and the other 3
  // teams' Mexico games are FINISHED. The user's true intent: Mexico has played
  // the head-to-head matches; nothing left can flip them. Sim should clinch
  // Mexico at 1 even if SA can still reach 6.
  const mexDone = [
    { team: "Mexico",       points: 9, played: 3 },
    { team: "South Africa", points: 3, played: 2 },
    { team: "Czechia",      points: 3, played: 2 },
    { team: "South Korea",  points: 0, played: 3 },
  ];
  const h2hDone = {
    "Mexico|South Korea": "Mexico",
    "Czechia|Mexico": "Mexico",
    "Mexico|South Africa": "Mexico",       // Mexico beat SA — already played
    "Czechia|South Korea": "Czechia",
  };
  const remDone = [{ home: "South Africa", away: "South Korea" }];  // SA could reach 6
  const c1 = clinchedPositionsHTH(mexDone, h2hDone, remDone);
  ok("HTH: leader fully done at 9 → 1st clinched even with sub-leader reachable", c1.Mexico === 1);

  // Direct 2-team H2H scenario: T won H2H, U's max ties T's min, no 3rd team can
  // reach that level. T must be clinched ahead of U.
  // Mexico 6 pts (played all 3), South Korea 3 (played 2). Other teams capped low.
  // Mexico already beat South Korea H2H. Tie at 6 would mean SK wins remaining;
  // H2H: Mexico won → Mexico 1st.
  const twoTeamH2H = [
    { team: "Mexico",       points: 6, played: 3 },
    { team: "South Korea",  points: 3, played: 2 },
    { team: "South Africa", points: 1, played: 3 }, // max 1, can't catch
    { team: "Czechia",      points: 1, played: 2 }, // max 4, can't reach 6
  ];
  const h2h2 = { "Mexico|South Korea": "Mexico" };
  const rem2 = [{ home: "South Korea", away: "Czechia" }];
  const c2 = clinchedPositionsHTH(twoTeamH2H, h2h2, rem2);
  ok("HTH: 2-team H2H win → leader 1st clinched", c2.Mexico === 1);

  // Inverse: U won the H2H, so even if T's points-lead looks safe-ish, T can be
  // overtaken on the tiebreaker.
  const h2hInv = { "Mexico|South Korea": "South Korea" };
  const c3 = clinchedPositionsHTH(twoTeamH2H, h2hInv, rem2);
  ok("HTH: 2-team H2H loss → leader NOT 1st clinched", c3.Mexico === null);

  // Final group (no remaining), distinct points → all clinched.
  const finalDistinct = [
    { team: "Mexico", points: 9, played: 3 },
    { team: "South Africa", points: 4, played: 3 },
    { team: "Czechia", points: 3, played: 3 },
    { team: "South Korea", points: 1, played: 3 },
  ];
  const c4 = clinchedPositionsHTH(finalDistinct, {}, []);
  ok("HTH: final group, no ties → all clinched", c4.Mexico === 1 && c4["South Korea"] === 4);

  // Final group with 2-team tie resolved by H2H.
  const finalTie = [
    { team: "Mexico", points: 9, played: 3 },
    { team: "South Africa", points: 4, played: 3 },
    { team: "Czechia", points: 4, played: 3 },   // tied with SA on points
    { team: "South Korea", points: 1, played: 3 },
  ];
  const h2hTie = {
    "Czechia|South Africa": "South Africa",  // SA beat Czechia → SA 2nd, Czechia 3rd
  };
  const c5 = clinchedPositionsHTH(finalTie, h2hTie, []);
  ok("HTH: final 2-way tie resolved by H2H → both clinched at H2H position", c5["South Africa"] === 2 && c5.Czechia === 3);

  // Live regression: the real Group A state on 2026-06-19, post-MD2.
  // June 11: Mexico 2-0 SA, SK 2-1 Cze.  June 18: Mexico 1-0 SK, Cze 1-1 SA.
  // Standings: Mex 6, SK 3, SA 1, Cze 1.  Remaining: Cze v Mex, SA v SK.
  // Mexico has already beaten both SK and SA head-to-head; SA/Cze can't reach 6
  // (max 4); SK can reach 6 only by winning vs SA, which doesn't affect the
  // Mexico H2H (already played and Mexico won). Sim must clinch Mexico at 1.
  const realGroupA = [
    { team: "Mexico",       points: 6, played: 2 },
    { team: "South Korea",  points: 3, played: 2 },
    { team: "South Africa", points: 1, played: 2 },
    { team: "Czechia",      points: 1, played: 2 },
  ];
  const realH2H = {
    "Mexico|South Africa": "Mexico",          // MD1
    "Czechia|South Korea": "South Korea",     // MD1
    "Mexico|South Korea": "Mexico",           // MD2
    "Czechia|South Africa": "draw",           // MD2
  };
  const realRem = [
    { home: "Czechia", away: "Mexico" },      // MD3
    { home: "South Africa", away: "South Korea" }, // MD3
  ];
  const cReal = clinchedPositionsHTH(realGroupA, realH2H, realRem);
  ok("HTH: real WC Group A on 2026-06-19 → Mexico clinched 1st", cReal.Mexico === 1);

  // Final group with 3-team H2H rock-paper-scissors → mini-table all 3 pts →
  // still tied after H2H pts → GD would decide → sim returns null for cycle teams.
  const finalCycle = [
    { team: "Mexico", points: 6, played: 3 },
    { team: "South Africa", points: 6, played: 3 },
    { team: "Czechia", points: 6, played: 3 },
    { team: "South Korea", points: 0, played: 3 },
  ];
  const h2hCycle = {
    "Mexico|South Africa": "Mexico",         // Mexico > SA
    "Czechia|Mexico": "Czechia",             // Czechia > Mexico
    "Czechia|South Africa": "South Africa",  // SA > Czechia (cycle)
    "Mexico|South Korea": "Mexico",
    "Czechia|South Korea": "Czechia",
    "South Africa|South Korea": "South Africa",
  };
  const c6 = clinchedPositionsHTH(finalCycle, h2hCycle, []);
  ok("HTH: 3-way H2H cycle → top three NOT clinched (GD would decide)", c6.Mexico === null && c6["South Africa"] === null && c6.Czechia === null);
  ok("HTH: 3-way cycle still clinches the 4th-place outlier", c6["South Korea"] === 4);
}

// 15) buildH2H + groupRemainingMatches — fd.js feeds these into clinchedPositionsHTH.
{
  const feed = {
    matches: [
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "South Korea", tla: "KOR" },
        score: { fullTime: { home: 2, away: 0 } } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "Czechia", tla: "CZE" }, awayTeam: { name: "South Africa", tla: "RSA" },
        score: { fullTime: { home: 1, away: 1 } } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "SCHEDULED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "South Africa", tla: "RSA" } },
      { stage: "GROUP_STAGE", group: "GROUP_B", status: "FINISHED",
        homeTeam: { name: "Canada", tla: "CAN" }, awayTeam: { name: "Switzerland", tla: "SUI" },
        score: { fullTime: { home: 3, away: 1 } } },
      // FINISHED but null scores — skipped (we can't tell who won).
      { stage: "GROUP_STAGE", group: "GROUP_B", status: "FINISHED",
        homeTeam: { name: "Qatar", tla: "QAT" }, awayTeam: { name: "Bosnia and Herzegovina", tla: "BIH" },
        score: { fullTime: { home: null, away: null } } },
      // Knockout → skipped.
      { stage: "ROUND_OF_32", status: "SCHEDULED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "Canada", tla: "CAN" } },
    ],
  };
  const h2h = buildH2H(feed);
  ok("buildH2H: winner recorded by team name", h2h["Mexico|South Korea"] === "Mexico");
  ok("buildH2H: draw recorded as 'draw'", h2h["Czechia|South Africa"] === "draw");
  ok("buildH2H: cross-group fine", h2h["Canada|Switzerland"] === "Canada");
  ok("buildH2H: null-score FINISHED skipped (can't tell)", h2h["Bosnia and Herzegovina|Qatar"] === undefined);
  ok("buildH2H: knockout match excluded", Object.keys(h2h).length === 3);

  const rem = groupRemainingMatches(feed);
  ok("groupRemaining: lists unplayed group-stage match", rem.A?.length === 1 && rem.A[0].home === "Mexico" && rem.A[0].away === "South Africa");
  ok("groupRemaining: no remaining in B (all finished, even null-score)", rem.B === undefined);
  ok("groupRemaining: knockout match not included", !rem.A.some((m) => m.home === "Mexico" && m.away === "Canada"));
}

// 16) Regression: ordersFromMatches' fallback path now correctly emits clinched.
//     Before this fix, the path built rows with `pts` field but called
//     clinchedPositions which reads `points` — so the whole fallback returned
//     all-null clinched. Verify clinched fires on a fully-played group.
{
  const feed = {
    matches: [
      // Group A — fully played, distinct points. After:
      //   Mexico (W,W,W) = 9, South Korea (W,W,L) = 6, Czechia (W,L,L) = 3, South Africa (L,L,L) = 0
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "South Korea", tla: "KOR" },
        score: { fullTime: { home: 1, away: 0 } } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "Czechia", tla: "CZE" },
        score: { fullTime: { home: 1, away: 0 } } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "Mexico", tla: "MEX" }, awayTeam: { name: "South Africa", tla: "RSA" },
        score: { fullTime: { home: 1, away: 0 } } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "South Korea", tla: "KOR" }, awayTeam: { name: "Czechia", tla: "CZE" },
        score: { fullTime: { home: 1, away: 0 } } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "South Korea", tla: "KOR" }, awayTeam: { name: "South Africa", tla: "RSA" },
        score: { fullTime: { home: 1, away: 0 } } },
      { stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED",
        homeTeam: { name: "Czechia", tla: "CZE" }, awayTeam: { name: "South Africa", tla: "RSA" },
        score: { fullTime: { home: 1, away: 0 } } },
    ],
  };
  const { groups: g } = ordersFromMatches(feed);
  ok("ordersFromMatches: fallback clinched (was buggy: pts vs points) now fires", g.A?.clinched?.Mexico === 1);
}

// 14) rankPlayers — pool-wide ranking used for the player-movement chip.
//     Standard competition ranking (1, 2, 2, 4). Skips pending groups (no
//     points yet) and entries without a predictions object.
{
  // Single group, status "final". Two distinct totals, no ties.
  const groupsA = {
    A: { order: ["Mexico", "South Korea", "South Africa", "Czechia"], status: "final" },
  };
  // alice picks 1st correctly (25), bob mispicks 1st as Czechia (0) — but gets
  // 2nd→1st-slot guess Mexico (15). Use scoreGroup matrix:
  //   actual 1st Mexico → pred index gives col[0]; if Mexico is at pred index 0, 25.
  const alice = { name: "alice", predictions: { A: ["Mexico", "South Korea", "South Africa", "Czechia"] } };
  const bob   = { name: "bob",   predictions: { A: ["Czechia", "Mexico", "South Africa", "South Korea"] } };
  const ranked = rankPlayers([alice, bob], groupsA);
  ok("rankPlayers: alice ranks 1st", ranked[0].name === "alice" && ranked[0].rank === 1);
  ok("rankPlayers: bob ranks 2nd",   ranked[1].name === "bob" && ranked[1].rank === 2);
  ok("rankPlayers: alice scores 25+20+15+0 = 60", ranked[0].total === 60);
}
{
  // Tied totals → standard competition ranking 1, 2, 2, 4.
  const groupsA = {
    A: { order: ["Mexico", "South Korea", "South Africa", "Czechia"], status: "final" },
  };
  const perfect = ["Mexico", "South Korea", "South Africa", "Czechia"];
  const a = { name: "a", predictions: { A: perfect } };       // 60 pts
  const b = { name: "b", predictions: { A: perfect } };       // 60 pts (tied with a)
  const c = { name: "c", predictions: { A: perfect } };       // 60 pts (tied)
  const d = { name: "d", predictions: { A: ["Czechia", "South Africa", "South Korea", "Mexico"] } }; // 0+5+5+0 = 10
  const ranked = rankPlayers([a, b, c, d], groupsA);
  ok("rankPlayers: ties share lower rank (a=1)", ranked[0].rank === 1);
  ok("rankPlayers: ties share lower rank (b=1)", ranked[1].rank === 1);
  ok("rankPlayers: ties share lower rank (c=1)", ranked[2].rank === 1);
  ok("rankPlayers: next-distinct skips to 4 (d=4)", ranked[3].rank === 4 && ranked[3].name === "d");
}
{
  // Pending groups contribute 0 toward total (same as the UI does).
  const groupsMixed = {
    A: { order: ["Mexico", "South Korea", "South Africa", "Czechia"], status: "pending" },
    B: { order: ["Canada", "Switzerland", "Qatar", "Bosnia and Herzegovina"], status: "final" },
  };
  const e = { name: "e", predictions: {
    A: ["Mexico", "South Korea", "South Africa", "Czechia"],
    B: ["Canada", "Switzerland", "Qatar", "Bosnia and Herzegovina"],
  } };
  const ranked = rankPlayers([e], groupsMixed);
  ok("rankPlayers: pending group contributes 0", ranked[0].total === 60);
}
{
  // Entries without predictions are excluded (matches tallyPicks convention).
  const groupsA = {
    A: { order: ["Mexico", "South Korea", "South Africa", "Czechia"], status: "final" },
  };
  const f = { name: "f" }; // no predictions
  const g = { name: "g", predictions: { A: ["Mexico", "South Korea", "South Africa", "Czechia"] } };
  const ranked = rankPlayers([f, g], groupsA);
  ok("rankPlayers: no-predictions entries excluded", ranked.length === 1 && ranked[0].name === "g");
}

// 15) playerMovementBetween — pure-function pair delta from two snapshots.
{
  const prev = { ranks: { alice: 1, bob: 2, carol: 3 } };
  const latest = { ranks: { alice: 3, bob: 1, carol: 2 } };
  const m = playerMovementBetween(prev, latest);
  ok("movement: alice dropped 2 (1→3)", m.alice === -2);
  ok("movement: bob climbed 1 (2→1)", m.bob === 1);
  ok("movement: carol climbed 1 (3→2)", m.carol === 1);
}
{
  // Players only in latest (post-snapshot entries) are omitted — UI shows nothing.
  const prev = { ranks: { alice: 1 } };
  const latest = { ranks: { alice: 1, newbie: 2 } };
  const m = playerMovementBetween(prev, latest);
  ok("movement: new-only player omitted", !("newbie" in m));
  ok("movement: present-in-both player included", m.alice === 0);
}
{
  // Null/missing snapshots → empty map.
  ok("movement: null prev → empty", Object.keys(playerMovementBetween(null, { ranks: { a: 1 } })).length === 0);
  ok("movement: null latest → empty", Object.keys(playerMovementBetween({ ranks: { a: 1 } }, null)).length === 0);
}

// 16) state.js — meta.playerMovement is computed from snapshots:players when
//     ≥ 2 snapshots exist; absent/single-snapshot returns an empty map.
//     (Reuses the makeStatePool pattern from the manualMatchScores tests above.)
{
  const now = Date.now();
  function makeStatePool(seed = {}) {
    const kv = {
      config: { poolName: "p", adminHash: "x", createdAt: 0 },
      "cache:standings": { groups: {}, unmapped: [], fetchedAt: now },
      "cache:matches": { matches: [], unmapped: [], fetchedAt: now },
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

  // No snapshots → empty playerMovement.
  {
    const s = await callState(makeStatePool());
    ok("state: no snapshots → playerMovement is {}", JSON.stringify(s.meta.playerMovement) === "{}");
  }
  // Single snapshot → still empty (need 2 to compute a delta).
  {
    const s = await callState(makeStatePool({
      "snapshots:players": [{ at: "2026-06-12T00:00:00Z", ranks: { alice: 1, bob: 2 }, totals: {} }],
    }));
    ok("state: single snapshot → playerMovement is {}", JSON.stringify(s.meta.playerMovement) === "{}");
  }
  // Two snapshots → delta computed against the *last two* (older then newer).
  {
    const s = await callState(makeStatePool({
      "snapshots:players": [
        { at: "2026-06-12T00:00:00Z", ranks: { alice: 1, bob: 2, carol: 3 }, totals: {} },
        { at: "2026-06-13T00:00:00Z", ranks: { alice: 3, bob: 1, carol: 2 }, totals: {} },
      ],
    }));
    ok("state: 2 snapshots → alice -2",  s.meta.playerMovement.alice === -2);
    ok("state: 2 snapshots → bob +1",    s.meta.playerMovement.bob === 1);
    ok("state: 2 snapshots → carol +1",  s.meta.playerMovement.carol === 1);
  }
}

// 17) writePlayerSnapshot — the helper used by fd.js's post-refresh hook.
//     Loads entries from POOL.list/get, ranks them against `decorated`,
//     appends to snapshots:players, and caps retention at 2.
{
  function makeKvPool(seed = {}) {
    const kv = { ...seed };
    return {
      _kv: kv,
      get: async (k, t) => { const v = kv[k] ?? null; return t === "json" || v == null ? v : JSON.stringify(v); },
      put: async (k, v) => { kv[k] = JSON.parse(v); },
      list: async ({ prefix }) => ({
        keys: Object.keys(kv).filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      }),
    };
  }
  const decoratedFinal = {
    A: { order: ["Mexico", "South Korea", "South Africa", "Czechia"], status: "final" },
  };
  const perfect = ["Mexico", "South Korea", "South Africa", "Czechia"];
  const seedEntries = {
    "entry:alice": { name: "alice", predictions: { A: perfect } }, // 60
    "entry:bob":   { name: "bob",   predictions: { A: ["Czechia", "South Africa", "South Korea", "Mexico"] } }, // 10
  };

  // First call: bootstrap — snapshots:players starts empty, ends with one entry.
  {
    const POOL = makeKvPool({ ...seedEntries });
    await writePlayerSnapshot({ POOL }, decoratedFinal);
    const arr = POOL._kv["snapshots:players"];
    ok("writePlayerSnapshot: bootstrap writes 1 entry", Array.isArray(arr) && arr.length === 1);
    ok("writePlayerSnapshot: alice ranked 1", arr[0].ranks.alice === 1);
    ok("writePlayerSnapshot: bob ranked 2",   arr[0].ranks.bob === 2);
    ok("writePlayerSnapshot: totals captured", arr[0].totals.alice === 60 && arr[0].totals.bob === 10);
  }

  // Append + cap: third write must drop the oldest, keep the last 2.
  {
    const POOL = makeKvPool({
      ...seedEntries,
      "snapshots:players": [{ at: "old", ranks: { alice: 2, bob: 1 }, totals: {} }],
    });
    await writePlayerSnapshot({ POOL }, decoratedFinal);
    let arr = POOL._kv["snapshots:players"];
    ok("writePlayerSnapshot: second write → length 2", arr.length === 2);
    await writePlayerSnapshot({ POOL }, decoratedFinal);
    arr = POOL._kv["snapshots:players"];
    ok("writePlayerSnapshot: third write capped at 2", arr.length === 2);
    ok("writePlayerSnapshot: oldest dropped", arr[0].at !== "old");
  }

  // No entries → still writes a snapshot (empty ranks/totals); harmless.
  {
    const POOL = makeKvPool();
    await writePlayerSnapshot({ POOL }, decoratedFinal);
    const arr = POOL._kv["snapshots:players"];
    ok("writePlayerSnapshot: zero entries still writes", arr.length === 1);
    ok("writePlayerSnapshot: zero entries → empty ranks", Object.keys(arr[0].ranks).length === 0);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
