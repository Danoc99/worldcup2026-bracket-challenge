import { json, hashStr } from "../_lib/util.js";

const LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export async function onRequestPost({ request, env }) {
  const POOL = env.POOL;
  let config = null;
  try { config = await POOL.get("config", "json"); } catch {}
  if (!config) return json({ error: "Pool not set up." }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (hashStr((body.adminPassword || "").trim()) !== config.adminHash) {
    return json({ error: "Wrong admin password." }, 403);
  }

  // verify-only ping (used to unlock the admin panel)
  if (body.action === "verify") return json({ ok: true });

  // save overrides: body.groups = { A: {order:[4], status:"live"|"final"} | null, ... }
  let manual = { groups: {} };
  try { manual = (await POOL.get("manualResults", "json")) || { groups: {} }; } catch {}

  const incoming = body.groups || {};
  for (const L of LETTERS) {
    if (!(L in incoming)) continue;
    const v = incoming[L];
    if (v === null) { delete manual.groups[L]; continue; }   // revert this group to the API feed
    if (!Array.isArray(v.order) || v.order.length !== 4 || new Set(v.order).size !== 4) {
      return json({ error: `Group ${L}: order must list 4 unique teams.` }, 400);
    }
    if (v.status !== "live" && v.status !== "final") {
      return json({ error: `Group ${L}: status must be live or final.` }, 400);
    }
    manual.groups[L] = { order: v.order, status: v.status };
  }

  manual.updatedAt = Date.now();
  await POOL.put("manualResults", JSON.stringify(manual));
  return json({ ok: true });
}
