// SPDX-License-Identifier: AGPL-3.0-only
// Copy machine on the GPU, for Draw's display only. The saved file keeps its SVG filter; this
// computes the same filter graph once per pixel, where a browser re-evaluates shared results
// for every primitive that reads them. Intermediates stay 8-bit, as filter buffers are.
import { admitCopier, copierOffsets } from './effects.mjs';

// The SVG turbulence lattice for one seed: the standard's own generator and gradients.
const BLOCK = 256;
export function copierLattice(seed) {
	const M = 2147483647, A = 16807, Q = 127773, R = 2836;
	let s = Math.trunc(seed);
	if (s <= 0) s = -(s % (M - 1)) + 1;
	if (s > M - 1) s = M - 1;
	const next = () => { s = A * (s % Q) - R * Math.floor(s / Q); if (s <= 0) s += M; return s; };
	const lattice = new Int32Array(BLOCK * 2 + 2), gradient = Array.from({ length: 4 }, () => new Float32Array((BLOCK * 2 + 2) * 2));
	for (let k = 0; k < 4; k++) for (let i = 0; i < BLOCK; i++) {
		lattice[i] = i;
		const x = (next() % (BLOCK * 2) - BLOCK) / BLOCK, y = (next() % (BLOCK * 2) - BLOCK) / BLOCK, length = Math.sqrt(x * x + y * y) || 1;
		gradient[k][i * 2] = x / length; gradient[k][i * 2 + 1] = y / length;
	}
	for (let i = BLOCK - 1; i > 0; i--) { const k = lattice[i], j = next() % BLOCK; lattice[i] = lattice[j]; lattice[j] = k; }
	for (let i = 0; i < BLOCK + 2; i++) {
		lattice[BLOCK + i] = lattice[i];
		for (let k = 0; k < 4; k++) { gradient[k][(BLOCK + i) * 2] = gradient[k][i * 2]; gradient[k][(BLOCK + i) * 2 + 1] = gradient[k][i * 2 + 1]; }
	}
	return { lattice, gradient };
}
// Five rows per seed: the lattice, then each channel's gradients as (x, y) pairs.
const LATTICE_WIDTH = BLOCK * 2 + 2;
function latticeRows(seeds) {
	const rows = new Float32Array(LATTICE_WIDTH * 4 * 5 * seeds.length);
	seeds.forEach((seed, n) => {
		const { lattice, gradient } = copierLattice(seed), base = n * 5;
		for (let i = 0; i < LATTICE_WIDTH; i++) rows[(base * LATTICE_WIDTH + i) * 4] = lattice[i];
		for (let k = 0; k < 4; k++) for (let i = 0; i < LATTICE_WIDTH; i++) {
			const at = ((base + 1 + k) * LATTICE_WIDTH + i) * 4;
			rows[at] = gradient[k][i * 2]; rows[at + 1] = gradient[k][i * 2 + 1];
		}
	});
	return rows;
}

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D t0, t1, t2, t3;
uniform vec4 region;      // filter region origin (user units) and user units per pixel
uniform vec2 size;        // pixels
uniform vec4 p[36];       // pass parameters
out vec4 o;
// Image rows run down the page; WebGL rows run up. Each pass works in image rows.
vec2 pixel() { return vec2(gl_FragCoord.x, gl_FragCoord.y); }
vec2 user(vec2 px) { return region.xy + px * region.zw; }
vec4 at(sampler2D t, vec2 u) { return textureLod(t, ((u - region.xy) / region.zw) / size, 0.); }
// Outside the filter region an input is transparent.
vec4 inside(sampler2D t, vec2 u) { vec2 f = (u - region.xy) / region.zw; return any(lessThan(f, vec2(0.))) || any(greaterThan(f, size)) ? vec4(0.) : textureLod(t, f / size, 0.); }
float q8(float v) { return floor(clamp(v, 0., 1.) * 255. + .5) / 255.; }
`;

// Turbulence as the SVG standard defines it, from the lattice rows in t3.
const NOISE = `
float lattice(int seed, int i) { return texelFetch(t3, ivec2(i, seed * 5), 0).r; }
vec2 gradientAt(int seed, int channel, int i) { return texelFetch(t3, ivec2(i, seed * 5 + 1 + channel), 0).rg; }
// All four channels at one lattice point share its cells; only the gradients differ.
vec4 noise4(int seed, vec2 v) {
 vec2 t = v + 4096.; vec2 b = floor(t); vec2 r0 = t - b; vec2 r1 = r0 - 1.;
 int bx0 = int(b.x) & 255, bx1 = (bx0 + 1) & 255, by0 = int(b.y) & 255, by1 = (by0 + 1) & 255;
 int i = int(lattice(seed, bx0)), j = int(lattice(seed, bx1));
 int b00 = int(lattice(seed, i + by0)), b10 = int(lattice(seed, j + by0)), b01 = int(lattice(seed, i + by1)), b11 = int(lattice(seed, j + by1));
 vec2 s = r0 * r0 * (3. - 2. * r0);
 vec4 result;
 for (int c = 0; c < 4; c++) {
  float a = mix(dot(r0, gradientAt(seed, c, b00)), dot(vec2(r1.x, r0.y), gradientAt(seed, c, b10)), s.x);
  float d = mix(dot(vec2(r0.x, r1.y), gradientAt(seed, c, b01)), dot(r1, gradientAt(seed, c, b11)), s.x);
  result[c] = mix(a, d, s.y);
 }
 return result;
}
// feTurbulence, straight RGBA, clamped as an 8-bit buffer holds it.
vec4 turbulence(int seed, vec2 point, vec2 frequency, int octaves, bool fractal) {
 vec2 v = point * frequency; vec4 sum = vec4(0.); float ratio = 1.;
 for (int n = 0; n < 8; n++) {
  if (n >= octaves) break;
  vec4 value = noise4(seed, v);
  sum += (fractal ? value : abs(value)) / ratio;
  v *= 2.; ratio *= 2.;
 }
 return clamp(fractal ? (sum + 1.) * .5 : sum, 0., 1.);
}
// The buffer keeps it premultiplied in 8 bits; a reader takes its straight colour back.
vec4 straight8(vec4 c) { float a = q8(c.a); return vec4(vec3(q8(c.r * c.a), q8(c.g * c.a), q8(c.b * c.a)) / max(a, 1. / 255.), a); }
`;

// Noise fields, once per seed, region and scale: scan RG, tooth RG; drum, scratches, paper grain.
const NOISE_A = `void main() {
 vec2 u = user(pixel() - p[0].w);
 vec4 scan = straight8(turbulence(0, u, vec2(.013, .19), 2, true)), tooth = straight8(turbulence(1, u, p[0].xy, int(p[0].z), true));
 o = vec4(clamp(scan.rg, 0., 1.), clamp(tooth.rg, 0., 1.));
}`;
const NOISE_B = `void main() {
 vec2 u = user(pixel() - p[0].w);
 vec4 drum = straight8(turbulence(2, u, vec2(.00001, .025), 3, true)), scratch = straight8(turbulence(3, u, vec2(.001, .38), 1, false));
 // Paper grain: sheet multiplied by fibres, premultiplied, then its straight red.
 vec4 sheet = turbulence(4, u, vec2(.012), 3, true), fibres = turbulence(5, u, vec2(.12, .018), 2, true);
 float sa = q8(sheet.a), sr = q8(sheet.r * sheet.a), fa = q8(fibres.a), fr = q8(fibres.r * fibres.a);
 float ra = sa + fa - sa * fa, rr = (1. - sa) * fr + (1. - fa) * sr + sr * fr;
 o = vec4(clamp(drum.r, 0., 1.), clamp(scratch.r, 0., 1.), ra > 0. ? clamp(q8(rr) / q8(ra), 0., 1.) : 0., 1.);
}`;
// Toner: the source through the scan, luminance to coverage, contrast table, grain, drum and wear.
const WORN = `float table(float c) {
 float x = clamp(c, 0., 1.) * 32.; int k = min(int(floor(x)), 31); float f = x - float(k);
 float a = p[4 + k / 4][k % 4], b = p[4 + (k + 1) / 4][(k + 1) % 4];
 return mix(a, b, f);
}
void main() {
 vec2 px = pixel(), u = user(px);
 vec4 noiseA = at(t1, u), noiseB = at(t2, u);
 float jitter = p[1].x, grain = p[1].y, banding = p[1].z, wear = p[1].w;
 // The scan moves the source; a zero scale leaves it exactly in place.
 vec4 source = jitter > 0. ? inside(t0, u + jitter * 18. * (noiseA.xy - .5)) : texelFetch(t0, ivec2(px), 0);
 float alpha = source.a; vec3 straight = alpha > 0. ? source.rgb / alpha : vec3(0.);
 float coverage = q8(q8(1. - dot(straight, vec3(.2126, .7152, .0722))) * alpha);
 float density = q8(table(coverage));
 float broken = q8(density + grain * 2. * noiseA.z - grain * 1.08);
 float toner = q8(broken * alpha);
 float banded = banding > 0. ? q8(toner * q8(banding * 1.6 * noiseB.x + 1. - banding * 1.5)) : toner;
 float worn = wear > 0. ? q8(banded * q8(wear * 3. * noiseB.y + 1. - wear * 2.)) : banded;
 o = vec4(0., 0., 0., worn);
}`;
// Edge scatter through the tooth, then the toner charge.
const CHARGED = `void main() {
 vec2 px = pixel(), u = user(px);
 float scatter = p[2].x, toner = p[2].y;
 float edge = scatter > 0. ? inside(t0, u + scatter * 5. * (at(t1, u).zw - .5)).a : texelFetch(t0, ivec2(px), 0).a;
 o = vec4(0., 0., 0., q8(edge * toner));
}`;
// A separable Gaussian along p[3].xy (pixels), radius three deviations.
const BLUR = `void main() {
 vec2 px = pixel(); vec2 step = p[3].xy; float sigma = p[3].z;
 float sum = 0., weight = 0.;
 int reach = int(ceil(sigma * 3.));
 for (int i = -64; i <= 64; i++) {
  if (i < -reach || i > reach) continue;
  float w = exp(-.5 * float(i * i) / (sigma * sigma));
  vec2 q = px + step * float(i);
  sum += (any(lessThan(q, vec2(0.))) || any(greaterThanEqual(q, size)) ? 0. : texelFetch(t0, ivec2(q), 0).a) * w; weight += w;
 }
 o = vec4(0., 0., 0., q8(sum / weight));
}`;
// Smear: twelve faded impressions along the feed direction, under the charge.
const IMPRESSION = `void main() {
 vec2 px = pixel(), u = user(px);
 float a = 0.;
 for (int i = 12; i > 0; i--) {
  vec4 row = p[13 + (12 - i) / 2]; vec2 offset = (12 - i) % 2 == 0 ? row.xy : row.zw;
  float layer = q8(inside(t0, u - offset).a * p[2].z * (1. - float(i) / 13.) * .12);
  a = layer + a * (1. - layer);
 }
 float charged = texelFetch(t1, ivec2(px), 0).a;
 o = vec4(0., 0., 0., q8(charged + a * (1. - charged)));
}`;
// Paper, scanner edge, copies, the original and the strength mix, merged as SVG merges: over.
const FINAL = `float erfApprox(float x) {
 float t = 1. / (1. + .3275911 * abs(x));
 float y = 1. - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * exp(-x * x);
 return sign(x) * y;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1. - top.a); }
void main() {
 vec2 px = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y), u = user(px);
 vec4 noiseB = at(t2, u);
 // Paper: straight colour from the grain, alpha the Paper setting.
 vec3 paperColour = clamp(p[20].rgb - p[20].a * noiseB.z, 0., 1.);
 float paperAlpha = p[21].x;
 vec4 paper = vec4(q8(paperColour.r * paperAlpha), q8(paperColour.g * paperAlpha), q8(paperColour.b * paperAlpha), paperAlpha);
 // Scanner edge: the paper outside a softened bed.
 vec4 bed = p[22]; float sigma = p[21].y * 1.41421356;
 float bx = (erfApprox((u.x - bed.x) / sigma) - erfApprox((u.x - bed.z) / sigma)) * .5, by = (erfApprox((u.y - bed.y) / sigma) - erfApprox((u.y - bed.w) / sigma)) * .5;
 // The blur takes the flood's own subregion: it softens inward and stops at the bed's edge.
 bool inBed = u.x >= bed.x && u.x <= bed.z && u.y >= bed.y && u.y <= bed.w;
 float bedSoft = inBed ? q8(bx * by) : 0., rimA = q8(paper.a * (1. - bedSoft));
 vec4 shade = vec4(p[23].rgb, 1.) * q8(p[23].a * rimA);
 vec4 print = over(shade, paper);
 int copies = int(p[21].z);
 for (int i = 23; i >= 1; i--) {
  if (i >= copies) continue;
  vec4 row = p[24 + (i - 1) / 2]; vec2 offset = (i - 1) % 2 == 0 ? row.xy : row.zw;
  vec3 tint = p[21].w > .5 ? (i % 2 == 1 ? vec3(21., 149., 181.) / 255. : vec3(132., 102., 162.) / 255.) : p[19].rgb;
  float a = q8(inside(t0, u - offset).a * pow(1. - p[19].a, float(i)) * .8);
  print = over(vec4(tint * a, a), print);
 }
 float impression = texelFetch(t0, ivec2(px), 0).a;
 print = over(vec4(p[19].rgb * impression, impression), print);
 float strength = p[2].w;
 if (strength < 1.) {
  vec4 source = texelFetch(t1, ivec2(px), 0);
  print = clamp(print * strength + source * (1. - strength), 0., 1.);
 }
 o = print;
}`;

function compile(gl, source) {
	const vertex = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertex, '#version 300 es\nvoid main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);gl_Position=vec4(p,0.,1.);}');
	gl.compileShader(vertex);
	const fragment = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragment, source); gl.compileShader(fragment);
	if (!gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fragment));
	const program = gl.createProgram();
	gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
	const where = name => gl.getUniformLocation(program, name);
	return { program, t: [0, 1, 2, 3].map(i => where('t' + i)), region: where('region'), size: where('size'), p: where('p') };
}
const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

// Pixels one canvas may cover before Draw keeps the filter instead.
export const COPIER_GPU_PIXELS = 4.5 * 1024 * 1024;

export class CopierGPU {
	static create(canvas) {
		const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
		if (!gl) return null;
		const self = new CopierGPU(canvas, gl);
		try { self.build(); } catch (error) { console.warn('[rapier] copy machine GPU', error); return null; }
		return self;
	}
	constructor(canvas, gl) { this.canvas = canvas; this.gl = gl; this.p = new Float32Array(144); this.noiseKey = ''; this.noiseShift = 0; }
	build() {
		const gl = this.gl;
		this.programs = Object.fromEntries(Object.entries({ noiseA: NOISE + NOISE_A, noiseB: NOISE + NOISE_B, worn: WORN, charged: CHARGED, blur: BLUR, impression: IMPRESSION, final: FINAL })
			.map(([name, body]) => [name, compile(gl, HEAD + body)]));
		this.vao = gl.createVertexArray(); this.fbo = gl.createFramebuffer();
		this.lattices = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.lattices);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	}
	texture(w, h, internal, filter) {
		const gl = this.gl, t = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return t;
	}
	resize(w, h) {
		if (this.size?.[0] === w && this.size?.[1] === h) return;
		const gl = this.gl;
		for (const t of Object.values(this.tex || {})) gl.deleteTexture(t);
		this.size = [w, h]; this.canvas.width = w; this.canvas.height = h; this.noiseKey = '';
		const rgba = () => this.texture(w, h, gl.RGBA8, gl.LINEAR);
		this.tex = { source: rgba(), noiseA: rgba(), noiseB: rgba(), worn: rgba(), charged: rgba(), blurred: rgba(), drag: rgba(), impression: rgba() };
	}
	// The source graphic over the filter region, already at this canvas's size.
	setSource(image) {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.tex.source);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size[0], this.size[1], gl.RGBA, gl.UNSIGNED_BYTE, image);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
	}
	pass(name, target, inputs, region) {
		const gl = this.gl, program = this.programs[name];
		gl.useProgram(program.program);
		if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0); }
		else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.size[0], this.size[1]);
		gl.uniform4fv(program.region, region); gl.uniform2f(program.size, this.size[0], this.size[1]); gl.uniform4fv(program.p, this.p);
		inputs.forEach((input, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, input); gl.uniform1i(program.t[i], i); });
		gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
	}
	// Renders one copier group from its admitted effect and its filter region (copierBounds), in user units.
	render(effect, b) {
		const e = admitCopier(effect);
		if (!e || !this.size) return false;
		const gl = this.gl, [w, h] = this.size, unitX = (b.maxX - b.minX) / w, unitY = (b.maxY - b.minY) / h;
		const region = new Float32Array([b.minX, b.minY, unitX, unitY]), p = this.p.fill(0);
		const fax = e.preset === 'fax', news = e.preset === 'newsprint', blueprint = e.preset === 'blueprint';
		const seeds = [e.seed, e.seed % 100000 + 17, e.seed % 100000 + 29, e.seed % 100000 + 43, e.seed % 100000 + 61, e.seed % 100000 + 73];
		const key = seeds.join() + '|' + [...region].join() + '|' + w + 'x' + h + '|' + (news ? 'n' : fax ? 'f' : 'c') + this.noiseShift;
		p.set(news ? [.32, .32, 1, this.noiseShift] : fax ? [.7, .35, 1, this.noiseShift] : [.83, .83, 3, this.noiseShift], 0);
		p.set([e.jitter, e.grain, e.banding, e.wear], 4);
		p.set([e.scatter, e.toner, e.smear, e.strength], 8);
		const curve = Array.from({ length: 33 }, (_, i) => {
			let v = Math.max(0, Math.min(1, (i / 32 - .5) * e.contrast + .5 - e.exposure * .65));
			if (fax) v = v < .48 ? 0 : 1;
			return v;
		});
		p.set(curve, 16);
		if (key !== this.noiseKey) {
			gl.bindTexture(gl.TEXTURE_2D, this.lattices);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, LATTICE_WIDTH, 5 * seeds.length, 0, gl.RGBA, gl.FLOAT, latticeRows(seeds));
			this.pass('noiseA', this.tex.noiseA, [null, null, null, this.lattices], region);
			this.pass('noiseB', this.tex.noiseB, [null, null, null, this.lattices], region);
			this.noiseKey = key;
		}
		this.pass('worn', this.tex.worn, [this.tex.source, this.tex.noiseA, this.tex.noiseB], region);
		this.pass('charged', this.tex.charged, [this.tex.worn, this.tex.noiseA], region);
		let impression = this.tex.charged;
		if (e.smear) {
			const sigma = (.6 + e.smear * 1.5) / unitX;
			p.set([1, 0, sigma, 0], 12); this.pass('blur', this.tex.blurred, [this.tex.charged], region);
			p.set([0, 1, sigma, 0], 12); this.pass('blur', this.tex.drag, [this.tex.blurred], region);
			const angle = e.angle * Math.PI / 180;
			for (let i = 12; i > 0; i--) {
				const reach = e.smear * 42 * i / 12, slot = 52 + (12 - i) * 2;
				p[slot] = Math.cos(angle) * reach; p[slot + 1] = Math.sin(angle) * reach;
			}
			this.pass('impression', this.tex.impression, [this.tex.drag, this.tex.charged], region);
			impression = this.tex.impression;
		}
		const ink = blueprint ? hexRgb('#e1edf4') : hexRgb('#191919');
		const base = blueprint ? [.075, .19, .34] : [.99, .985 - e.warmth * .05, .97 - e.warmth * .13];
		copierOffsets(e).forEach(([dx, dy], i) => { p[96 + i * 2] = dx; p[96 + i * 2 + 1] = dy; });
		const rim = Math.min(b.maxX - b.minX, b.maxY - b.minY) * .04;
		p.set([...ink, e.fade], 76);
		p.set([...base, .035 + e.grain * .13], 80);
		p.set([e.paper, Math.max(.5, rim * .7), e.copies, e.preset === 'cyan-drift' ? 1 : 0], 84);
		p.set([b.minX + rim, b.minY + rim, b.maxX - rim, b.maxY - rim], 88);
		p.set([...hexRgb('#30291e'), e.edge * .75], 92);
		this.pass('final', null, [impression, this.tex.source, this.tex.noiseB], region);
		return true;
	}
	destroy() { const gl = this.gl; for (const t of Object.values(this.tex || {})) gl.deleteTexture(t); gl.deleteTexture(this.lattices); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}
