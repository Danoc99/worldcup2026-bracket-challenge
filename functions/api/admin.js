import { json, hashStr, slug } from "../_lib/util.js";

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

  // delete a single entry by name (slugged to match the KV key)
  if (body.action === "deleteEntry") {
    const s = slug(body.name || "");
    if (!s) return json({ error: "Missing entry name." }, 400);
    const key = `entry:${s}`;
    const existing = await POOL.get(key);
    if (!existing) return json({ error: "Entry not found." }, 404);
    await POOL.delete(key);
    return json({ ok: true, deleted: s });
  }

  // Set or clear an R32 matchup in knockoutBracket.
  // body: { matchId: "R32_1", home: "France", away: "Brazil" }
  // Setting home/away to "" or null clears that matchup (back to TBD).
  if (body.action === "setBracketMatch") {
    const id = body.matchId || "";
    if (!/^R32_\d+$/.test(id)) return json({ error: "matchId must be R32_1 through R32_16." }, 400);
    const home = (body.home || "").trim() || null;
    const away = (body.away || "").trim() || null;
    let bracket = {};
    try { bracket = (await POOL.get("knockoutBracket", "json")) || {}; } catch {}
    if (!home && !away) {
      delete bracket[id];
    } else {
      bracket[id] = { home, away, source: "admin" };
    }
    bracket.updatedAt = Date.now();
    await POOL.put("knockoutBracket", JSON.stringify(bracket));
    return json({ ok: true });
  }

  // Set or clear a knockout match result override.
  // body: { matchId: "R32_1", winner: "France", status: "final" }
  // winner null/"" clears the override for that match.
  if (body.action === "setKnockoutResult") {
    const id = body.matchId || "";
    if (!id) return json({ error: "Missing matchId." }, 400);
    const winner = (body.winner || "").trim() || null;
    const status = body.status || "final";
    if (winner && !["live","final"].includes(status)) return json({ error: "status must be live or final." }, 400);
    let manual = { groups: {} };
    try { manual = (await POOL.get("manualResults", "json")) || { groups: {} }; } catch {}
    if (!manual.knockout) manual.knockout = {};
    if (!winner) {
      delete manual.knockout[id];
    } else {
      manual.knockout[id] = { winner, status };
    }
    manual.updatedAt = Date.now();
    await POOL.put("manualResults", JSON.stringify(manual));
    return json({ ok: true });
  }

  // Set or clear an admin override for a single match's final score, keyed by
  // football-data match id. Safeguard for the case where the feed flips a match
  // to FINISHED before populating score.fullTime.{home,away}. home/away null or
  // "" clears the override for that match.
  if (body.action === "setMatchScore") {
    const id = Number(body.matchId);
    if (!Number.isInteger(id) || id <= 0) return json({ error: "Bad matchId." }, 400);
    const blank = (v) => v === null || v === undefined || v === "";
    const clear = blank(body.home) && blank(body.away);
    let scores = {};
    try { scores = (await POOL.get("manualMatchScores", "json")) || {}; } catch {}
    if (clear) {
      delete scores[id];
    } else {
      const h = Number(body.home), a = Number(body.away);
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 99 || a > 99) {
        return json({ error: "Scores must be whole numbers 0–99." }, 400);
      }
      scores[id] = { home: h, away: a };
    }
    await POOL.put("manualMatchScores", JSON.stringify(scores));
    return json({ ok: true, cleared: clear });
  }

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
