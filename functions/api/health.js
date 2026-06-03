import { json } from "../_lib/util.js";
import { getGroupOrders } from "../_lib/fd.js";

// Open this URL anytime (e.g. before the tournament and during) to confirm the
// football-data connection works and every team name mapped cleanly.
export async function onRequestGet({ env }) {
  const keySet = !!(env.FOOTBALL_DATA_KEY && env.FOOTBALL_DATA_KEY.length > 5);
  const res = await getGroupOrders(env, { force: true });
  const parsedGroups = Object.keys(res.groups).sort();
  const summary = {};
  for (const L of parsedGroups) summary[L] = { status: res.groups[L].status, teams: res.groups[L].order };

  return json({
    apiKeyConfigured: keySet,
    reachable: !res.error,
    error: res.error || null,
    servedFromStaleCache: res.stale,
    groupsParsed: parsedGroups.length,
    unmappedTeamNames: res.unmapped || [],   // should be [] — anything here needs an alias added
    fetchedAt: res.fetchedAt ? new Date(res.fetchedAt).toISOString() : null,
    groups: summary,
    note: parsedGroups.length === 0
      ? "0 groups parsed is normal BEFORE the tournament starts (no standings yet). Re-check after June 11."
      : "Looks good. unmappedTeamNames should be empty.",
  });
}
