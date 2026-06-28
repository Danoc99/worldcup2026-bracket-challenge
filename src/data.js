export const LOCK_ISO = "2026-06-11T16:00:00Z";
export const KNOCKOUT_LOCK_ISO = "2026-06-28T19:00:00Z"; // first R32 kickoff (3 PM EDT)

export const GROUPS = {
  A: ["Mexico", "South Korea", "South Africa", "Czechia"],
  B: ["Canada", "Switzerland", "Qatar", "Bosnia and Herzegovina"],
  C: ["Brazil", "Scotland", "Morocco", "Haiti"],
  D: ["United States", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Ecuador", "Ivory Coast", "Curaçao"],
  F: ["Netherlands", "Japan", "Tunisia", "Sweden"],
  G: ["Belgium", "Iran", "Egypt", "New Zealand"],
  H: ["Spain", "Uruguay", "Saudi Arabia", "Cape Verde"],
  I: ["France", "Norway", "Senegal", "Iraq"],
  J: ["Argentina", "Austria", "Algeria", "Jordan"],
  K: ["Portugal", "Colombia", "Uzbekistan", "DR Congo"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};
export const GROUP_IDS = Object.keys(GROUPS);

export const FLAG = {
  "Mexico": "🇲🇽", "South Korea": "🇰🇷", "South Africa": "🇿🇦", "Czechia": "🇨🇿",
  "Canada": "🇨🇦", "Switzerland": "🇨🇭", "Qatar": "🇶🇦", "Bosnia and Herzegovina": "🇧🇦",
  "Brazil": "🇧🇷", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Morocco": "🇲🇦", "Haiti": "🇭🇹",
  "United States": "🇺🇸", "Paraguay": "🇵🇾", "Australia": "🇦🇺", "Türkiye": "🇹🇷",
  "Germany": "🇩🇪", "Ecuador": "🇪🇨", "Ivory Coast": "🇨🇮", "Curaçao": "🇨🇼",
  "Netherlands": "🇳🇱", "Japan": "🇯🇵", "Tunisia": "🇹🇳", "Sweden": "🇸🇪",
  "Belgium": "🇧🇪", "Iran": "🇮🇷", "Egypt": "🇪🇬", "New Zealand": "🇳🇿",
  "Spain": "🇪🇸", "Uruguay": "🇺🇾", "Saudi Arabia": "🇸🇦", "Cape Verde": "🇨🇻",
  "France": "🇫🇷", "Norway": "🇳🇴", "Senegal": "🇸🇳", "Iraq": "🇮🇶",
  "Argentina": "🇦🇷", "Austria": "🇦🇹", "Algeria": "🇩🇿", "Jordan": "🇯🇴",
  "Portugal": "🇵🇹", "Colombia": "🇨🇴", "Uzbekistan": "🇺🇿", "DR Congo": "🇨🇩",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Croatia": "🇭🇷", "Ghana": "🇬🇭", "Panama": "🇵🇦"
};

export const SCORE_MATRIX = [
  [25, 15, 5, 0], // actual 1st
  [15, 20, 5, 0], // actual 2nd
  [5, 5, 15, 0],  // actual 3rd
  [0, 0, 0, 0],   // actual 4th
];
export const GROUP_TOTAL_MAX = 720;

export const POS_META = [
  { label: "1st", color: "#f5c542" },
  { label: "2nd", color: "#cfd8e6" },
  { label: "3rd", color: "#e0915a" },
  { label: "4th", color: "#5e6b85" },
];

export function scoreGroup(pred, actual) {
  if (!pred || !actual || actual.length < 4) return 0;
  let pts = 0;
  for (let a = 0; a < 4; a++) {
    const p = pred.indexOf(actual[a]);
    if (p >= 0) pts += SCORE_MATRIX[a][p];
  }
  return pts;
}

// tallyPicks(entries) → { [groupId]: [{team→count}, {team→count}, {team→count}, {team→count}], total }
// One bucket per slot (0=1st .. 3=4th) per group. `total` is the entry count used,
// so the UI can render "X of N" without re-counting. Entries without predictions
// for a given group don't contribute to that group's buckets.
// Knockout scoring: points awarded when the picked winner of a match is correct.
// Binary per-match — same team, same match = full points, no partial credit.
export const KNOCKOUT_SCORES = { R32: 20, R16: 40, QF: 80, SF: 160, FINAL: 320 };

// All 31 match IDs in bracket order (left→right, top→bottom within each round).
export const ALL_MATCH_IDS = [
  "R32_1","R32_2","R32_3","R32_4","R32_5","R32_6","R32_7","R32_8",
  "R32_9","R32_10","R32_11","R32_12","R32_13","R32_14","R32_15","R32_16",
  "R16_1","R16_2","R16_3","R16_4","R16_5","R16_6","R16_7","R16_8",
  "QF_1","QF_2","QF_3","QF_4",
  "SF_1","SF_2",
  "FINAL",
];

// Fixed bracket topology: which two prior-round matches feed each later match.
// Hardcoded because FIFA's bracket is set once at R32 and never reseeded.
export const BRACKET_TREE = {
  R16_1: ["R32_1","R32_2"],   R16_2: ["R32_3","R32_4"],
  R16_3: ["R32_5","R32_6"],   R16_4: ["R32_7","R32_8"],
  R16_5: ["R32_9","R32_10"],  R16_6: ["R32_11","R32_12"],
  R16_7: ["R32_13","R32_14"], R16_8: ["R32_15","R32_16"],
  QF_1:  ["R16_1","R16_2"],   QF_2:  ["R16_3","R16_4"],
  QF_3:  ["R16_5","R16_6"],   QF_4:  ["R16_7","R16_8"],
  SF_1:  ["QF_1","QF_2"],     SF_2:  ["QF_3","QF_4"],
  FINAL: ["SF_1","SF_2"],
};

// Score a player's knockout bracket picks against confirmed match results.
// picks:   { R32_1: "France", R16_1: "France", ... }
// results: { R32_1: { winner: "France", status: "final" }, ... }
// Returns total knockout pts (only confirmed winners score; TBD = 0).
export function scoreKnockout(picks, results) {
  if (!picks || !results) return 0;
  let pts = 0;
  for (const id of ALL_MATCH_IDS) {
    const round = id.includes("FINAL") ? "FINAL" : id.split("_")[0];
    if (picks[id] && results[id]?.winner && picks[id] === results[id].winner) {
      pts += KNOCKOUT_SCORES[round];
    }
  }
  return pts;
}

export function tallyPicks(entries) {
  const out = { total: 0 };
  const list = Array.isArray(entries) ? entries : [];
  for (const g of GROUP_IDS) out[g] = [{}, {}, {}, {}];
  for (const e of list) {
    if (!e?.predictions) continue;
    out.total++;
    for (const g of GROUP_IDS) {
      const pred = e.predictions[g];
      if (!Array.isArray(pred)) continue;
      for (let i = 0; i < 4; i++) {
        const t = pred[i];
        if (!t) continue;
        out[g][i][t] = (out[g][i][t] || 0) + 1;
      }
    }
  }
  return out;
}
export function slug(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}
export function clone(o) { return JSON.parse(JSON.stringify(o)); }
