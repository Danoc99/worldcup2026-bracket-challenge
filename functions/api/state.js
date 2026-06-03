import { json } from "../_lib/util.js";
import { getGroupOrders } from "../_lib/fd.js";

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

  // live orders from football-data (cached, serve-stale on failure)
  const api = await getGroupOrders(env);

  // merge: admin override wins, else API, else pending(null)
  const groups = {};
  for (const L of LETTERS) {
    if (manual.groups[L]) groups[L] = { ...manual.groups[L], source: "admin" };
    else if (api.groups[L]) groups[L] = api.groups[L];
  }

  return json({
    config: safeConfig,
    entries,
    groups,
    meta: { fetchedAt: api.fetchedAt, stale: api.stale, error: api.error || null, unmapped: api.unmapped || [] },
  });
}
