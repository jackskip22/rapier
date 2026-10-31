// SPDX-License-Identifier: AGPL-3.0-only
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const srgbOf = c => c <= .0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - .055;
const hash = (x, y, s) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x, y, s) => {
	const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
	const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const oilWeaveAt = (x, y) => clamp(.62 * vnoise(x / 2.6, y / 2.2, 3) + .28 * vnoise(x / 7, y / 6, 4) + .25 * (hash(x, y, 1) - .5) + .05);
export const OIL_MEDIA = {
	oil: {pickup: .9, plow: .1, ridge: .5, gloss: 1, hold: 40, body: 1.6, wetLife: Infinity, cover: .9, wetMix: 1.6, absorb: 1.2, absorbMax: .11, take: .3, tipMax: .35, coverK: 20},
	acrylic: {pickup: .1, plow: .015, ridge: .9, gloss: .12, hold: 14, body: .55, wetLife: 4, cover: .97, wetMix: .3, absorb: .1, absorbMax: .1, take: .03, tipMax: .3, coverK: 7}
};
export const OIL_CANVAS = {contact: .12, relief: .2};
export const OIL_LOOK = {valueJitter: .35, landSpan: .1, settleLen: .65, liftLen: .25, landPile: 0, bodyLight: 3, volumeLight: 2, ridgeFade: .1, bumpRandom: .3, loadVar: .3,
	gSpread: .6, landBehind: .2, swellLen: .2, swellHair: 1, depSwell: .5, gateSpan: .15, landRound: .7,
	vFull: 2, vGamma: 1, vMax: 1.5, diffuse: .7, spec: 1, cavity: .6,
	fine: 2.5, fineW: 2.6, fineLen: 140, fineFloor: .35, fineSharp: .22, fineTurn: .3, fineTake: .05, dryStreak: .45, dryLen: .9, wander: .03, wanderLen: 2, lightOver: .75, specRidge: .25, specSheen: .04, grayWet: .4, clumpVar: .25, clumpPx: 10, clumpLoad: .25, landDots: 1.2, dashPx: 9, pickShare: .02, lightKeep: .25, curlWander: 40, curlFlat: .8, hairW: .8, colourK: 4, loadCover: 4, volSat: 1, hairPx: 1.6, pickFade: .95, edgeDots: .08, hairSoft: 1.2,
	dryTrack: .6, dryReach: 1.35, dryPow: .7, drySoft: .35, dryThin: .2, fleck: .25, fleckPx: 6, fleckShare: .3, hairVal: .3, liftLip: .3, wobPx: .4, wobLen: 30};
export const OIL_FOOTPRINT = [[-.86, -.12, .07], [-.74, .25, .2], [-.57, .05, .11], [-.27, -.01, .2], [.04, .05, .13], [.02, -.36, .11],
	[.26, -.05, .13], [.44, -.07, .06], [.55, .13, .07], [.45, -.53, .09], [.78, -.14, .16], [.28, -.54, .04], [.95, .05, .05], [-.97, .1, .05]];
const OIL_V = 256, OIL_V_MAX = 2047, OIL_G = 24, REL_LO = -.5, REL_SPAN = 2.1;
export const OIL_LAYER_COUNT = 3, OIL_LAYER_STRIDE = 22, OIL_GPU_LAYER_BYTES = 32, OIL_LAYER_VOLUME = 4096;
export function oilLayerPixel(A, k, out) {
	let r = 0, g = 0, b = 0, a = 0;
	for (let layer = 0; layer < OIL_LAYER_COUNT; layer++) {
		const j = k + layer * 4, cover = A[k + 12 + layer] / 65535, w = cover * (1 - a);
		r += A[j] / 65535 * w; g += A[j + 1] / 65535 * w; b += A[j + 2] / 65535 * w; a += w;
	}
	out[0] = r; out[1] = g; out[2] = b; out[3] = a; return out;
}
export const oilVolumeOf = o => (o >>> 5) / OIL_V;
export const oilGrooveOf = o => (o & 31) / OIL_G;
const relOf = b => (b & 127) / 127 * REL_SPAN + REL_LO;

export const OIL_GPU = {registered: false};

export function oilInputClock(clock, delta, stamp) {
	if (!Number.isFinite(delta) || delta < 0 || stamp != null && (!Number.isFinite(stamp) || stamp < 0)) throw new RangeError('Invalid paint time');
	const dt = stamp != null && clock.stamp != null ? Math.max(0, (stamp - clock.stamp) / 1000) : delta;
	return {time: clock.time + dt, stamp: stamp ?? null};
}
export function oilTimedArgs(args, input) {
	if (!Array.isArray(args) || args.length < 3 || args.length > 11 || args.some((v, i) => i < 10 ? !Number.isFinite(v) : typeof v !== 'boolean') ||
		Math.abs(args[0]) > 1e6 || Math.abs(args[1]) > 1e6 || args[2] < 0 || args[5] != null && args[5] < 0 ||
		input?.time != null && (!Number.isFinite(input.time) || input.time < 0))
		throw Object.assign(new RangeError('Invalid paint sample'), {code: 'OIL_INPUT_INVALID'});
	const out = args.slice(0, 10); out[10] = input?.time ?? null; return out;
}

export function shadeOil(surface, out, box, byte) {
	const O = surface.oil, VO = surface.volume, D = surface.data, W = surface.width, Hh = surface.height, L = OIL_LOOK;
	const tox = surface.toothOX || 0, toy = surface.toothOY || 0, Pd = 14;
	const x0 = Math.max(0, box.x0 - Pd), y0 = Math.max(0, box.y0 - Pd), x1 = Math.min(W - 1, box.x1 + Pd), y1 = Math.min(Hh - 1, box.y1 + Pd);
	const bw = x1 - x0 + 1, bh = y1 - y0 + 1, N = bw * bh;
	if (bw <= 0 || bh <= 0) return;
	const H = new Float32Array(N), Hb = new Float32Array(N), tmp = new Float32Array(N), Pr = new Float32Array(N), Pb = new Float32Array(N), Vv = new Float32Array(N);
	for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
		const i = (y + y0) * W + x + x0, o = O[i], k = y * bw + x;
		if (!o) continue;
		const v = oilVolumeOf(o), rel = relOf(VO ? VO[i] : 0);
		Vv[k] = v; Pr[k] = v > .03 ? 1 : 0;
		H[k] = L.volumeLight * v / (1 + L.volSat * v) + rel * Math.min(1, v * 2.5) + OIL_CANVAS.relief * oilWeaveAt(x + x0 + tox, y + y0 + toy) * Math.exp(-3 * v);
	}
	for (let y = 0; y < bh; y++) for (let x = 1; x < bw - 1; x++) tmp[y * bw + x] = (H[y * bw + x - 1] + 2 * H[y * bw + x] + H[y * bw + x + 1]) * .25;
	for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) H[y * bw + x] = (tmp[(y - 1) * bw + x] + 2 * tmp[y * bw + x] + tmp[(y + 1) * bw + x]) * .25;
	if (L.fine > 0) for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const k = y * bw + x, o = O[(y + y0) * W + x + x0]; if (o & 31) H[k] -= oilGrooveOf(o) * Math.min(1, Vv[k] * 2.5); }
	const rr = 4;
	for (let y = 0; y < bh; y++) { let s = 0; const o = y * bw; for (let x = -rr; x < bw; x++) { if (x + rr < bw) s += H[o + x + rr]; if (x - rr - 1 >= 0) s -= H[o + x - rr - 1]; if (x >= 0) tmp[o + x] = s / (2 * rr + 1); } }
	for (let x = 0; x < bw; x++) { let s = 0; for (let y = -rr; y < bh; y++) { if (y + rr < bh) s += tmp[(y + rr) * bw + x]; if (y - rr - 1 >= 0) s -= tmp[(y - rr - 1) * bw + x]; if (y >= 0) Hb[y * bw + x] = s / (2 * rr + 1); } }
	const re = 9;
	for (let y = 0; y < bh; y++) { let sm = 0; const o = y * bw; for (let x = -re; x < bw; x++) { if (x + re < bw) sm += Pr[o + x + re]; if (x - re - 1 >= 0) sm -= Pr[o + x - re - 1]; if (x >= 0) tmp[o + x] = sm / (2 * re + 1); } }
	for (let x = 0; x < bw; x++) { let sm = 0; for (let y = -re; y < bh; y++) { if (y + re < bh) sm += tmp[(y + re) * bw + x]; if (y - re - 1 >= 0) sm -= tmp[(y - re - 1) * bw + x]; if (y >= 0) Pb[y * bw + x] = sm / (2 * re + 1); } }
	let lx = -.5, ly = -.62, lz = .6; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
	let hx = lx, hy = ly, hz = lz + 1; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
	const ow = box.x1 - box.x0 + 1;
	for (let y = Math.max(0, box.y0); y <= Math.min(Hh - 1, box.y1); y++) for (let x = Math.max(0, box.x0); x <= Math.min(W - 1, box.x1); x++) {
		const i = y * W + x, o = O[i]; if (!o) continue;
		const a = D[i * 4 + 3]; if (a <= 0) continue;
		const k = (y - y0) * bw + x - x0;
		const km = x > x0 ? k - 1 : k, kp = x < x1 ? k + 1 : k, kn = y > y0 ? k - bw : k, ks = y < y1 ? k + bw : k;
		const kbm = x > x0 + 2 ? k - 3 : k, kbp = x < x1 - 2 ? k + 3 : k, kbn = y > y0 + 2 ? k - 3 * bw : k, kbs = y < y1 - 2 ? k + 3 * bw : k;
		const gx = (H[kp] - H[km]) * .5 + L.bodyLight * (Hb[kbp] - Hb[kbm]) / 6, gy = (H[ks] - H[kn]) * .5 + L.bodyLight * (Hb[kbs] - Hb[kbn]) / 6, nl = 1 / Math.sqrt(gx * gx + gy * gy + 1);
		const nx = -gx * nl, ny = -gy * nl, nz = nl, ndl = nx * lx + ny * ly + nz * lz, ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
		const shade = clamp(1 + L.diffuse * (ndl - lz) / Math.max(.2, 1 - lz), .6, 1.06);
		const cav = clamp(1 - Math.max(0, Hb[k] - H[k]) * .3 * L.cavity, 1 - .28 * L.cavity, 1), crest = clamp((H[k] - Hb[k]) * 1.6) * clamp((Pb[k] - .9) * 10);
		const v = Vv[k], gloss = (VO && VO[i] >> 7 ? OIL_MEDIA.acrylic.gloss : OIL_MEDIA.oil.gloss) * clamp(v * 2);
		const n2 = ndh * ndh, n4 = n2 * n2, n8 = n4 * n4;
		const spec = Math.round(255 * L.spec * gloss * (L.specRidge * n8 * crest + L.specSheen * n8 * Math.sqrt(crest)));
		const yp = Math.max(0, .2126 * (D[i * 4] + 1 - a) + .7152 * (D[i * 4 + 1] + 1 - a) + .0722 * (D[i * 4 + 2] + 1 - a));
		const cr = D[i * 4] + 1 - a, cg2 = D[i * 4 + 1] + 1 - a, cb = D[i * 4 + 2] + 1 - a, dk = clamp((cb - Math.max(cr, cg2)) * 3),
		 m = 1 - (1 - shade * cav) * (1 - L.lightKeep * yp), d = L.vFull > 0 ? 1 + (Math.max(L.vFloor ?? 0, Math.min(L.vMax, (v / L.vFull) ** L.vGamma)) - 1) * (v > L.vFull ? dk : 1) : 1, q = ((y - box.y0) * ow + (x - box.x0)) * 4;
		for (let ch = 0; ch < 3; ch++) {
			const col = D[i * 4 + ch] + 1 - a, t = clamp((d === 1 ? col : col ** d) * m);
			out[q + ch] = Math.min(255, byte(a >= 1 ? t : clamp(1 - (1 - t) / a)) + spec);
		}
	}
}
export {srgbOf as oilSrgb};

