// SPDX-License-Identifier: AGPL-3.0-only
import {admitRefraction} from './refraction.mjs';

const clock = () => globalThis.performance?.now() ?? Date.now();
const abort = options => { if (options.signal?.aborted) throw options.signal.reason || new DOMException('Rendering canceled', 'AbortError'); };
const pause = () => globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0));
const prepared = new WeakMap();

function pixels(image, width = image?.width, height = image?.height) {
	if (!image || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
		width > 16384 || height > 16384 || width * height > 16 * 1024 * 1024 ||
		image.width !== width || image.height !== height || !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) ||
		image.data.length !== width * height * 4) throw new TypeError('Invalid refracted light pixels');
	return image;
}

function job(source, effect, options) {
	pixels(source);
	const e = admitRefraction(effect), ratio = options.pixelRatio ?? 1;
	if (!e || !Number.isFinite(ratio) || ratio <= 0 || ratio > 16) throw new TypeError('Invalid refracted light settings');
	if (!options.matte && e.matteSource === 'source') options = {...options, matte: source};
	if (options.lens) pixels(options.lens, source.width, source.height);
	if (options.matte) pixels(options.matte, source.width, source.height);
	const start = clock(), state = {source, e, options, ratio, start, width: source.width, height: source.height, stats: {}};
	state.identity = !e.strength || !e.amount || !e.bump || !e.amountX && !e.amountY || !e.red && !e.blue;
	return state;
}

function indexAt(value, size, edge) {
	if (value >= 0 && value < size) return value;
	if (edge === 'transparent') return -1;
	if (edge === 'clamp') return Math.max(0, Math.min(size - 1, value));
	const period = edge === 'reflect' ? 2 * size : size;
	value = (value % period + period) % period;
	return value >= size ? period - 1 - value : value;
}

function sample(level, x, y, edge, out) {
	const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
	const x0 = indexAt(ix, level.width, edge), x1 = indexAt(ix + 1, level.width, edge);
	const y0 = indexAt(iy, level.height, edge), y1 = indexAt(iy + 1, level.height, edge);
	const a = x0 < 0 || y0 < 0 ? -1 : 4 * (y0 * level.width + x0), b = x1 < 0 || y0 < 0 ? -1 : 4 * (y0 * level.width + x1);
	const c = x0 < 0 || y1 < 0 ? -1 : 4 * (y1 * level.width + x0), d = x1 < 0 || y1 < 0 ? -1 : 4 * (y1 * level.width + x1);
	const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
	const data = level.data;
	if (a >= 0 && b >= 0 && c >= 0 && d >= 0) {
		out[0] = data[a + 0] * wa + data[b + 0] * wb + data[c + 0] * wc + data[d + 0] * wd;
		out[1] = data[a + 1] * wa + data[b + 1] * wb + data[c + 1] * wc + data[d + 1] * wd;
		out[2] = data[a + 2] * wa + data[b + 2] * wb + data[c + 2] * wc + data[d + 2] * wd;
		out[3] = level.opaque ? wa + wb + wc + wd : data[a + 3] * wa + data[b + 3] * wb + data[c + 3] * wc + data[d + 3] * wd;
	} else {
		out[0] = (a < 0 ? 0 : data[a + 0] * wa) + (b < 0 ? 0 : data[b + 0] * wb) + (c < 0 ? 0 : data[c + 0] * wc) + (d < 0 ? 0 : data[d + 0] * wd);
		out[1] = (a < 0 ? 0 : data[a + 1] * wa) + (b < 0 ? 0 : data[b + 1] * wb) + (c < 0 ? 0 : data[c + 1] * wc) + (d < 0 ? 0 : data[d + 1] * wd);
		out[2] = (a < 0 ? 0 : data[a + 2] * wa) + (b < 0 ? 0 : data[b + 2] * wb) + (c < 0 ? 0 : data[c + 2] * wc) + (d < 0 ? 0 : data[d + 2] * wd);
		out[3] = (a < 0 ? 0 : data[a + 3] * wa) + (b < 0 ? 0 : data[b + 3] * wb) + (c < 0 ? 0 : data[c + 3] * wc) + (d < 0 ? 0 : data[d + 3] * wd);
	}
}

function lensSample(data, w, h, x, y) {
	const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
	const at = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : data[yy * w + xx];
	return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) +
		(at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
}

function* prepare(state) {
	const {source, e, options, ratio, width: w, height: h} = state, started = clock();
	const lens = options.lens || source, key = [w, h, e.blur, ratio, e.edge].join('/');
	const cached = prepared.get(source);
	let current = cached?.lens === lens && cached.key === key;
	if (current) for (let i = 0; i < source.data.length; i++) {
		if (source.data[i] !== cached.sourceData[i] || lens.data[i] !== cached.lensData[i]) { current = false; break; }
	}
	if (current) {
		Object.assign(state, cached.value); state.stats.prepareMs = 0; state.stats.reused = true;
		return;
	}
	let opaque = true;
	const levels = [{width: w, height: h, data: new Float32Array(w * h * 4)}];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const p = (y * w + x) * 4, a = source.data[p + 3] / 255;
			if (a !== 1) opaque = false;
			for (let c = 0; c < 3; c++) levels[0].data[p + c] = source.data[p + c] / 255 * a;
			levels[0].data[p + 3] = a;
		}
		if (!(y % 32)) yield;
	}
	levels[0].opaque = opaque && e.edge !== 'transparent';
	while (levels.at(-1).width > 1 || levels.at(-1).height > 1) {
		const before = levels.at(-1), width = Math.max(1, Math.floor(before.width / 2)), height = Math.max(1, Math.floor(before.height / 2));
		const next = {width, height, data: new Float32Array(width * height * 4), opaque: before.opaque}, tap = new Float64Array(4);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				sample(before, x * 2 + .5, y * 2 + .5, e.edge, tap);
				next.data.set(tap, (y * width + x) * 4);
			}
			if (!(y % 32)) yield;
		}
		levels.push(next);
	}
	const sigma = e.blur * ratio, step = Math.max(1, e.blur) * ratio, pad = Math.ceil(step) + 2;
	const lw = w + 2 * pad, lh = h + 2 * pad, count = lw * lh;
	if (count > 32 * 1024 * 1024) throw Object.assign(new RangeError('The refracted light lens is too large.'), {code: 'drawing_work_limit'});
	const height = new Float64Array(count);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const p = (y * w + x) * 4;
			height[(y + pad) * lw + x + pad] = (.2126 * lens.data[p] + .7152 * lens.data[p + 1] + .0722 * lens.data[p + 2]) * lens.data[p + 3] / 65025;
		}
		if (!(y % 32)) yield;
	}
	if (sigma) {
		const radius = Math.ceil(6 * sigma), kernel = new Float64Array(2 * radius + 1);
		let total = 0;
		for (let i = -radius; i <= radius; i++) { kernel[i + radius] = Math.exp(-.5 * (i / sigma) ** 2); total += kernel[i + radius]; }
		for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
		const horizontal = new Float64Array(count);
		for (let y = pad; y < h + pad; y++) {
			for (let x = 0; x < lw; x++) {
				let value = 0;
				for (let k = Math.max(-radius, pad - x); k <= Math.min(radius, w + pad - 1 - x); k++) value += height[y * lw + x + k] * kernel[k + radius];
				horizontal[y * lw + x] = value;
			}
			if (!(y % 4)) yield;
		}
		for (let y = 0; y < lh; y++) {
			for (let x = 0; x < lw; x++) {
				let value = 0;
				for (let k = Math.max(-radius, pad - y); k <= Math.min(radius, h + pad - 1 - y); k++) value += horizontal[(y + k) * lw + x] * kernel[k + radius];
				height[y * lw + x] = value;
			}
			if (!(y % 4)) yield;
		}
	}
	const slope = new Float64Array(w * h * 2);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let sx = 0, sy = 0;
			for (let k = -1; k <= 1; k++) {
				sx += lensSample(height, lw, lh, x + pad + step, y + pad + k * step) - lensSample(height, lw, lh, x + pad - step, y + pad + k * step);
				sy += lensSample(height, lw, lh, x + pad + k * step, y + pad + step) - lensSample(height, lw, lh, x + pad + k * step, y + pad - step);
			}
			const p = (y * w + x) * 2;
			slope[p] = sx / (6 * step / ratio); slope[p + 1] = sy / (6 * step / ratio);
		}
		if (!(y % 16)) yield;
	}
	Object.assign(state, {levels, slope});
	const sourceData = new Uint8Array(source.data), lensData = lens === source ? sourceData : new Uint8Array(lens.data);
	prepared.set(source, {key, lens, sourceData, lensData, value: {levels, slope}});
	state.stats.prepareMs = clock() - started;
}

function* optics(state) {
	const {e, width, height, ratio, options, slope} = state, field = new Float32Array(width * height * 4);
	const angle = e.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
	let maxDisplacement = 0;
	for (let p = 0; p < width * height; p++) {
		const sx = slope[p * 2], sy = slope[p * 2 + 1], gain = -e.bump / (1 + e.bump * Math.hypot(sx, sy));
		const dx = (cos * sx - sin * sy) * gain * e.amountX * e.amount * ratio;
		const dy = (sin * sx + cos * sy) * gain * e.amountY * e.amount * ratio;
		field[p * 4] = dx; field[p * 4 + 1] = dy;
		const data = options.matte?.data, at = p * 4;
		field[at + 2] = e.strength * (data ? (.2126 * data[at] + .7152 * data[at + 1] + .0722 * data[at + 2]) * data[at + 3] / 65025 : 1);
		maxDisplacement = Math.max(maxDisplacement, Math.hypot(dx, dy) * Math.max(Math.abs(e.red), Math.abs(e.blue)));
		if (!(p % 4096)) yield;
	}
	const {nodes, sums} = spectrum(e.samples, !!e.adaptive);
	state.field = field; state.nodes = nodes; state.sums = sums;
	state.stats.maxDisplacement = maxDisplacement; state.stats.spectralTaps = nodes.length;
}

function spectrum(steps, adaptive) {
	const nodes = [], sums = [0, 0, 0], add = (t, weight) => {
		const weights = [Math.max(0, 1 - 2 * t), 1 - Math.abs(2 * t - 1), Math.max(0, 2 * t - 1)].map(value => value * weight);
		for (let c = 0; c < 3; c++) sums[c] += weights[c];
		nodes.push([t, ...weights]);
	};
	for (let i = 0; i < steps; i++) {
		if (!adaptive) { add((i + .5) / steps, 1 / steps); continue; }
		const a = i / steps, b = (i + 1) / steps, ends = a < .5 && b > .5 ? [a, .5, b] : [a, b];
		for (let k = 1; k < ends.length; k++) {
			const mid = (ends[k - 1] + ends[k]) / 2, half = (ends[k] - ends[k - 1]) / 2;
			add(mid - half / Math.sqrt(3), half); add(mid + half / Math.sqrt(3), half);
		}
	}
	return {nodes, sums};
}

function result(state, renderer) {
	return {width: state.width, height: state.height, data: state.data || new Uint8ClampedArray(state.source.data),
		renderer, elapsedMs: clock() - state.start, stats: state.stats};
}

async function consumeAsync(iterator, options) {
	let stamp = clock();
	for (const _ of iterator) {
		abort(options);
		if (clock() - stamp < 12) continue;
		options.onProgress?.(); await pause(); stamp = clock();
	}
}

export async function renderRefraction(source, effect, options = {}) {
	if (options.backend && !['auto', 'webgpu'].includes(options.backend)) throw Object.assign(new TypeError('Refracted light requires WebGPU'), {code: 'refraction_webgpu_required'});
	const state = job(source, effect, options);
	abort(options);
	if (state.identity) return result(state, 'identity');
	const owner = await gpu();
	await consumeAsync(prepare(state), options); await consumeAsync(optics(state), options); abort(options);
	const start = clock(); state.data = await webgpu(state, owner); state.stats.renderMs = clock() - start;
	abort(options);
	return result(state, 'webgpu-f32');
}

function parameters(state) {
	const {e, width, height, nodes, sums, levels} = state;
	return new Float32Array([width, height, nodes.length, ['transparent', 'clamp', 'tile', 'reflect'].indexOf(e.edge),
		e.red, e.blue - e.red, e.samples, e.adaptive ? 1 : 0, ...sums, levels.length - 1, e.whiteBalance === false ? 0 : 1, e.crop === false ? 0 : 1, 0, 0]);
}

const WGSL = `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var<storage,read> nodes: array<vec4f>;
@group(0) @binding(3) var<uniform> params: array<vec4f,4>;
@group(0) @binding(4) var<storage,read_write> output: array<u32>;
fn edgeIndex(value: i32, size: i32) -> i32 {
	if value >= 0 && value < size { return value; }
	let edge = i32(params[0].w);
	if edge == 0 { return -1; }
	if edge == 1 { return clamp(value, 0, size - 1); }
	let period = select(size, size * 2, edge == 3);
	let at = ((value % period) + period) % period;
	return select(at, period - 1 - at, at >= size);
}
fn tap(at: vec2i, level: i32) -> vec4f {
	let size = vec2i(textureDimensions(source, level));
	let x = edgeIndex(at.x, size.x); let y = edgeIndex(at.y, size.y);
	if x < 0 || y < 0 { return vec4f(0); }
	return textureLoad(source, vec2i(x,y), level);
}
fn linear(at: vec2f, level: i32) -> vec4f {
	let p = (at + .5) / exp2(f32(level)) - .5;
	let base = vec2i(floor(p)); let f = fract(p);
	return tap(base,level)*(1-f.x)*(1-f.y) + tap(base+vec2i(1,0),level)*f.x*(1-f.y) +
		tap(base+vec2i(0,1),level)*(1-f.x)*f.y + tap(base+vec2i(1,1),level)*f.x*f.y;
}
fn keep(colour: vec4f) -> u32 {
	let bytes = vec4u(floor(clamp(colour,vec4f(0),vec4f(1))*255+.5));
	return bytes.x | (bytes.y << 8u) | (bytes.z << 16u) | (bytes.w << 24u);
}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id: vec3u) {
	if id.x >= u32(params[0].x) || id.y >= u32(params[0].y) { return; }
	let at = vec2i(id.xy); let p = id.y*u32(params[0].x)+id.x;
	let original = textureLoad(source,at,0); let bend = textureLoad(field,at,0);
	if bend.z == 0 || all(bend.xy == vec2f(0)) || (params[3].y == 1 && original.a == 0) {
		var rgb = vec3f(0); if original.a > 0 { rgb = original.rgb / original.a; }
		output[p] = keep(vec4f(rgb,original.a)); return;
	}
	let rayVector = bend.xy*params[1].y; let travel = length(rayVector); let steps = u32(params[1].z);
	let exact = params[1].w == 1 && ceil(abs(rayVector.x))+ceil(abs(rayVector.y))+2 <= f32(steps);
	let count = select(u32(params[0].z),steps*2u,exact); var lod = 0.;
	if params[1].w == 1 && !exact { lod = clamp(log2(max(1.,travel/f32(steps)/2)),0.,params[2].w); }
	let lo = i32(floor(lod)); let hi = i32(ceil(lod)); let blend = fract(lod);
	var colour = vec3f(0); var coverage = vec3f(0);
	let origin = vec2f(id.xy)+bend.xy*params[1].x;
	var grid = select(ceil(origin)-1,floor(origin)+1,rayVector>vec2f(0)); var cut = vec2f(1e30);
	if rayVector.x != 0 { cut.x=(grid.x-origin.x)/rayVector.x; } if rayVector.y != 0 { cut.y=(grid.y-origin.y)/rayVector.y; }
	var intervalStart = 0.; var intervalEnd = 0.; var mid = 0.; var halfSpan = 0.;
	for(var i=0u; i<count; i++) {
		var node = nodes[i];
		if exact {
			if i%2u==0u {
				if intervalStart>=1 { break; }
				intervalEnd=min(1.,min(cut.x,min(cut.y,select(1.,.5,intervalStart<.5)))); halfSpan=(intervalEnd-intervalStart)/2; mid=(intervalEnd+intervalStart)/2;
			}
			let t=mid+select(-.5773502691896258,.5773502691896258,i%2u==1u)*halfSpan;
			node=vec4f(t,vec3f(max(0.,1-2*t),1-abs(2*t-1),max(0.,2*t-1))*halfSpan);
		}
		let pos = vec2f(id.xy) + bend.xy*(params[1].x+params[1].y*node.x);
		var value = linear(pos,lo); if hi != lo { value = mix(value,linear(pos,hi),blend); }
		colour += value.rgb*node.yzw; coverage += value.a*node.yzw;
		if exact && i%2u==1u {
			intervalStart=intervalEnd;
			if intervalEnd>=cut.x { grid.x+=sign(rayVector.x); cut.x=(grid.x-origin.x)/rayVector.x; }
			if intervalEnd>=cut.y { grid.y+=sign(rayVector.y); cut.y=(grid.y-origin.y)/rayVector.y; }
		}
	}
	let alpha = dot(coverage/params[2].xyz,vec3f(1./3.));
	var rgb = vec3f(0);
	if coverage.r>0 { rgb.r=colour.r/coverage.r; } if coverage.g>0 { rgb.g=colour.g/coverage.g; } if coverage.b>0 { rgb.b=colour.b/coverage.b; }
	if params[3].x == 0 { rgb *= 3*params[2].xyz; }
	let a = mix(original.a,alpha,bend.z); var straight = vec3f(0);
	if a>0 { straight = (rgb*alpha*bend.z+original.rgb*(1-bend.z))/a; }
	output[p] = keep(vec4f(straight,a));
}`;

let gpuOwner;
async function gpu() {
	if (!gpuOwner) gpuOwner = (async () => {
		if (!globalThis.navigator?.gpu) throw new Error('WebGPU is unavailable');
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) throw new Error('No WebGPU adapter');
		const device = await adapter.requestDevice(), module = device.createShaderModule({code: WGSL});
		const layout = device.createBindGroupLayout({entries: [
			{binding: 0, visibility: 4, texture: {sampleType: 'unfilterable-float'}},
			{binding: 1, visibility: 4, texture: {sampleType: 'unfilterable-float'}},
			{binding: 2, visibility: 4, buffer: {type: 'read-only-storage'}},
			{binding: 3, visibility: 4, buffer: {type: 'uniform'}},
			{binding: 4, visibility: 4, buffer: {type: 'storage'}},
		]});
		const pipeline = await device.createComputePipelineAsync({layout: device.createPipelineLayout({bindGroupLayouts: [layout]}), compute: {module, entryPoint: 'main'}});
		device.lost.then(() => { gpuOwner = null; });
		return {device, pipeline, layout};
	})().catch(error => { gpuOwner = null; throw Object.assign(new Error(error.message || String(error)), {code: 'refraction_webgpu_unavailable'}); });
	return gpuOwner;
}

async function webgpu(state, owner) {
	const {device, pipeline, layout} = owner || await gpu(), {width, height, levels} = state;
	if (Math.max(width, height) > device.limits.maxTextureDimension2D || width * height * 4 > device.limits.maxStorageBufferBindingSize) throw new RangeError('The GPU cannot hold this refraction');
	const resources = [], own = value => { resources.push(value); return value; };
	device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
	let scopes = true;
	try {
		const source = own(device.createTexture({size: [width, height], format: 'rgba32float', mipLevelCount: levels.length, usage: 6}));
		for (let level = 0; level < levels.length; level++) {
			const image = levels[level];
			device.queue.writeTexture({texture: source, mipLevel: level}, image.data, {bytesPerRow: image.width * 16}, [image.width, image.height]);
		}
		const field = own(device.createTexture({size: [width, height], format: 'rgba32float', usage: 6}));
		device.queue.writeTexture({texture: field}, state.field, {bytesPerRow: width * 16}, [width, height]);
		const upload = (data, usage) => { const buffer = own(device.createBuffer({size: data.byteLength, usage: usage | 8})); device.queue.writeBuffer(buffer, 0, data); return buffer; };
		const nodes = upload(new Float32Array(state.nodes.flat()), 128), params = upload(parameters(state), 64);
		const output = own(device.createBuffer({size: width * height * 4, usage: 128 | 4}));
		const readback = own(device.createBuffer({size: width * height * 4, usage: 1 | 8}));
		const group = device.createBindGroup({layout, entries: [
			{binding: 0, resource: source.createView()}, {binding: 1, resource: field.createView()},
			{binding: 2, resource: {buffer: nodes}}, {binding: 3, resource: {buffer: params}}, {binding: 4, resource: {buffer: output}},
		]});
		const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
		pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8)); pass.end();
		encoder.copyBufferToBuffer(output, 0, readback, 0, width * height * 4); device.queue.submit([encoder.finish()]);
		const pending = [device.popErrorScope(), device.popErrorScope()]; scopes = false;
		const errors = await Promise.all(pending); if (errors.some(Boolean)) throw new Error(errors.find(Boolean).message);
		await readback.mapAsync(1);
		const bytes = new Uint8ClampedArray(readback.getMappedRange().slice(0)); readback.unmap();
		return bytes;
	} finally { if (scopes) await Promise.all([device.popErrorScope(), device.popErrorScope()]); for (const value of resources) value.destroy(); }
}

