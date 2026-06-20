import {
  ordersFromStandings, ordersFromMatches, matchesFromFeed,
  movementVsPrev, clinchedPositionsHTH, buildH2H, groupRemainingMatches,
  rankPlayers,
} from "./transform.js";

const TTL_MS = 10 * 60 * 1000; // refresh at most every 10 minutes
const BASE = "https://api.football-data.org/v4/competitions/WC";

async function fdFetch(path, env) {
  const r = await fetch(BASE + path, { headers: { "X-Auth-Token": env.FOOTBALL_DATA_KEY || "" } });
  if (!r.ok) throw new Error("football-data HTTP " + r.status);
  return r.json();
}

// We can't ask the /standings endpoint for played-counts on the cached payload
// (it's already collapsed to {order, status, clinched}), so we snapshot the
// post-matchday order via this KV key. Shape:
//   { A: { "1": [team,team,team,team], "2": [...] }, ... }
// Save trigger: when we see a clean matchday boundary in the feed
// (max played == min played == N, all 4 teams) AND we don't yet have snapshot[N]
// for that group. Bounded at ~24 writes over the whole group stage.
const SNAPSHOTS_KEY = "snapshots:groups";

// Player-rank snapshots — captured each time at least one per-group matchday
// boundary fires in a refresh, regardless of how many groups crossed (one
// write per refresh max). Cap retention at the last 2 entries because that's
// all state.js needs to compute the "since last per-group matchday" delta.
// Shape: [{ at, totals: { name: total }, ranks: { name: rank } }, ...]
// (older first, newer last).
const PLAYER_SNAPSHOTS_KEY = "snapshots:players";
const PLAYER_SNAPSHOTS_KEEP = 2;

// Returns { groups, unmapped, fetchedAt, stale, error? }.
// Groups include {order, status, source, clinched, movement} when computable.
// On any failure it serves the last good cached value (stale:true) so the
// site never goes blank mid-tournament because of a transient API hiccup.
export async function getGroupOrders(env, { force = false } = {}) {
  let cache = null;
  try { const raw = await env.POOL.get("cache:standings"); cache = raw ? JSON.parse(raw) : null; } catch {}
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return { ...cache, stale: false };

  // Pull standings + matches in parallel. Matches give us played-counts per
  // team so we can detect matchday boundaries and decorate movement, even when
  // the /standings path is the one that produced the order.
  try {
    let parsed = ordersFromStandings(await fdFetch("/standings", env));
    let matchesJson = null;
    if (Object.keys(parsed.groups).length === 0) {
      matchesJson = await fdFetch("/matches?stage=GROUP_STAGE", env);
      parsed = ordersFromMatches(matchesJson);
    } else {
      try { matchesJson = await fdFetch("/matches?stage=GROUP_STAGE", env); } catch { matchesJson = null; }
    }

    // Per-group { minPlayed, maxPlayed } from finished matches.
    const playedByGroup = matchesJson ? playedCountsFromMatches(matchesJson) : {};

    // H2H-aware clinch needs the already-played match winners + the unplayed
    // fixtures, so we can enumerate W/D/L scenarios and resolve points-ties via
    // the H2H mini-table (FIFA 2026 puts H2H ahead of overall GD).
    const h2h = matchesJson ? buildH2H(matchesJson) : {};
    const remainingByGroup = matchesJson ? groupRemainingMatches(matchesJson) : {};
    const statsByGroup = parsed.statsByGroup || {};

    // Read snapshots, decide writes, decorate movement + H2H-aware clinched.
    let snapshots = {};
    try { snapshots = (await env.POOL.get(SNAPSHOTS_KEY, "json")) || {}; } catch {}
    let snapshotsDirty = false;

    const decorated = {};
    for (const [letter, g] of Object.entries(parsed.groups)) {
      const p = playedByGroup[letter];
      const groupSnap = snapshots[letter] || {};
      const cleanBoundary = p && p.minPlayed === p.maxPlayed && p.minPlayed > 0;
      if (cleanBoundary && !groupSnap[String(p.minPlayed)]) {
        groupSnap[String(p.minPlayed)] = [...g.order];
        snapshots[letter] = groupSnap;
        snapshotsDirty = true;
      }
      // compareAgainst = last fully completed matchday whose end-of-MD differs from now.
      // If max>min we're mid-matchday — compare vs min. Otherwise compare vs min-1.
      let compareAgainst = 0;
      if (p) compareAgainst = p.maxPlayed > p.minPlayed ? p.minPlayed : p.minPlayed - 1;
      const prevOrder = compareAgainst >= 1 ? groupSnap[String(compareAgainst)] : null;
      const movement = movementVsPrev(g.order, prevOrder);

      // Upgrade strict clinched to H2H-aware simulation when we have the inputs.
      // If matches feed is unavailable (transient API failure), fall through with
      // the strict version baked in by ordersFromStandings.
      const stats = statsByGroup[letter];
      const remaining = remainingByGroup[letter] || [];
      const clinched = (stats && matchesJson) ? clinchedPositionsHTH(stats, h2h, remaining) : g.clinched;

      decorated[letter] = { ...g, clinched, movement };
    }

    if (snapshotsDirty) {
      try { await env.POOL.put(SNAPSHOTS_KEY, JSON.stringify(snapshots)); } catch {}
      // Same trigger as the per-team snapshot: any group crossing a clean
      // matchday boundary in this refresh also gets a pool-wide player-rank
      // snapshot appended. Computed against feed-only orders (no admin
      // overrides), so the "movement chip" reads as pure matchday effect.
      try { await writePlayerSnapshot(env, decorated); } catch {}
    } else {
      // Bootstrap: PR #30 shipped mid-tournament, after groups A–D had already
      // crossed MD2. Those boundaries were recorded in snapshots:groups but
      // (obviously) no player snapshot was written at the time, so the regular
      // trigger above wouldn't fire again until the *next* new boundary —
      // leaving the chip blank through a whole upcoming matchday. If
      // snapshots:players is empty and the tournament is underway, write one
      // initial player snapshot so the very next per-group MD boundary
      // produces a usable delta.
      try {
        const existing = await env.POOL.get(PLAYER_SNAPSHOTS_KEY, "json");
        const empty = !Array.isArray(existing) || existing.length === 0;
        const tournamentLive = Object.values(decorated).some((g) => g.status === "live" || g.status === "final");
        if (empty && tournamentLive) await writePlayerSnapshot(env, decorated);
      } catch {}
    }

    const payload = {
      groups: decorated,
      unmapped: [...new Set(parsed.unmapped)],
      fetchedAt: Date.now(),
    };
    try { await env.POOL.put("cache:standings", JSON.stringify(payload)); } catch {}
    return { ...payload, stale: false };
  } catch (e) {
    if (cache) return { ...cache, stale: true, error: String(e) };
    return { groups: {}, unmapped: [], fetchedAt: 0, stale: true, error: String(e) };
  }
}

// Per-group { minPlayed, maxPlayed } across the 4 teams, from finished group-
// stage matches in the matches feed. Used to detect clean matchday boundaries
// and decide which snapshot to compare against for movement.
function playedCountsFromMatches(json) {
  const tallies = {}; // letter -> Map(team -> count)
  const matches = (json && json.matches) || [];
  for (const m of matches) {
    if (m.stage && m.stage !== "GROUP_STAGE") continue;
    if (!m.group) continue;
    if (m.status !== "FINISHED") continue;
    const letter = String(m.group).replace(/^GROUP[_\s-]?/i, "").toUpperCase();
    tallies[letter] ||= new Map();
    const home = m.homeTeam?.name || m.homeTeam?.tla;
    const away = m.awayTeam?.name || m.awayTeam?.tla;
    if (home) tallies[letter].set(home, (tallies[letter].get(home) || 0) + 1);
    if (away) tallies[letter].set(away, (tallies[letter].get(away) || 0) + 1);
  }
  const out = {};
  for (const [letter, map] of Object.entries(tallies)) {
    if (map.size !== 4) continue; // need all 4 teams seen
    const counts = [...map.values()];
    out[letter] = { minPlayed: Math.min(...counts), maxPlayed: Math.max(...counts) };
  }
  return out;
}

// Load every entry from KV and append a player-rank snapshot keyed by the
// canonical name. Called from the post-refresh hook in getGroupOrders when at
// least one per-group matchday boundary fired this refresh. ~24 writes across
// the whole group stage in the worst case (one per group matchday), so this is
// well within the tournament-time KV budget called out in CLAUDE.md.
export async function writePlayerSnapshot(env, decorated) {
  const list = await env.POOL.list({ prefix: "entry:" });
  const entries = [];
  for (const k of list.keys) {
    const e = await env.POOL.get(k.name, "json");
    if (e) entries.push({ name: e.name, predictions: e.predictions });
  }
  const ranked = rankPlayers(entries, decorated);
  const ranks = {}; const totals = {};
  for (const r of ranked) { ranks[r.name] = r.rank; totals[r.name] = r.total; }
  let arr = [];
  try { arr = (await env.POOL.get(PLAYER_SNAPSHOTS_KEY, "json")) || []; } catch {}
  if (!Array.isArray(arr)) arr = [];
  arr.push({ at: new Date().toISOString(), totals, ranks });
  if (arr.length > PLAYER_SNAPSHOTS_KEEP) arr = arr.slice(arr.length - PLAYER_SNAPSHOTS_KEEP);
  await env.POOL.put(PLAYER_SNAPSHOTS_KEY, JSON.stringify(arr));
}

// Returns { matches, unmapped, fetchedAt, stale, error? }.
// Same cache-and-serve-stale pattern as getGroupOrders, against cache:matches.
// No stage filter — once the feed publishes knockout fixtures, they'll appear
// automatically on the Matches tab.
export async function getMatches(env, { force = false } = {}) {
  let cache = null;
  try { const raw = await env.POOL.get("cache:matches"); cache = raw ? JSON.parse(raw) : null; } catch {}
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return { ...cache, stale: false };

  try {
    const parsed = matchesFromFeed(await fdFetch("/matches", env));
    const payload = {
      matches: parsed.matches,
      unmapped: [...new Set(parsed.unmapped)],
      fetchedAt: Date.now(),
    };
    try { await env.POOL.put("cache:matches", JSON.stringify(payload)); } catch {}
    return { ...payload, stale: false };
  } catch (e) {
    if (cache) return { ...cache, stale: true, error: String(e) };
    return { matches: [], unmapped: [], fetchedAt: 0, stale: true, error: String(e) };
  }
}
