// Mirror of SCORE_MATRIX + scoreGroup from src/data.js so functions/ can score
// without importing the frontend module. Keep these two files in sync — the
// frontend renders projected points using src/data.js; the backend uses this
// file to compute player-rank snapshots on matchday boundaries.

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
