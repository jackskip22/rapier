// SPDX-License-Identifier: AGPL-3.0-only
// The reader is PP-OCRv6 tiny (a detector and a recogniser, Apache-2.0) on ONNX Runtime Web (MIT), chosen by measurement. Its

export const OCR_MODEL = 'PP-OCRv6 tiny';
export const OCR_VERSION = 'ppocrv6-tiny-0.1.0+ort-1.30.0+jxl-1.3.0';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const TINY = 'https://cdn.jsdelivr.net/npm/@arcships/light-ocr-model-ppocrv6-tiny@0.1.0/';
const JXL = 'https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.3.0/';
// (`plugins`, shell/bundle-io.js): unique there, which the packages' own file names are not (inference.onnx, LICENSE). The
// PP-OCRv6_tiny_{det,rec}_onnx_infer archives (paddle-model-ecology, paddle3.0.0), carried on npm by an Apache-2.0 package so
export const OCR_FILES = Object.freeze([
	Object.freeze({name: 'runtime', flat: 'ort.wasm.bundle.min.mjs', url: ORT + 'ort.wasm.bundle.min.mjs', bytes: 73054, sri: 'PLWz+nHEVHpjwBsO0YVdvQj6n5814Iv8E3b8FG0Rp/uIAtjFMCKOpP66iPzedrIG', licence: 'MIT'}),
	Object.freeze({name: 'wasm', flat: 'ort-wasm-simd-threaded.wasm', url: ORT + 'ort-wasm-simd-threaded.wasm', bytes: 14239897, sri: 'vjBJ1z7qrhkTyYsNqKeF6c7N+nOJSU94czEo+tvZcu8G75JparGq9kB+kTnEUNVM', licence: 'MIT'}),
	Object.freeze({name: 'detector', flat: 'ppocrv6-tiny-det.onnx', url: TINY + 'bundle/det/inference.onnx', bytes: 1780590, sri: 'z/uxJihKBtSOEG9THqUzk5RmVLAsj54V3UHEVEjOEhTle3fIjIN+w4T8J/oSvb9G', licence: 'Apache-2.0'}),
	Object.freeze({name: 'recogniser', flat: 'ppocrv6-tiny-rec.onnx', url: TINY + 'bundle/rec/inference.onnx', bytes: 4462639, sri: 'S3kXSVrPXF1w/WoAk6MwtMzrXdlfk/oKbo200k+ec6Fmf2jpdzhjMGQOk+scVhwn', licence: 'Apache-2.0'}),
	Object.freeze({name: 'dictionary', flat: 'ppocrv6-tiny-dictionary.json', url: TINY + 'bundle/rec/dictionary.json', bytes: 41009, sri: '6Nf5BNVe1Gq8H53bIq/GGwZ4PJ5P1tLT+9KqYztio4eP/89wv3KPaessREg24wef', licence: 'Apache-2.0'}),
	Object.freeze({name: 'licence', flat: 'ppocrv6-tiny-LICENSE', url: TINY + 'LICENSE', bytes: 11358, sri: 'II9e1ieUDl5AxyiVq3/FflTua1Sr0kMJ25e6imG7rXg7SiAsA2VemsvEqVsLqM7/', licence: 'Apache-2.0'}),
	Object.freeze({name: 'notice', flat: 'ppocrv6-tiny-MODEL-NOTICE.md', url: TINY + 'bundle/LICENSES/MODEL-NOTICE.md', bytes: 311, sri: '/xX55A3RRtvPKw3vqFhYH/l7BmQVlADJSGvZA77seZYcqrCvwtqLSJqMJqxo5Xee', licence: 'Apache-2.0'}),
	// its own decoder (libjxl, BSD-3-Clause, as jSquash builds it, Apache-2.0), run in the reader's worker and nowhere else.
	Object.freeze({name: 'jxl', flat: 'jxl_dec.js', url: JXL + 'codec/dec/jxl_dec.js', bytes: 36091, sri: 'OVUtDrf9Am51biP6vZWJC1BeSlKKo6nQQPjlB+KF9eWNuazANiijG+IBV4RDRUMA', licence: 'Apache-2.0'}),
	Object.freeze({name: 'jxlWasm', flat: 'jxl_dec.wasm', url: JXL + 'codec/dec/jxl_dec.wasm', bytes: 849240, sri: 'nJrefhoZ7HToq7VA6kbP3TG/g8+eD4UjhgDkyl0D6a6JtkP/2kj3MlygJWP6k/Ex', licence: 'BSD-3-Clause'}),
	Object.freeze({name: 'jxlLicence', flat: 'jxl-LICENSE', url: JXL + 'LICENSE', bytes: 11343, sri: 'NsdobH9UxdLqIzcQT8lhpTdu6OKs4LIy8lMm2mLIgqNmNhKUVo+sRy2rJ9oUKQyg', licence: 'Apache-2.0'}),
]);
export const OCR_TRANSFER_BYTES = 9142712;
export const OCR_READING = Object.freeze({limit: 960, thresh: .2, boxThresh: .4, unclip: 1.4, floor: .5, batch: 6});

export function ocrCore() {
	'use strict';
	const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
	function detInput(rgba, w, h, limit) {
		const scale = Math.min(1, limit / Math.sqrt(w * h), 4 * limit / Math.max(w, h));
		const tw = Math.max(32, Math.round(w * scale / 32) * 32), th = Math.max(32, Math.round(h * scale / 32) * 32);
		const data = new Float32Array(3 * tw * th), plane = tw * th, sx = w / tw, sy = h / th;
		for (let y = 0; y < th; y++) {
			const fy = Math.min(h - 1.001, Math.max(0, (y + .5) * sy - .5)), y0 = fy | 0, dy = fy - y0;
			for (let x = 0; x < tw; x++) {
				const fx = Math.min(w - 1.001, Math.max(0, (x + .5) * sx - .5)), x0 = fx | 0, dx = fx - x0;
				const i00 = (y0 * w + x0) * 4, i10 = i00 + w * 4, o = y * tw + x;
				for (let c = 0; c < 3; c++) {
					const v = (rgba[i00 + c] * (1 - dx) + rgba[i00 + 4 + c] * dx) * (1 - dy) + (rgba[i10 + c] * (1 - dx) + rgba[i10 + 4 + c] * dx) * dy;
					const k = 2 - c;
					data[k * plane + o] = (v / 255 - MEAN[k]) / STD[k];
				}
			}
		}
		return {data, tw, th, sx, sy};
	}
	function hull(points) {
		points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
		const lower = [], upper = [];
		for (const p of points) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
		for (let i = points.length - 1; i >= 0; i--) { const p = points[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
		upper.pop(); lower.pop();
		return lower.concat(upper);
	}
	function minRect(h) {
		let best = null;
		for (let i = 0; i < h.length; i++) {
			const a = h[i], b = h[(i + 1) % h.length];
			let ux = b[0] - a[0], uy = b[1] - a[1]; const len = Math.hypot(ux, uy); if (!len) continue;
			ux /= len; uy /= len;
			let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
			for (const p of h) { const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux; if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v; }
			const area = (maxU - minU) * (maxV - minV);
			if (!best || area < best.area) best = {area, ux, uy, minU, maxU, minV, maxV};
		}
		if (!best) return {cx: h[0][0], cy: h[0][1], ux: 1, uy: 0, w: 0, hgt: 0};
		const cu = (best.minU + best.maxU) / 2, cv = (best.minV + best.maxV) / 2;
		let r = {cx: cu * best.ux - cv * best.uy, cy: cu * best.uy + cv * best.ux, ux: best.ux, uy: best.uy, w: best.maxU - best.minU, hgt: best.maxV - best.minV};
		if (Math.abs(r.ux) < Math.abs(r.uy)) r = {...r, ux: -r.uy, uy: r.ux, w: r.hgt, hgt: r.w};
		if (r.ux < 0) r = {...r, ux: -r.ux, uy: -r.uy};
		return r;
	}
	function corners(r) {
		const hw = r.w / 2, hh = r.hgt / 2, vx = -r.uy, vy = r.ux;
		return [[r.cx - r.ux * hw - vx * hh, r.cy - r.uy * hw - vy * hh], [r.cx + r.ux * hw - vx * hh, r.cy + r.uy * hw - vy * hh],
			[r.cx + r.ux * hw + vx * hh, r.cy + r.uy * hw + vy * hh], [r.cx - r.ux * hw + vx * hh, r.cy - r.uy * hw + vy * hh]];
	}
	function detBoxes(prob, tw, th, sx, sy, {thresh = .3, boxThresh = .6, unclip = 1.5, minSide = 3, max = 1000} = {}) {
		const n = tw * th, label = new Int32Array(n), stack = new Int32Array(n), boxes = [];
		let next = 0;
		for (let s = 0; s < n && boxes.length < max; s++) {
			if (label[s] || prob[s] <= thresh) continue;
			next++; let top = 0; stack[top++] = s; label[s] = next;
			const edge = []; let sum = 0, count = 0;
			while (top) {
				const i = stack[--top], x = i % tw, y = (i / tw) | 0; sum += prob[i]; count++;
				let boundary = false;
				for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
					if (!dx && !dy) continue;
					const nx = x + dx, ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= tw || ny >= th) { boundary = true; continue; }
					const j = ny * tw + nx;
					if (prob[j] <= thresh) { boundary = true; continue; }
					if (!label[j]) { label[j] = next; stack[top++] = j; }
				}
				if (boundary) edge.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
			}
			if (edge.length < 4) continue;
			const r = minRect(hull(edge));
			if (Math.min(r.w, r.hgt) < minSide || sum / count < boxThresh) continue;
			const d = r.w * r.hgt * unclip / (2 * (r.w + r.hgt));
			const grown = {...r, w: r.w + 2 * d, hgt: r.hgt + 2 * d};
			if (Math.min(grown.w, grown.hgt) < minSide + 2) continue;
			boxes.push({quad: corners(grown).map(([x, y]) => [x * sx, y * sy]), score: sum / count});
		}
		return boxes;
	}
	function lineCrop(rgba, w, h, quad, height = 48) {
		const [tl, tr, br, bl] = quad;
		const cw = Math.max(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), Math.hypot(br[0] - bl[0], br[1] - bl[1]));
		const ch = Math.max(Math.hypot(bl[0] - tl[0], bl[1] - tl[1]), Math.hypot(br[0] - tr[0], br[1] - tr[1]));
		const turned = ch >= cw * 1.5, along = turned ? ch : cw, across = turned ? cw : ch;
		const width = Math.max(1, Math.min(3200, Math.ceil(height * along / Math.max(1, across))));
		const data = new Float32Array(3 * height * width), plane = height * width;
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
			let u = (x + .5) / width, v = (y + .5) / height;
			if (turned) { const t = u; u = 1 - v; v = t; }
			const px = tl[0] + (tr[0] - tl[0]) * u + (bl[0] - tl[0]) * v + (br[0] - tr[0] - bl[0] + tl[0]) * u * v;
			const py = tl[1] + (tr[1] - tl[1]) * u + (bl[1] - tl[1]) * v + (br[1] - tr[1] - bl[1] + tl[1]) * u * v;
			const fx = Math.min(w - 1.001, Math.max(0, px - .5)), fy = Math.min(h - 1.001, Math.max(0, py - .5));
			const x0 = fx | 0, y0 = fy | 0, dx = fx - x0, dy = fy - y0, i00 = (y0 * w + x0) * 4, i10 = i00 + w * 4, o = y * width + x;
			for (let c = 0; c < 3; c++) {
				const val = (rgba[i00 + c] * (1 - dx) + rgba[i00 + 4 + c] * dx) * (1 - dy) + (rgba[i10 + c] * (1 - dx) + rgba[i10 + 4 + c] * dx) * dy;
				data[(2 - c) * plane + o] = val / 127.5 - 1;
			}
		}
		return {data, width, height, turned};
	}
	function recBatch(crops, height = 48) {
		const width = Math.max(320, ...crops.map(c => c.width)), plane = height * width;
		const data = new Float32Array(crops.length * 3 * plane);
		crops.forEach((crop, n) => { for (let c = 0; c < 3; c++) for (let y = 0; y < height; y++) {
			const from = c * crop.height * crop.width + y * crop.width;
			data.set(crop.data.subarray(from, from + crop.width), n * 3 * plane + c * plane + y * width);
		} });
		return {data, width};
	}
	function ctcDecode(probs, offset, steps, classes, dict) {
		let text = '', prev = 0, sum = 0; const at = [];
		for (let t = 0; t < steps; t++) {
			let best = 0, bestP = -Infinity; const row = offset + t * classes;
			for (let c = 0; c < classes; c++) { const p = probs[row + c]; if (p > bestP) { bestP = p; best = c; } }
			if (best && best !== prev) { text += best - 1 < dict.length ? dict[best - 1] : ' '; at.push(t); sum += bestP; }
			prev = best;
		}
		return {text, at, score: at.length ? sum / at.length : 0};
	}
	function charSpans(text, at, steps, padded, cropWidth) {
		const step = padded / steps, spans = [], chars = [...text];
		chars.forEach((ch, i) => {
			const from = i ? (at[i - 1] + at[i] + 1) / 2 * step : Math.max(0, at[i] * step - step);
			const to = i < chars.length - 1 ? (at[i] + at[i + 1] + 1) / 2 * step : Math.min(cropWidth, (at[i] + 2) * step);
			const span = [Math.max(0, Math.min(1, from / cropWidth)), Math.max(0, Math.min(1, to / cropWidth))];
			for (let k = 0; k < ch.length; k++) spans.push(span);
		});
		return spans;
	}
	function readingOrder(lines) {
		const box = l => { const ys = l.quad.map(p => p[1]), xs = l.quad.map(p => p[0]); return {top: Math.min(...ys), bottom: Math.max(...ys), left: Math.min(...xs)}; };
		const rows = [];
		for (const line of lines.map(l => ({l, b: box(l)})).sort((a, b) => a.b.top - b.b.top)) {
			const row = rows.find(r => Math.min(r.bottom, line.b.bottom) - Math.max(r.top, line.b.top) > .5 * Math.min(r.bottom - r.top, line.b.bottom - line.b.top));
			if (row) { row.items.push(line); row.top = Math.min(row.top, line.b.top); row.bottom = Math.max(row.bottom, line.b.bottom); }
			else rows.push({top: line.b.top, bottom: line.b.bottom, items: [line]});
		}
		rows.sort((a, b) => a.top - b.top);
		return rows.flatMap(r => r.items.sort((a, b) => a.b.left - b.b.left).map(i => i.l));
	}
	function flatten(rgba) {
		let light = 0, weight = 0, clear = false;
		for (let i = 0; i < rgba.length; i += 4) { const a = rgba[i + 3]; if (a < 255) clear = true; light += a * (rgba[i] * .299 + rgba[i + 1] * .587 + rgba[i + 2] * .114); weight += a; }
		if (!clear) return;
		const back = weight && light / weight > 127.5 ? 0 : 255;
		for (let i = 0; i < rgba.length; i += 4) { const a = rgba[i + 3] / 255; for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(rgba[i + c] * a + back * (1 - a)); rgba[i + 3] = 255; }
	}
	async function read(rgba, w, h, runDet, runRec, dict, {limit = 960, thresh = .2, boxThresh = .4, unclip = 1.4, floor = .5, batch = 6} = {}) {
		const t0 = Date.now();
		flatten(rgba);
		const input = detInput(rgba, w, h, limit);
		const prob = await runDet(input.data, input.th, input.tw);
		const boxes = detBoxes(prob, input.tw, input.th, input.sx, input.sy, {thresh, boxThresh, unclip});
		const t1 = Date.now();
		const crops = boxes.map(box => ({box, crop: lineCrop(rgba, w, h, box.quad)})).sort((a, b) => a.crop.width - b.crop.width);
		const lines = [];
		for (let i = 0; i < crops.length; i += batch) {
			const group = crops.slice(i, i + batch), padded = recBatch(group.map(g => g.crop));
			const out = await runRec(padded.data, group.length, padded.width);
			const [, steps, classes] = out.dims;
			group.forEach((g, k) => {
				const line = ctcDecode(out.data, k * steps * classes, steps, classes, dict);
				const text = line.text.trim();
				if (!text || line.score < floor) return;
				const lead = line.text.length - line.text.trimStart().length;
				const spans = charSpans(line.text, line.at, steps, padded.width, g.crop.width).slice(lead, lead + text.length);
				const quad = g.crop.turned ? [g.box.quad[1], g.box.quad[2], g.box.quad[3], g.box.quad[0]] : g.box.quad;
				lines.push({text, score: Math.round(line.score * 1000) / 1000, quad: quad.map(([x, y]) => [Math.round(x / w * 1e4) / 1e4, Math.round(y / h * 1e4) / 1e4]), spans: spans.map(([a, b]) => [Math.round(a * 1e4) / 1e4, Math.round(b * 1e4) / 1e4])});
			});
		}
		return {lines: readingOrder(lines), ms: {detect: t1 - t0, recognise: Date.now() - t1}, boxes: boxes.length};
	}
	return {detInput, detBoxes, lineCrop, recBatch, ctcDecode, charSpans, readingOrder, read, hull, minRect, corners, flatten};
}

function ocrWorkerMain(scope, core) {
	'use strict';
	function shut() { throw new Error('The text reader cannot reach the network'); }
	const doors = {fetch: () => Promise.reject(new Error('The text reader cannot reach the network'))};
	for (const door of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'Worker', 'SharedWorker', 'importScripts']) doors[door] = shut;
	for (const door of Object.keys(doors).concat('caches')) for (let holder = scope; holder; holder = Object.getPrototypeOf(holder)) {
		if (!Object.hasOwn(holder, door)) continue;
		Object.defineProperty(holder, door, door === 'caches' ? {get: shut, configurable: false} : {value: doors[door], writable: false, configurable: false});
	}
	let ort = null, det = null, rec = null, dict = null, settings = null, jxlCode = null, jxlWasm = null, jxl = null;
	async function decodeJxl(bytes, max) {
		if (!jxl) {
			const url = URL.createObjectURL(new Blob([jxlCode], {type: 'text/javascript'}));
			try { jxl = await (await import(url)).default({wasmBinary: jxlWasm, locateFile: path => path}); } finally { URL.revokeObjectURL(url); }
		}
		const image = jxl.decode(bytes);
		if (!image || !(image.width > 0)) throw new Error('The picture could not be decoded');
		const scale = Math.min(1, max / Math.max(image.width, image.height));
		if (scale >= 1 || typeof OffscreenCanvas !== 'function') return image;
		const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
		const bitmap = await createImageBitmap(image, {resizeWidth: width, resizeHeight: height, resizeQuality: 'high'});
		const context = new OffscreenCanvas(width, height).getContext('2d');
		context.drawImage(bitmap, 0, 0); bitmap.close();
		return context.getImageData(0, 0, width, height);
	}
	scope.onmessage = async event => {
		const {id, type} = event.data || {};
		const answer = (value, transfer) => scope.postMessage({id, ok: true, ...value}, transfer || []);
		try {
			if (type === 'open') {
				const {runtime, wasm, detector, recogniser, dictionary, reading} = event.data;
				jxlCode = event.data.jxl; jxlWasm = event.data.jxlWasm && new Uint8Array(event.data.jxlWasm);
				const url = URL.createObjectURL(new Blob([runtime], {type: 'text/javascript'}));
				try { ort = await import(url); } finally { URL.revokeObjectURL(url); }
				ort.env.wasm.wasmBinary = wasm;
				ort.env.wasm.numThreads = 1;
				ort.env.wasm.proxy = false;
				const options = {executionProviders: ['wasm'], graphOptimizationLevel: 'all'};
				det = await ort.InferenceSession.create(new Uint8Array(detector), options);
				rec = await ort.InferenceSession.create(new Uint8Array(recogniser), options);
				dict = JSON.parse(new TextDecoder().decode(dictionary)).characters.map(String);
				settings = reading;
				answer({opened: true});
				return;
			}
			if (type === 'read') {
				if (!det) throw new Error('The text reader is not open');
				let {width, height, rgba} = event.data;
				if (event.data.jxl) {
					const image = await decodeJxl(event.data.jxl, event.data.max || 2048);
					width = image.width; height = image.height; rgba = image.data;
				}
				const runDet = async (data, th, tw) => { const out = await det.run({[det.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, th, tw])}); return out[det.outputNames[0]].data; };
				const runRec = async (data, n, width) => { const out = await rec.run({[rec.inputNames[0]]: new ort.Tensor('float32', data, [n, 3, 48, width])}); return out[rec.outputNames[0]]; };
				answer({...await core.read(new Uint8ClampedArray(rgba), width, height, runDet, runRec, dict, settings || {}), width, height});
				return;
			}
			throw new Error('Unknown text reader request');
		} catch (error) {
			scope.postMessage({id, ok: false, error: String(error && error.message || error)});
		}
	};
}
export function ocrWorkerSource() {
	return '"use strict";\n(' + ocrWorkerMain.toString() + ')(self, (' + ocrCore.toString() + ')());\n';
}

export function pictureText(reading) {
	return (reading && Array.isArray(reading.lines) ? reading.lines : []).map(line => String(line.text || '')).filter(Boolean).join('\n');
}
export function pictureMarks(reading, needle, fold = s => String(s).toLowerCase(), limit = Infinity) {
	const want = fold(needle), marks = [];
	if (!want || !(limit > 0) || !reading || !Array.isArray(reading.lines)) return marks;
	const lines = reading.lines, from = [];
	let folded = '';
	lines.forEach((line, row) => {
		const text = String(line.text || ''), whole = fold(text), units = [];
		let start = 0;
		for (const character of text) {
			const end = start + character.length, part = fold(character);
			if (!part && units.length) units[units.length - 1][2] = end;
			for (let at = 0; at < part.length; at++) units.push([row, start, end]);
			start = end;
		}
		if (row) { folded += ' '; from.push(null); }
		folded += whole;
		for (let at = 0; at < whole.length; at++) from.push(units.length === whole.length ? units[at] : [row, Math.min(at, text.length - 1), Math.min(at + 1, text.length)]);
	});
	for (let at = folded.indexOf(want); at >= 0; at = folded.indexOf(want, at + Math.max(1, want.length))) {
		for (let k = at; k < at + want.length;) {
			if (!from[k]) { k++; continue; }
			const row = from[k][0], first = from[k][1];
			let last = from[k][2] - 1;
			for (; k < at + want.length && from[k]?.[0] === row; k++) last = Math.max(last, from[k][2] - 1);
			const line = lines[row], [a, b] = line.spans?.[first] && line.spans?.[last] ? [line.spans[first][0], line.spans[last][1]] : [0, 1];
			const [tl, tr, br, bl] = line.quad, lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
			marks.push([lerp(tl, tr, a), lerp(tl, tr, b), lerp(bl, br, b), lerp(bl, br, a)]);
			if (marks.length >= limit) return marks;
		}
	}
	return marks;
}

export async function pictureDigest(bytes) {
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function completeReading(reading) {
	return !!reading && Number.isInteger(reading.width) && reading.width > 0 && Number.isInteger(reading.height) && reading.height > 0 &&
		Array.isArray(reading.lines) && reading.lines.every(line => line && typeof line.text === 'string' &&
			Array.isArray(line.quad) && line.quad.length === 4 && line.quad.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) &&
			Array.isArray(line.spans) && line.spans.length === line.text.length && line.spans.every(span => Array.isArray(span) && span.length === 2 &&
				span.every(Number.isFinite) && span[0] >= 0 && span[0] <= span[1] && span[1] <= 1));
}

export function createPictureReadings({store, read, available, close = () => {}}) {
	const readings = new Map(), pending = new Map();
	let turn = 0, work = Promise.resolve(), writes = Promise.resolve(), clearing = Promise.resolve();
	const live = ticket => ticket === turn && available();
	function write(action) {
		const next = writes.then(action);
		writes = next.catch(() => {});
		return next;
	}
	async function saved(key, ticket) {
		if (!live(ticket)) return null;
		if (readings.has(key)) return readings.get(key);
		const kept = await store.get(key).catch(() => null);
		if (!live(ticket) || kept?.version !== OCR_VERSION || !completeReading(kept.reading)) return null;
		readings.set(key, kept.reading);
		return kept.reading;
	}
	async function cached(source) {
		const ticket = turn;
		if (!live(ticket)) return null;
		await clearing;
		const key = await pictureDigest(source.bytes);
		return saved(key, ticket);
	}
	async function reading(source) {
		const ticket = turn;
		if (!live(ticket)) return null;
		await clearing;
		const key = await pictureDigest(source.bytes);
		if (!live(ticket)) return null;
		if (readings.has(key)) return readings.get(key);
		if (pending.has(key)) return pending.get(key);
		const request = (async () => {
			const held = await saved(key, ticket);
			if (held || !live(ticket)) return held;
			const next = work.then(async () => live(ticket) ? read(source, () => live(ticket)) : null);
			work = next.catch(() => {});
			const answer = await next;
			if (!live(ticket) || !completeReading(answer)) return null;
			await write(() => live(ticket) ? store.put(key, {version: OCR_VERSION, reading: answer}) : null).catch(() => {});
			if (!live(ticket)) return null;
			readings.set(key, answer);
			return answer;
		})().catch(error => { if (!live(ticket)) return null; throw error; });
		pending.set(key, request);
		try { return await request; }
		finally { if (pending.get(key) === request) pending.delete(key); }
	}
	function pause() {
		turn++;
		pending.clear(); readings.clear(); work = Promise.resolve();
		close();
	}
	function forget() {
		pause();
		clearing = write(async () => {
			for (const key of await store.keys()) await store.remove(key);
		});
		return clearing;
	}
	return {reading, cached, readings, pause, forget};
}

export function createOcrReader(provider, openWorker) {
	let worker = null, opening = null;
	function close() {
		const open = worker || opening?.worker; worker = null; opening = null;
		try { open?.terminate(); } catch (_) {}
	}
	const closed = () => new Error('The text reader was closed');
	function live(reader) { if (reader !== worker) throw closed(); }
	function open() {
		if (worker) return Promise.resolve(worker);
		if (opening) return opening.promise;
		const ticket = opening = {worker: null, promise: null};
		ticket.promise = (async () => {
			const bytes = await provider.bytes();
			if (opening !== ticket) throw closed();
			const next = ticket.worker = openWorker();
			const buffers = ['runtime', 'wasm', 'detector', 'recogniser', 'dictionary', 'jxl', 'jxlWasm'].map(name => bytes[name].buffer.slice(bytes[name].byteOffset, bytes[name].byteOffset + bytes[name].byteLength));
			await next.post({type: 'open', runtime: buffers[0], wasm: buffers[1], detector: buffers[2], recogniser: buffers[3], dictionary: buffers[4], jxl: buffers[5], jxlWasm: buffers[6], reading: {...OCR_READING}}, buffers);
			if (opening !== ticket) throw closed();
			worker = next; opening = null;
			return next;
		})().catch(error => {
			try { ticket.worker?.terminate(); } catch (_) {}
			if (opening === ticket) opening = null;
			throw error;
		});
		return ticket.promise;
	}
	async function read(rgba, width, height) {
		if (provider.status !== 'ready') throw new Error('The text reader is not installed');
		const reader = await open();
		live(reader);
		const buffer = rgba.buffer.byteLength === rgba.byteLength ? rgba.buffer : rgba.slice().buffer;
		try {
			const answer = await reader.post({type: 'read', width, height, rgba: buffer}, [buffer]);
			live(reader);
			return {lines: answer.lines, ms: answer.ms, boxes: answer.boxes, width, height};
		} catch (error) { if (worker === reader) close(); throw error; }
	}
	async function readJxl(bytes, max) {
		if (provider.status !== 'ready') throw new Error('The text reader is not installed');
		const reader = await open();
		live(reader);
		const buffer = bytes.buffer.byteLength === bytes.byteLength ? bytes.buffer : bytes.slice().buffer;
		try {
			const answer = await reader.post({type: 'read', jxl: buffer, max}, [buffer]);
			live(reader);
			return {lines: answer.lines, ms: answer.ms, boxes: answer.boxes, width: answer.width, height: answer.height};
		} catch (error) { if (worker === reader) close(); throw error; }
	}
	return {read, readJxl, close};
}
