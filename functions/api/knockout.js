import { json } from "../_lib/util.js";

// Tournament complete — site is in spectator mode. See entry.js for context.
export async function onRequestPost() {
  return json({ error: "Tournament complete; knockout picks are closed." }, 410);
}
