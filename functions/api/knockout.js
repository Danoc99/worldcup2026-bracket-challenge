import { json, slug, KNOCKOUT_LOCK_ISO } from "../_lib/util.js";

// All valid match IDs — used to strip unknown keys from incoming picks.
const ALL_MATCH_IDS = [
  "R32_1","R32_2","R32_3","R32_4","R32_5","R32_6","R32_7","R32_8",
  "R32_9","R32_10","R32_11","R32_12","R32_13","R32_14","R32_15","R32_16",
  "R16_1","R16_2","R16_3","R16_4","R16_5","R16_6","R16_7","R16_8",
  "QF_1","QF_2","QF_3","QF_4","SF_1","SF_2","FINAL",
];
const VALID_IDS = new Set(ALL_MATCH_IDS);

// Fixed bracket topology for consistency validation.
const BRACKET_TREE = {
  R16_1:["R32_1","R32_2"], R16_2:["R32_3","R32_4"], R16_3:["R32_5","R32_6"], R16_4:["R32_7","R32_8"],
  R16_5:["R32_9","R32_10"], R16_6:["R32_11","R32_12"], R16_7:["R32_13","R32_14"], R16_8:["R32_15","R32_16"],
  QF_1:["R16_1","R16_2"], QF_2:["R16_3","R16_4"], QF_3:["R16_5","R16_6"], QF_4:["R16_7","R16_8"],
  SF_1:["QF_1","QF_2"], SF_2:["QF_3","QF_4"],
  FINAL:["SF_1","SF_2"],
};

export async function onRequestPost({ request, env }) {
  const POOL = env.POOL;
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }

  const name = (body.name || "").trim();
  const pin = (body.pin || "").trim();
  const picks = body.picks;
  if (!name || !pin) return json({ error: "Name and PIN required." }, 400);
  if (!picks || typeof picks !== "object") return json({ error: "Missing picks." }, 400);

  // PIN check via existing group-stage entry (same identity).
  const entryKey = "entry:" + slug(name);
  let existing = null;
  try { existing = await POOL.get(entryKey, "json"); } catch {}
  if (!existing) return json({ error: "No group-stage entry found for this name. Submit your group picks first." }, 404);
  if (existing.pin !== pin) return json({ error: "Wrong PIN." }, 403);

  // Lock check.
  if (Date.now() >= new Date(KNOCKOUT_LOCK_ISO).getTime()) {
    return json({ error: "Knockout picks are locked." }, 423);
  }

  // Strip unknown IDs and validate bracket consistency: each R16+ pick must be
  // the player's predicted winner from one of the two feeder matches.
  const clean = {};
  for (const [id, team] of Object.entries(picks)) {
    if (!VALID_IDS.has(id)) continue;
    if (typeof team !== "string" || !team.trim()) continue;
    clean[id] = team.trim();
  }

  for (const [id, feeders] of Object.entries(BRACKET_TREE)) {
    if (!clean[id]) continue; // unpicked — fine
    const [a, b] = feeders;
    const pickedA = clean[a];
    const pickedB = clean[b];
    // If neither feeder pick is present yet, allow it (partial bracket save).
    if (!pickedA && !pickedB) continue;
    // If at least one feeder is picked, the later pick must match one of them.
    const validOptions = [pickedA, pickedB].filter(Boolean);
    if (validOptions.length > 0 && !validOptions.includes(clean[id])) {
      return json({ error: `Inconsistent pick for ${id}: ${clean[id]} can't reach that match based on your earlier picks.` }, 400);
    }
  }

  const key = "knockout:" + slug(name);
  await POOL.put(key, JSON.stringify({ picks: clean, updatedAt: Date.now() }));
  return json({ ok: true });
}
