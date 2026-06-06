// Turns football-data.org responses into { groups: { A:{order,status}, ... }, unmapped:[] }
// status: "pending" (no games played yet — feed order is just seed/draw),
//         "live" (group in progress), or "final" (all 4 teams played 3 games).
// Primary path uses the /standings response (official ordering incl. tiebreakers).
// Fallback computes provisional tables from finished matches (points, GD, GF),
// so we still get something even if /standings is unavailable for the comp type.

import { mapTeam } from "./teamMap.js";

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
    let allPlayed = true;
    let anyPlayed = false;
    for (const r of rows) {
      const team = r.team || {};
      const our = mapTeam(team.name, team.tla);
      if (our) order.push(our);
      else unmapped.push(team.name || team.tla || "(unknown)");
      const played = r.playedGames ?? 0;
      if (played < 3) allPlayed = false;
      if (played > 0) anyPlayed = true;
    }
    if (order.length === 4) {
      const status = allPlayed ? "final" : anyPlayed ? "live" : "pending";
      groups[letter] = { order, status, source: "api" };
    }
  }
  return { groups, unmapped };
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
      groups[letter] = { order: rows.map((r) => r.team), status, source: "api" };
    }
  }
  return { groups, unmapped };
}
