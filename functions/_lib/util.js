// Tiny shared helpers used by the Pages Functions.
export const LOCK_ISO = "2026-06-11T16:00:00Z"; // group stage kicks off
export const KNOCKOUT_LOCK_ISO = "2026-06-28T19:00:00Z"; // first R32 kickoff (3 PM EDT)

export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h = h >>> 0; }
  return h.toString(36);
}
export function slug(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
