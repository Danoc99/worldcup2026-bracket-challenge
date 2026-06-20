import { json } from "../_lib/util.js";
import { getGroupOrders, getMatches } from "../_lib/fd.js";
import { playerMovementBetween } from "../_lib/transform.js";

const LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export async function onRequestGet({ env }) {
  const POOL = env.POOL;

  // config (never expose adminHash)
  let config = null;
  try { config = await POOL.get("config", "json"); } catch {}
  const safeConfig = config ? { poolName: config.poolName, createdAt: config.createdAt } : null;

  // entries (strip pins before sending to clients)
  const entries = [];
  try {
    const list = await POOL.list({ prefix: "entry:" });
    for (const k of list.keys) {
      const e = await POOL.get(k.name, "json");
      if (e) entries.push({ name: e.name, predictions: e.predictions, updatedAt: e.updatedAt });
    }
  } catch {}

  // admin manual overrides
  let manual = { groups: {} };
  try { manual = (await POOL.get("manualResults", "json")) || { groups: {} }; } catch {}
  let manualScores = {};
  try { manualScores = (await POOL.get("manualMatchScores", "json")) || {}; } catch {}

  // live orders + full fixtures list from football-data (cached, serve-stale on failure)
  const [api, fixtures] = await Promise.all([getGroupOrders(env), getMatches(env)]);

  // merge: admin override wins, else API, else pending(null)
  const groups = {};
  for (const L of LETTERS) {
    if (manual.groups[L]) groups[L] = { ...manual.groups[L], source: "admin" };
    else if (api.groups[L]) groups[L] = api.groups[L];
  }

  // Admin match-score overrides — by id, win over the feed even when the feed
  // has a score (so admin can also correct a wrong score, not just fill nulls).
  const matches = (fixtures.matches || []).map((m) => {
    const override = m.id != null ? manualScores[m.id] : null;
    if (!override) return m;
    return { ...m, homeScore: override.home, awayScore: override.away, scoreSource: "admin" };
  });

  // Player rank movement since the last per-group matchday boundary.
  // fd.js appends a snapshot every time any group crosses a clean boundary;
  // the delta between the two most recent snapshots is what we expose.
  // Computed from feed-only orders by design, so admin overrides don't show
  // up as phantom movement on the chip.
  let playerSnapshots = [];
  try { playerSnapshots = (await POOL.get("snapshots:players", "json")) || []; } catch {}
  const playerMovement = Array.isArray(playerSnapshots) && playerSnapshots.length >= 2
    ? playerMovementBetween(playerSnapshots[playerSnapshots.length - 2], playerSnapshots[playerSnapshots.length - 1])
    : {};

  return json({
    config: safeConfig,
    entries,
    groups,
    matches,
    meta: {
      fetchedAt: api.fetchedAt,
      stale: api.stale,
      error: api.error || null,
      unmapped: api.unmapped || [],
      playerMovement,
    },
  });
}
