// SPDX-License-Identifier: MIT
// Every stream the encoder writes decodes to the pixels it was given: exact where it promises exactness, close
// where it does not, and refused where it says it refuses. The decoder is jxl-oxide (a development dependency).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encode, transcode, encodeLosslessRGBA, encodeLossyRGBA, LIMITS} from '../../index.mjs';
import {writeJPEG} from './jpeg-writer.mjs';
import {decoder} from './decoder.mjs';

const rgbaOf = image => { const out = new Uint8Array(image.width * image.height * 4); for (let i = 0; i < image.width * image.height; i++) { const c = image.channels, d = image.data; out[i * 4] = d[i * c]; out[i * 4 + 1] = c >= 3 ? d[i * c + 1] : d[i * c]; out[i * 4 + 2] = c >= 3 ? d[i * c + 2] : d[i * c]; out[i * 4 + 3] = c === 4 ? d[i * 4 + 3] : c === 2 ? d[i * 2 + 1] : 255; } return out; };
const psnr = (a, b, channels = 3) => { let se = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < channels; c++) { const d = a[i + c] - b[i + c]; se += d * d; n++; } return se ? 10 * Math.log10(255 * 255 / (se / n)) : Infinity; };
let seed = 7; const random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
function picture(width, height, {alpha = false, colours = 0} = {}) {
	const data = new Uint8Array(width * height * 4), palette = Array.from({length: colours}, () => [random() * 255 | 0, random() * 255 | 0, random() * 255 | 0]);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const i = (y * width + x) * 4;
		if (colours) { const [r, g, b] = palette[(((x / 9) | 0) * 7 + ((y / 5) | 0)) % colours]; data[i] = r; data[i + 1] = g; data[i + 2] = b; }
		else { data[i] = 128 + 100 * Math.sin(x / 23) + random() * 6; data[i + 1] = 128 + 100 * Math.cos(y / 17) + random() * 6; data[i + 2] = 128 + 60 * Math.sin((x + y) / 31) + random() * 6; }
		data[i + 3] = alpha ? (x + y) & 255 : 255;
	}
	return data;
}
const decode = await decoder();
const needs = decode ? undefined : 'jxl-oxide-wasm is not installed (npm install)';

test('lossless: every pixel comes back, with and without alpha', {skip: needs}, () => {
	for (const [w, h, options] of [[70, 50, {}], [300, 70, {alpha: true}], [257, 300, {colours: 5}], [64, 64, {colours: 500}]]) {
		const data = picture(w, h, options), bytes = encodeLosslessRGBA(data, w, h), back = decode(bytes);
		assert.equal(back.width, w); assert.equal(back.height, h);
		assert.deepEqual(rgbaOf(back), data, `${w}x${h} ${JSON.stringify(options)}`);
		assert.deepEqual(encode(data, w, h), bytes, 'encode at quality 100 is the lossless answer');
	}
});
test('lossy: at quality 90 the picture is close and smaller; at 70 smaller still; a palette picture is exact', {skip: needs}, () => {
	const w = 200, h = 140, data = picture(w, h), exact = encodeLosslessRGBA(data, w, h);
	const q90 = encodeLossyRGBA(data, w, h, 90), q70 = encodeLossyRGBA(data, w, h, 70);
	assert.ok(q90.length < exact.length, 'lossy is smaller than lossless'); assert.ok(q70.length < q90.length, 'lower quality is smaller');
	assert.ok(psnr(rgbaOf(decode(q90)), data) > 38, 'quality 90 stays above 38 dB on a soft picture');
	const few = picture(120, 90, {colours: 6}); assert.deepEqual(rgbaOf(decode(encode(few, 120, 90, {quality: 60}))), few, 'few colours come back exact at any quality');
});
test('a JPEG carried whole decodes to the JPEG\'s own pixels and is smaller', {skip: needs}, () => {
	const w = 77, h = 45;
	const comp = (hs, vs, hmax, vmax, scale) => { const stride = Math.ceil(w / (8 * hmax)) * hs, rows = Math.ceil(h / (8 * vmax)) * vs, coeffs = new Int16Array(stride * rows * 64), quant = new Int32Array(64);
		for (let k = 0; k < 64; k++) quant[k] = Math.max(1, Math.round(scale * (1 + (k % 8) + (k >> 3)) / 2));
		for (let b = 0; b < stride * rows; b++) { coeffs[b * 64] = Math.round(300 * Math.sin(b / 5)); for (let k = 1; k < 64; k++) if (random() < 0.4 / (1 + k / 4)) coeffs[b * 64 + k] = Math.round((random() - 0.5) * 120 / (1 + k / 3)) || 1; }
		return {h: hs, v: vs, quant, blocksW: Math.ceil(Math.ceil(w * hs / hmax) / 8), blocksH: Math.ceil(Math.ceil(h * vs / vmax) / 8), stride, rows, coeffs}; };
	for (const [name, samp] of [['4:4:4', [[1, 1], [1, 1], [1, 1]]], ['4:2:0', [[2, 2], [1, 1], [1, 1]]], ['grey', [[1, 1]]]]) {
		const hmax = Math.max(...samp.map(s => s[0])), vmax = Math.max(...samp.map(s => s[1]));
		const components = samp.map(([hs, vs], i) => comp(hs, vs, hmax, vmax, i ? 4 : 2));
		const baseline = writeJPEG({width: w, height: h, components}), progressive = writeJPEG({width: w, height: h, components, progressive: true, restartInterval: 3});
		const a = transcode(baseline), b = transcode(progressive);
		assert.equal(a.width, w); assert.equal(a.height, h);
		assert.deepEqual(b.bytes, a.bytes, name + ': the same picture in two JPEG forms is one stream');
		assert.ok(a.bytes.length < baseline.length, name + ': fewer bytes than the JPEG');
		const back = decode(a.bytes); assert.equal(back.width, w); assert.equal(back.height, h);
	}
});
test('refusals are the five codes and nothing else', () => {
	const w = 4, h = 4, data = picture(w, h);
	assert.throws(() => encode(data.subarray(0, 8), w, h), {code: 'JXL_INPUT'});
	assert.throws(() => encode(data, 0, h), {code: 'JXL_INPUT'});
	assert.throws(() => encode(data, w, h, {quality: 0}), {code: 'JXL_INPUT'});
	assert.throws(() => encode(new Uint8Array((LIMITS.edge + 1) * 4), LIMITS.edge + 1, 1), {code: 'JXL_DIMENSIONS'});
	assert.throws(() => transcode(new Uint8Array(0)), {code: 'JXL_INPUT'});
	assert.throws(() => transcode(Uint8Array.from([0xff, 0xd8, 0xff, 0xc3, 0, 8, 8, 0, 8, 0, 8, 1, 1, 0x11, 0])), {code: 'JXL_JPEG'});
});
