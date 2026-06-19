// Turns football-data.org responses into { groups: { A:{order,status,clinched}, ... }, unmapped:[] }
// status: "pending" (no games played yet — feed order is just seed/draw),
//         "live" (group in progress), or "final" (all 4 teams played 3 games).
// clinched: per-team map { TeamName: 1|2|3|4|null } — non-null if no remaining
//   scenario can move that team out of that position (points-only check, see
//   clinchedPositions below).
// Primary path uses the /standings response (official ordering incl. tiebreakers).
// Fallback computes provisional tables from finished matches (points, GD, GF),
// so we still get something even if /standings is unavailable for the comp type.

import { mapTeam } from "./teamMap.js";

const GAMES_PER_TEAM = 3;

// A team T has clinched position i iff, given every team has remaining = 3-played
// games left, no possible outcome can move T out of position i. We use a points-only
// strict comparison (ignore GD tiebreakers): a team U above T cannot drop below T
// when U.points > T.maxPoints, and a team U below T cannot catch T when
// U.maxPoints < T.points. Strict inequality is conservative — if max==min for two
// teams they could still swap via GD, so we don't claim clinched. Mexico's real
// Group A case (6 pts after 2 games vs 0/0/0 below) clinches cleanly: every other
// team's max is ≤ 3 < 6.
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
    }
  }
  return { groups, unmapped };
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
  for (const [letter, teamsObj] of Object.entries(tables)) {
    const rows = Object.values(teamsObj).sort((a, b) =>
      b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team)
    );
    if (rows.length === 4) {
      const allPlayed = rows.every((r) => r.played >= 3);
      const anyPlayed = rows.some((r) => r.played > 0);
      const status = allPlayed ? "final" : anyPlayed ? "live" : "pending";
      const clinched = anyPlayed ? clinchedPositions(rows) : {};
      groups[letter] = { order: rows.map((r) => r.team), status, source: "api", clinched };
    }
  }
  return { groups, unmapped };
}
