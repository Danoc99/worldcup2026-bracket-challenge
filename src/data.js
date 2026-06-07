export const LOCK_ISO = "2026-06-11T16:00:00Z";

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
