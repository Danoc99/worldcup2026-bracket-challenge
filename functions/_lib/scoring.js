// Mirror of scoring constants/functions from src/data.js so functions/ can score
// without importing the frontend module. Keep these three files in sync:
//   src/data.js, functions/_lib/scoring.js, test/transform.test.mjs

export const SCORE_MATRIX = [
  [25, 15, 5, 0], // actual 1st
  [15, 20, 5, 0], // actual 2nd
  [5, 5, 15, 0],  // actual 3rd
  [0, 0, 0, 0],   // actual 4th
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

export const KNOCKOUT_SCORES = { R32: 20, R16: 40, QF: 80, SF: 160, FINAL: 320 };

const ALL_MATCH_IDS = [
  "R32_1","R32_2","R32_3","R32_4","R32_5","R32_6","R32_7","R32_8",
  "R32_9","R32_10","R32_11","R32_12","R32_13","R32_14","R32_15","R32_16",
  "R16_1","R16_2","R16_3","R16_4","R16_5","R16_6","R16_7","R16_8",
  "QF_1","QF_2","QF_3","QF_4","SF_1","SF_2","FINAL",
];

export function scoreKnockout(picks, results) {
  if (!picks || !results) return 0;
  let pts = 0;
  for (const id of ALL_MATCH_IDS) {
    const round = id === "FINAL" ? "FINAL" : id.split("_")[0];
    if (picks[id] && results[id]?.winner && picks[id] === results[id].winner) {
      pts += KNOCKOUT_SCORES[round];
    }
  }
  return pts;
}
