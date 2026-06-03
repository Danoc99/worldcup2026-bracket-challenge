import { json, hashStr } from "../_lib/util.js";

export async function onRequestPost({ request, env }) {
  const POOL = env.POOL;
  let existing = null;
  try { existing = await POOL.get("config", "json"); } catch {}
  if (existing) return json({ error: "Pool already set up." }, 409);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const poolName = (body.poolName || "").trim();
  const adminPassword = (body.adminPassword || "").trim();
  if (!poolName || !adminPassword) return json({ error: "Pool name and admin password required." }, 400);

  await POOL.put("config", JSON.stringify({
    poolName: poolName.toUpperCase().slice(0, 40),
    adminHash: hashStr(adminPassword),
    createdAt: Date.now(),
  }));
  await POOL.put("manualResults", JSON.stringify({ groups: {} }));
  return json({ ok: true, poolName: poolName.toUpperCase().slice(0, 40) });
}
