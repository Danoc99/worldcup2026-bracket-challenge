import { json } from "../_lib/util.js";

// Tournament complete — site is in spectator mode. No new entries or edits are
// accepted. Returning 410 also removes the PIN-check attack surface: without a
// write path, there's nothing to brute-force.
export async function onRequestPost() {
  return json({ error: "Tournament complete; entries are closed." }, 410);
}
