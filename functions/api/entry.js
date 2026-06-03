import { json, slug, LOCK_ISO } from "../_lib/util.js";

const LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export async function onRequestPost({ request, env }) {
  const POOL = env.POOL;
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }

  const name = (body.name || "").trim();
  const pin = (body.pin || "").trim();
  const predictions = body.predictions;
  if (!name || !pin) return json({ error: "Name and PIN required." }, 400);

  // validate predictions: 12 groups, each an array of 4 strings
  if (!predictions || typeof predictions !== "object") return json({ error: "Missing predictions." }, 400);
  for (const L of LETTERS) {
    const arr = predictions[L];
    if (!Array.isArray(arr) || arr.length !== 4 || new Set(arr).size !== 4) {
      return json({ error: `Group ${L} must rank all 4 teams.` }, 400);
    }
  }

  const key = "entry:" + slug(name);
  let existing = null;
  try { existing = await POOL.get(key, "json"); } catch {}
  if (existing && existing.pin !== pin) return json({ error: "Name taken — wrong PIN." }, 403);

  const locked = Date.now() >= new Date(LOCK_ISO).getTime();
  if (locked && existing) return json({ error: "Picks are locked." }, 423);

  await POOL.put(key, JSON.stringify({ name, pin, predictions, updatedAt: Date.now() }));
  return json({ ok: true });
}
