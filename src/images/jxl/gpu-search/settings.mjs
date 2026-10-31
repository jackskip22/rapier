// SPDX-License-Identifier: MIT
import {QUANT_SHAPE} from '../photo-dct.mjs';

const DEFAULT_DCT8 = [[3150.0, 0.0, -0.4, -0.4, -0.4, -2.0], [560.0, 0.0, -0.3, -0.3, -0.3, -0.3], [512.0, -2.0, -1.0, 0.0, -1.0, -2.0]];
function defaultWeight(c, x, y) {
  const p = DEFAULT_DCT8[c], bands = [p[0]];
  for (let i = 1; i < p.length; i++) bands.push(bands[i - 1] * (p[i] > 0 ? 1 + p[i] : 1 / (1 - p[i])));
  const dx = x / 7, dy = y / 7, at = Math.sqrt(dx * dx + dy * dy) * (bands.length - 1) / Math.SQRT2;
  const i = Math.min(bands.length - 2, Math.floor(at));
  return bands[i] * Math.pow(bands[i + 1] / bands[i], at - i);
}
const rapierStep = (c, k) => [0.84, 7, 5.6][c] * QUANT_SHAPE[k] * (1 + [1, 0, 5][c] * Math.sqrt(((k & 7) ** 2 + (k >> 3) ** 2) / 98));
const LUMA = (1 / defaultWeight(1, 1, 0)) / rapierStep(1, 1);
const RATIO = Float64Array.from({length: 192}, (_, i) => {
  const c = i >> 6, k = i & 63; return k ? (1 / defaultWeight(c, k & 7, k >> 3)) / rapierStep(c, k) / LUMA : 1;
});
export const defaultChroma = (c, k) => RATIO[c * 64 + k];

export const DEAD_ZONES = [0.58, 0.62, 0.56, 0.62, 0.58, 0.62];

export const SETTINGS = {
  plain: {},
  v6: {tune: defaultChroma, deadzone: DEAD_ZONES, epfScale: 2, filterAlways: true},
  v6soft: {tune: defaultChroma, deadzone: DEAD_ZONES, epfScale: 1.5},
  v6strong: {tune: defaultChroma, deadzone: DEAD_ZONES, epfScale: 3, filterAlways: true},
  v6chroma: {tune: (c, k) => defaultChroma(c, k) * (c === 1 ? 1 : 1.25), deadzone: DEAD_ZONES, epfScale: 2, filterAlways: true},
  v6tuned: {tune: (c, k) => defaultChroma(c, k) * [1.15, 1, 1.225][c] * (1 + [0.45, 0.15, 0][c] * Math.sqrt(((k & 7) ** 2 + (k >> 3) ** 2) / 98)),
    deadzone: [0.64, 0.64, 0.515, 0.605, 0.58, 0.62], epfScale: 2, filterAlways: true},
  v6tuned2: {tune: (c, k) => { const r = Math.sqrt(((k & 7) ** 2 + (k >> 3) ** 2) / 98);
    return defaultChroma(c, k) * [1.075, 1, 1.225][c] * (1 + [0.45, 0.3, 0][c] * r) * (1 + [0, 0.1, 0][c] * r * r); },
    deadzone: [0.68, 0.68, 0.485, 0.62, 0.56, 0.62], epfScale: 2.2, filterAlways: true, dcScale: [1.225, 1.15, 1.225], cflScale: 0.775},
  v6tuned3: {tune: (c, k) => { const r = Math.sqrt(((k & 7) ** 2 + (k >> 3) ** 2) / 98);
    return defaultChroma(c, k) * [1.225, 1, 1.45][c] * (1 + [0.45, 0.45, 0][c] * r) * (1 + [0.15, 0.05, 0][c] * r * r); },
    deadzone: [0.72, 0.72, 0.485, 0.62, 0.52, 0.62], epfScale: 2.8, filterAlways: true, dcScale: [1.45, 1.3, 1.45], cflScale: 0.85},
  v6tuned4: {tune: (c, k) => { const r = Math.sqrt(((k & 7) ** 2 + (k >> 3) ** 2) / 98);
    return defaultChroma(c, k) * [1.3, 1, 1.675][c] * (1 + [0.45, 0.45, 0][c] * r) * (1 + [-0.15, 0.05, 0][c] * r * r); },
    deadzone: [0.72, 0.76, 0.485, 0.575, 0.54, 0.6], epfScale: 3, filterAlways: true, dcScale: [1.675, 1.35, 1.675], cflScale: 0.7},
};
