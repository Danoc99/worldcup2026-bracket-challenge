import { json } from "../_lib/util.js";

// Tournament complete — site is in spectator mode. The admin surface is disabled
// entirely, which removes the DJB2 collision attack surface: with no auth path,
// there is nothing to brute-force.
export async function onRequestPost() {
  return json({ error: "Tournament complete; admin surface is disabled." }, 410);
}
