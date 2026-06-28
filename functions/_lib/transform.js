// Turns football-data.org responses into { groups: { A:{order,status,clinched}, ... }, unmapped:[] }
// status: "pending" (no games played yet — feed order is just seed/draw),
//         "live" (group in progress), or "final" (all 4 teams played 3 games).
// clinched: per-team map { TeamName: 1|2|3|4|null } — non-null if no remaining
//   scenario can move that team out of that position. Two implementations:
//   strict points-only (clinchedPositions) and H2H-aware simulation
//   (clinchedPositionsHTH). The transforms emit the strict version as a safe
//   fallback; fd.js overwrites with the simulation when matches data is available.
// Primary path uses the /standings response (official ordering incl. tiebreakers).
// Fallback computes provisional tables from finished matches (points, GD, GF),
// so we still get something even if /standings is unavailable for the comp type.

import { mapTeam } from "./teamMap.js";
import { scoreGroup, scoreKnockout } from "./scoring.js";

const GAMES_PER_TEAM = 3;

// Rank players by total projected points across the merged group orders.
// Positional ranking: rank = sorted index + 1 (1, 2, 3, 4 — no skips on ties).
// Ties on total are broken alphabetically by name, matching the StandingsTab
// UI's sort (`b.total - a.total || a.name.localeCompare(b.name)`). Keeping
// snapshot ranks aligned with the position numbers the user actually sees is
// what the movement chip's "moved up/down N spots" delta is measured against.
//
// entries:        [{ name, predictions }] — skipped if no predictions object.
// groups:         { A: { order, status }, ... } — pending groups contribute 0.
// knockoutPicks:  { "<slug>": { R32_1: "France", ... } } — optional; added to total when present.
// knockoutResults: { R32_1: { winner: "France", status: "final" }, ... } — optional.
// Returns: [{ name, total, rank }] sorted by total desc, then name asc.
export function rankPlayers(entries, groups, knockoutPicks, knockoutResults) {
  const list = Array.isArray(entries) ? entries : [];
  const g = groups || {};
  const kPicks = knockoutPicks || {};
  const kResults = knockoutResults || {};
  const rows = [];
  for (const e of list) {
    if (!e || !e.predictions) continue;
    let total = 0;
    for (const [letter, gr] of Object.entries(g)) {
      if (!gr || gr.status === "pending") continue;
      total += scoreGroup(e.predictions[letter], gr.order);
    }
    const s = slugStr(e.name);
    if (kPicks[s]) total += scoreKnockout(kPicks[s], kResults);
    rows.push({ name: e.name, total });
  }
  rows.sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));
  return rows.map((r, i) => ({ name: r.name, total: r.total, rank: i + 1 }));
}

function slugStr(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}

// Given two player snapshots (older first, newer second), returns
// { name: delta } where delta = older.rank - newer.rank. Positive = moved up.
// Players present in only one snapshot are omitted (e.g. a brand-new entry
// post-snapshot has no prior rank to compare against — show nothing per UI spec).
export function playerMovementBetween(prev, latest) {
  const out = {};
  if (!prev || !latest) return out;
  const prevRanks = prev.ranks || {};
  const newRanks = latest.ranks || {};
  for (const name of Object.keys(newRanks)) {
    if (!(name in prevRanks)) continue;
    const delta = prevRanks[name] - newRanks[name];
    out[name] = delta;
  }
  return out;
}

// Strict points-only clinch — fast, conservative, no H2H knowledge. A team U
// above T cannot drop below T when U.points > T.maxPoints, and U below T cannot
// catch T when U.maxPoints < T.points. Strict inequality means tied-on-points
// scenarios always read "not clinched" — goal margins are unbounded. Used as a
// fallback when we don't have remaining-match info available.
//
// rows: [{team, points, played, gf, ga}, ...] sorted top→bottom by current standings.
// Returns: { TeamName: 1|2|3|4|null }.
export function clinchedPositions(rows) {
  const out = {};
  const enriched = rows.map((r) => ({
    ...r,
    max: r.points + 3 * Math.max(0, GAMES_PER_TEAM - (r.played || 0)),
  }));
  enriched.forEach((T, i) => {
    const above = enriched.slice(0, i);
    const below = enriched.slice(i + 1);
    const aboveLocked = above.every((U) => U.points > T.max);
    const belowLocked = below.every((U) => U.max < T.points);
    out[T.team] = aboveLocked && belowLocked ? i + 1 : null;
  });
  return out;
}

// H2H-aware clinch via full W/D/L scenario simulation. FIFA 2026 tiebreaker
// order puts head-to-head (mini-table among the tied teams: pts, then GD, then
// GS) ahead of overall GD. We enumerate every possible result for the remaining
// matches (3^N scenarios, N≤6 → up to 729), compute each team's final position
// resolving points-ties via the H2H mini-table on the scenario's results, and
// report each team's set of possible positions. A team is clinched at position
// i iff every scenario lands them at exactly i.
//
// We only model the H2H *points* in the mini-table; if H2H is still tied after
// points (e.g., 3-way cycle of wins) we treat the still-tied subgroup as
// "could be any position in this subgroup" — falls back to GD which we don't
// know per scenario. Conservative: misses GD-decided clinches but never false-
// positives.
//
// rows: [{team, points, played, ...}] — current standings; order matters only
//       for the tied-bucket initialization but the simulation re-sorts.
// h2h:  { "A|B" (sorted): "A" | "B" | "draw" } — winners of already-finished
//       group-stage matches involving these teams.
// remaining: [{home, away}] — unplayed group-stage matches in this group.
// Returns: { TeamName: 1|2|3|4|null }.
export function clinchedPositionsHTH(rows, h2h, remaining) {
  const teams = rows.map((r) => r.team);
  const possible = Object.fromEntries(teams.map((t) => [t, new Set()]));
  const numScenarios = Math.pow(3, remaining.length);
  for (let s = 0; s < numScenarios; s++) {
    let bits = s;
    const pts = Object.fromEntries(rows.map((r) => [r.team, r.points || 0]));
    const scenH2H = { ...h2h };
    for (let i = 0; i < remaining.length; i++) {
      const outcome = bits % 3;
      bits = Math.floor(bits / 3);
      const m = remaining[i];
      if (pts[m.home] == null || pts[m.away] == null) continue;
      const key = pairKey(m.home, m.away);
      if (outcome === 0)      { pts[m.home] += 3; scenH2H[key] = m.home; }
      else if (outcome === 1) { pts[m.home] += 1; pts[m.away] += 1; scenH2H[key] = "draw"; }
      else                    { pts[m.away] += 3; scenH2H[key] = m.away; }
    }
    // Sort teams by points (desc), then form points-tied buckets.
    const sorted = [...teams].sort((a, b) => pts[b] - pts[a]);
    const buckets = [];
    for (const t of sorted) {
      if (!buckets.length || pts[buckets[buckets.length - 1][0]] !== pts[t]) buckets.push([]);
      buckets[buckets.length - 1].push(t);
    }
    let pos = 1;
    for (const bucket of buckets) {
      if (bucket.length === 1) { possible[bucket[0]].add(pos); pos++; continue; }
      // H2H mini-table: pts earned in matches ONLY among the tied bucket.
      const h2hPts = Object.fromEntries(bucket.map((t) => [t, 0]));
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          const w = scenH2H[pairKey(a, b)];
          if (w === a) h2hPts[a] += 3;
          else if (w === b) h2hPts[b] += 3;
          else if (w === "draw") { h2hPts[a] += 1; h2hPts[b] += 1; }
        }
      }
      const subSorted = [...bucket].sort((a, b) => h2hPts[b] - h2hPts[a]);
      const subBuckets = [];
      for (const t of subSorted) {
        if (!subBuckets.length || h2hPts[subBuckets[subBuckets.length - 1][0]] !== h2hPts[t]) subBuckets.push([]);
        subBuckets[subBuckets.length - 1].push(t);
      }
      let subPos = pos;
      for (const sb of subBuckets) {
        if (sb.length === 1) { possible[sb[0]].add(subPos); subPos++; }
        else {
          // Still tied after H2H pts → fallback (GD/GS) ambiguous per scenario.
          for (let k = subPos; k < subPos + sb.length; k++) for (const t of sb) possible[t].add(k);
          subPos += sb.length;
        }
      }
      pos += bucket.length;
    }
  }
  const out = {};
  for (const t of teams) {
    const set = possible[t];
    out[t] = set.size === 1 ? [...set][0] : null;
  }
  return out;
}

function pairKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

// Build a { "A|B": winnerName | "draw" } map from finished group-stage matches.
// Used as the "already known" H2H seed for clinchedPositionsHTH simulations.
export function buildH2H(matchesJson) {
  const out = {};
  const matches = (matchesJson && matchesJson.matches) || [];
  for (const m of matches) {
    if (m.stage && m.stage !== "GROUP_STAGE") continue;
    if (m.status !== "FINISHED") continue;
    const home = mapTeam(m.homeTeam?.name, m.homeTeam?.tla);
    const away = mapTeam(m.awayTeam?.name, m.awayTeam?.tla);
    if (!home || !away) continue;
    const hs = m.score?.fullTime?.home;
    const as = m.score?.fullTime?.away;
    if (hs == null || as == null) continue;
    out[pairKey(home, away)] = hs > as ? home : as > hs ? away : "draw";
  }
  return out;
}

// Per-group list of unplayed (not FINISHED) group-stage matches.
// Returns: { A: [{home, away}, ...], B: [...] }.
export function groupRemainingMatches(matchesJson) {
  const out = {};
  const matches = (matchesJson && matchesJson.matches) || [];
  for (const m of matches) {
    if (m.stage && m.stage !== "GROUP_STAGE") continue;
    if (!m.group) continue;
    if (m.status === "FINISHED") continue;
    const letter = String(m.group).replace(/^GROUP[_\s-]?/i, "").toUpperCase();
    const home = mapTeam(m.homeTeam?.name, m.homeTeam?.tla);
    const away = mapTeam(m.awayTeam?.name, m.awayTeam?.tla);
    if (!home || !away) continue;
    out[letter] ||= [];
    out[letter].push({ home, away });
  }
  return out;
}

// Given a current order and a previous order (post-prior-matchday snapshot),
// returns { TeamName: "up"|"down"|null }. Same position or missing snapshot → null.
// Position uses 0-based index in the order array (index 0 = 1st, index 3 = 4th).
export function movementVsPrev(currentOrder, prevOrder) {
  const out = {};
  if (!Array.isArray(currentOrder)) return out;
  const prevIndex = new Map();
  if (Array.isArray(prevOrder)) prevOrder.forEach((t, i) => prevIndex.set(t, i));
  currentOrder.forEach((team, i) => {
    if (!prevIndex.has(team)) { out[team] = null; return; }
    const delta = prevIndex.get(team) - i;
    out[team] = delta > 0 ? "up" : delta < 0 ? "down" : null;
  });
  return out;
}

export function ordersFromStandings(json) {
  const groups = {};
  const statsByGroup = {};
  const unmapped = [];
  const standings = (json && json.standings) || [];
  for (const s of standings) {
    if (!s.group) continue;                         // skip overall/non-group tables
    if (s.type && s.type !== "TOTAL") continue;     // ignore HOME/AWAY splits
    const letter = String(s.group).replace(/^GROUP[_\s-]?/i, "").toUpperCase();
    const rows = [...(s.table || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    const order = [];
    const stats = [];
    let allPlayed = true;
    let anyPlayed = false;
    for (const r of rows) {
      const team = r.team || {};
      const our = mapTeam(team.name, team.tla);
      if (our) {
        order.push(our);
        stats.push({
          team: our,
          points: r.points ?? 0,
          played: r.playedGames ?? 0,
          gf: r.goalsFor ?? 0,
          ga: r.goalsAgainst ?? 0,
        });
      } else {
        unmapped.push(team.name || team.tla || "(unknown)");
      }
      const played = r.playedGames ?? 0;
      if (played < 3) allPlayed = false;
      if (played > 0) anyPlayed = true;
    }
    if (order.length === 4) {
      const status = allPlayed ? "final" : anyPlayed ? "live" : "pending";
      const clinched = anyPlayed ? clinchedPositions(stats) : {};
      groups[letter] = { order, status, source: "api", clinched };
      statsByGroup[letter] = stats;
    }
  }
  return { groups, unmapped, statsByGroup };
}

// matchesFromFeed(json) → array of every match the feed returned, normalized
// to our canonical team names and sorted by kickoff (utcDate) ascending.
// Drops a match if EITHER team can't be mapped (the Matches tab would render
// gibberish otherwise; admin can override group orders but individual fixtures
// have no override path). Score is only meaningful for FINISHED — for any
// other status the score fields are null so the UI doesn't render "0–0" for a
// match that hasn't kicked off.
export function matchesFromFeed(json) {
  const out = [];
  const unmapped = [];
  const matches = (json && json.matches) || [];
  for (const m of matches) {
    const home = mapTeam(m.homeTeam?.name, m.homeTeam?.tla);
    const away = mapTeam(m.awayTeam?.name, m.awayTeam?.tla);
    if (!home) unmapped.push(m.homeTeam?.name || m.homeTeam?.tla);
    if (!away) unmapped.push(m.awayTeam?.name || m.awayTeam?.tla);
    if (!home || !away) continue;
    const finished = m.status === "FINISHED";
    out.push({
      id: m.id ?? null,
      utcDate: m.utcDate || null,
      stage: m.stage || null,
      group: m.group ? String(m.group).replace(/^GROUP[_\s-]?/i, "").toUpperCase() : null,
      status: m.status || null,
      matchday: m.matchday ?? null,
      home,
      away,
      homeScore: finished ? (m.score?.fullTime?.home ?? null) : null,
      awayScore: finished ? (m.score?.fullTime?.away ?? null) : null,
    });
  }
  out.sort((a, b) => {
    const ad = a.utcDate ? Date.parse(a.utcDate) : Infinity;
    const bd = b.utcDate ? Date.parse(b.utcDate) : Infinity;
    return ad - bd;
  });
  return { matches: out, unmapped };
}

// Maps football-data stage strings to our bracket round IDs.
const STAGE_TO_ROUND = {
  LAST_32: "R32", ROUND_OF_32: "R32",
  LAST_16: "R16", ROUND_OF_16: "R16",
  QUARTER_FINALS: "QF", QUARTER_FINAL: "QF",
  SEMI_FINALS: "SF", SEMI_FINAL: "SF",
  FINAL: "FINAL",
};

// Parse knockout fixtures from football-data into a flat results map.
// Returns { results: { R32_1: { home, away, winner, status }, ... }, unmapped }.
// Matches are numbered within each round in chronological order of utcDate.
// Only includes rounds we score (R32 through Final); 3rd-place playoff excluded.
export function bracketFromFeed(json) {
  const matches = (json && json.matches) || [];
  const unmapped = [];
  const byRound = {}; // round → [{ home, away, winner, status, utcDate }]

  for (const m of matches) {
    const round = STAGE_TO_ROUND[m.stage];
    if (!round) continue; // skip GROUP_STAGE, THIRD_PLACE, unknown
    if (m.stage === "THIRD_PLACE" || m.stage === "PLAY_OFF_3RD_PLACE") continue;

    const home = mapTeam(m.homeTeam?.name, m.homeTeam?.tla);
    const away = mapTeam(m.awayTeam?.name, m.awayTeam?.tla);
    // TBD slots (placeholder names from the feed) → null rather than unmapped
    const homeName = home || (m.homeTeam?.name ? null : null);
    const awayName = away || (m.awayTeam?.name ? null : null);
    if (m.homeTeam?.name && !home) unmapped.push(m.homeTeam.name);
    if (m.awayTeam?.name && !away) unmapped.push(m.awayTeam.name);

    const finished = m.status === "FINISHED";
    const hs = finished ? (m.score?.fullTime?.home ?? null) : null;
    const as_ = finished ? (m.score?.fullTime?.away ?? null) : null;
    const winner = finished && hs != null && as_ != null
      ? (hs > as_ ? home : hs < as_ ? away : null) // null on draw (shouldn't happen in KO)
      : null;
    const status = finished ? "final" : (m.status === "IN_PROGRESS" || m.status === "PAUSED") ? "live" : "scheduled";

    byRound[round] ||= [];
    byRound[round].push({ home: homeName, away: awayName, winner, status, utcDate: m.utcDate || "" });
  }

  // Sort each round chronologically then assign sequential IDs: R32_1, R32_2, …
  const results = {};
  for (const [round, list] of Object.entries(byRound)) {
    list.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    list.forEach((entry, i) => {
      const id = round === "FINAL" ? "FINAL" : `${round}_${i + 1}`;
      results[id] = { home: entry.home, away: entry.away, winner: entry.winner, status: entry.status };
    });
  }

  return { results, unmapped: [...new Set(unmapped)] };
}

export function ordersFromMatches(json) {
  // Build provisional tables from finished group-stage matches.
  const tables = {}; // letter -> { team -> stats }
  const unmapped = [];
  const matches = (json && json.matches) || [];
  const ensure = (letter, team) => {
    tables[letter] ||= {};
    tables[letter][team] ||= { team, pts: 0, gf: 0, ga: 0, played: 0 };
    return tables[letter][team];
  };
  for (const m of matches) {
    if (m.stage && m.stage !== "GROUP_STAGE") continue;
    if (!m.group) continue;
    const letter = String(m.group).replace(/^GROUP[_\s-]?/i, "").toUpperCase();
    const home = mapTeam(m.homeTeam?.name, m.homeTeam?.tla);
    const away = mapTeam(m.awayTeam?.name, m.awayTeam?.tla);
    if (!home) unmapped.push(m.homeTeam?.name);
    if (!away) unmapped.push(m.awayTeam?.name);
    if (!home || !away) continue;
    if (m.status !== "FINISHED") { ensure(letter, home); ensure(letter, away); continue; }
    const hs = m.score?.fullTime?.home ?? 0;
    const as = m.score?.fullTime?.away ?? 0;
    const H = ensure(letter, home), A = ensure(letter, away);
    H.played++; A.played++;
    H.gf += hs; H.ga += as; A.gf += as; A.ga += hs;
    if (hs > as) H.pts += 3; else if (as > hs) A.pts += 3; else { H.pts++; A.pts++; }
  }
  const groups = {};
  const statsByGroup = {};
  for (const [letter, teamsObj] of Object.entries(tables)) {
    const rows = Object.values(teamsObj).sort((a, b) =>
      b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team)
    );
    if (rows.length === 4) {
      const allPlayed = rows.every((r) => r.played >= 3);
      const anyPlayed = rows.some((r) => r.played > 0);
      const status = allPlayed ? "final" : anyPlayed ? "live" : "pending";
      // Normalize field name: internal table uses `pts`, clinchedPositions
      // expects `points`. (Pre-normalize bug fix — without this, clinched
      // returned all-null down this fallback path.)
      const stats = rows.map((r) => ({ team: r.team, points: r.pts, played: r.played, gf: r.gf, ga: r.ga }));
      const clinched = anyPlayed ? clinchedPositions(stats) : {};
      groups[letter] = { order: rows.map((r) => r.team), status, source: "api", clinched };
      statsByGroup[letter] = stats;
    }
  }
  return { groups, unmapped, statsByGroup };
}
