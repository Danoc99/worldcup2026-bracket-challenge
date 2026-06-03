import { ordersFromStandings, ordersFromMatches } from "./transform.js";

const TTL_MS = 10 * 60 * 1000; // refresh at most every 10 minutes
const BASE = "https://api.football-data.org/v4/competitions/WC";

async function fdFetch(path, env) {
  const r = await fetch(BASE + path, { headers: { "X-Auth-Token": env.FOOTBALL_DATA_KEY || "" } });
  if (!r.ok) throw new Error("football-data HTTP " + r.status);
  return r.json();
}

// Returns { groups, unmapped, fetchedAt, stale, error? }.
// On any failure it serves the last good cached value (stale:true) so the
// site never goes blank mid-tournament because of a transient API hiccup.
export async function getGroupOrders(env, { force = false } = {}) {
  let cache = null;
  try { const raw = await env.POOL.get("cache:standings"); cache = raw ? JSON.parse(raw) : null; } catch {}
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return { ...cache, stale: false };

  try {
    let parsed = ordersFromStandings(await fdFetch("/standings", env));
    if (Object.keys(parsed.groups).length === 0) {
      // standings empty/unavailable for this comp type -> compute from matches
      parsed = ordersFromMatches(await fdFetch("/matches?stage=GROUP_STAGE", env));
    }
    const payload = {
      groups: parsed.groups,
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
