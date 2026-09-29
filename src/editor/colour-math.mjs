// SPDX-License-Identifier: AGPL-3.0-only
function _rapierSrgbToLinear(channel) {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function _rapierLinearToSrgb(linear) {
	return linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}
function _rapierLinearSrgbToOklab(r, g, b) {
	const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
	const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
	const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
	const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
	return {
		L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
		a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
		b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
	};
}
function _rapierOklabToLinearSrgb(L, a, b) {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
	const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
	return {
		r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
	};
}
function _rapierHexToOklch(hex) {
	const n = parseInt(String(hex).slice(1), 16);
	const r = _rapierSrgbToLinear((n >> 16) & 255), g = _rapierSrgbToLinear((n >> 8) & 255), b = _rapierSrgbToLinear(n & 255);
	const lab = _rapierLinearSrgbToOklab(r, g, b);
	const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
	let H = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
	if (H < 0) H += 360;
	return { L: lab.L, C, H };
}
function _rapierOklchInSrgbGamut(L, C, H) {
	const hr = H * Math.PI / 180;
	const lin = _rapierOklabToLinearSrgb(L, C * Math.cos(hr), C * Math.sin(hr));
	const eps = 1e-4;
	return lin.r >= -eps && lin.r <= 1 + eps && lin.g >= -eps && lin.g <= 1 + eps && lin.b >= -eps && lin.b <= 1 + eps;
}
function _rapierClampOklchChroma(L, C, H) {
	if (C <= 0 || _rapierOklchInSrgbGamut(L, C, H)) return C;
	let lo = 0, hi = C;
	for (let pass = 0; pass < 28; pass++) {
		const mid = (lo + hi) / 2;
		if (_rapierOklchInSrgbGamut(L, mid, H)) lo = mid; else hi = mid;
	}
	return lo;
}
function _rapierOklchToHex(L, C, H) {
	const hr = H * Math.PI / 180;
	const lin = _rapierOklabToLinearSrgb(L, C * Math.cos(hr), C * Math.sin(hr));
	const channel = value => {
		const clamped = Math.max(0, Math.min(1, value));
		return Math.max(0, Math.min(255, Math.round(_rapierLinearToSrgb(clamped) * 255)));
	};
	const hex = n => n.toString(16).padStart(2, '0');
	return '#' + hex(channel(lin.r)) + hex(channel(lin.g)) + hex(channel(lin.b));
}
function _rapierRelativeLuminance(hex) {
	const n = parseInt(String(hex).slice(1), 16);
	return 0.2126 * _rapierSrgbToLinear((n >> 16) & 255)
		+ 0.7152 * _rapierSrgbToLinear((n >> 8) & 255)
		+ 0.0722 * _rapierSrgbToLinear(n & 255);
}
function _rapierContrastRatio(hexA, hexB) {
	const a = _rapierRelativeLuminance(hexA), b = _rapierRelativeLuminance(hexB);
	const lighter = Math.max(a, b), darker = Math.min(a, b);
	return (lighter + 0.05) / (darker + 0.05);
}

// The editor and a portable drawing derive exactly the same dark colour.
function _rapierColorForDarkPaper(key) {
	const { L, C, H } = _rapierHexToOklch(key);
	let Ld = (L + 1) / 2;
	let hex = _rapierOklchToHex(Ld, _rapierClampOklchChroma(Ld, C, H), H);
	for (let guard = 0; _rapierContrastRatio(hex, '#000000') < 4.5 && Ld < 0.97 && guard < 200; guard++) {
		Ld = Math.min(0.97, Ld + 0.005);
		hex = _rapierOklchToHex(Ld, _rapierClampOklchChroma(Ld, C, H), H);
	}
	return hex;
}

export { _rapierColorForDarkPaper, _rapierSrgbToLinear, _rapierLinearToSrgb, _rapierLinearSrgbToOklab, _rapierOklabToLinearSrgb, _rapierHexToOklch, _rapierOklchInSrgbGamut, _rapierClampOklchChroma, _rapierOklchToHex, _rapierRelativeLuminance, _rapierContrastRatio };
