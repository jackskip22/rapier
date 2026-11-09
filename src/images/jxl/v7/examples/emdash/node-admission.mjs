// SPDX-License-Identifier: MIT
const PEAKS = {"1":[[1000230,74964992],[12192768,229183488]],"3":[[1000230,74117120],[12192768,232955904]],"5":[[1000230,73773056],[12192768,231305216]],"7":[[1000230,428580864],[12192768,2637901824]],"8":[[1000230,619859968],[12192768,4838084608]],"9":[[1000230,958246912]]};
const VERIFY = [[1000230,57556992],[12192768,343670784]];
const BARE = 43610112;

function along(points, pixels) {
  if (!points?.length) return null;
  if (points.length === 1) return points[0][1] * Math.max(1, pixels / points[0][0]);
  let i = 1;
  while (i < points.length - 1 && points[i][0] < pixels) i++;
  const [[p0, b0], [p1, b1]] = [points[i - 1], points[i]];
  return Math.max(points[0][1], b0 + (b1 - b0) * (pixels - p0) / (p1 - p0));
}
export function nodeEstimate(stage, pixels) {
  const effort = stage?.options?.effort ?? 7;
  let rows = null;
  for (let e = effort; e <= 9 && !rows; e++) rows = PEAKS[e] ?? null;
  const encode = along(rows, pixels), check = along(VERIFY, pixels) ?? 0;
  return encode === null ? null : Math.ceil(BARE + encode + check);
}
