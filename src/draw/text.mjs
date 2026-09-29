// SPDX-License-Identifier: AGPL-3.0-only
import { fontAdvance, fontFamily, fontMetrics } from './font.mjs';
import { PAPER_OCTAVES } from './grain.mjs';
import { keepLetterGlyph, letterGlyph, letterSet, letterSetHeld } from './letters.mjs';
import { measuredLines } from '../layout/line-plan.mjs';

const DRAW_TEXT_MAX = 4096;
const number = n => typeof n === 'number' && Number.isFinite(n);
const fmt = n => String(Math.round(n * 1000) / 1000);
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const box = (x, y, w, h) => ({ minX: x, minY: y, maxX: x + w, maxY: y + h, w, h });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// Geist Mono's figures (wght 400, 1000 units, baseline at 0, y down, advance 600, cap height 710), drawn as paths so a
// diagram's numbers are Geist Mono in every viewer, with or without the face.
const MONO_FIGURES = ["M120-102L400-612L480-608L200-98ZM300 16Q223 16 166-29Q110-74 80-157Q50-240 50-354Q50-469 80-552Q110-635 166-680Q223-726 300-726Q378-726 434-680Q490-635 520-552Q550-469 550-354Q550-240 520-157Q490-74 434-29Q378 16 300 16ZM300-68Q350-68 386-103Q421-138 440-202Q460-267 460-354Q460-443 440-508Q421-572 386-607Q350-642 300-642Q251-642 215-607Q179-572 160-508Q140-443 140-354Q140-267 160-202Q179-138 215-103Q251-68 300-68Z", "M284 0L284-526L98-526L98-600L194-600Q232-600 256-611Q279-622 290-646Q300-670 300-710L370-710L370 0ZM60 0L60-84L540-84L540 0Z", "M50 0Q50-75 74-136Q97-196 156-251Q216-306 322-362Q371-388 401-410Q431-432 445-457Q459-482 459-518Q459-555 443-582Q427-610 396-626Q364-642 317-642Q242-642 198-603Q155-564 144-492L54-498Q66-602 134-664Q202-726 317-726Q390-726 442-700Q494-674 522-628Q549-581 549-520Q549-466 531-426Q513-387 470-353Q428-319 354-280Q290-246 246-211Q203-176 180-144Q158-111 156-84L550-84L550 0Z", "M294 16Q179 16 117-40Q55-95 50-183L139-189Q145-124 188-96Q230-68 294-68Q337-68 375-80Q413-93 436-122Q460-150 460-198Q460-245 439-276Q418-306 382-320Q345-335 299-335L243-335L243-419L299-419Q336-419 367-430Q398-441 416-466Q435-490 435-530Q435-585 400-614Q365-642 299-642Q232-642 198-615Q163-588 156-541L66-547Q76-627 136-676Q196-726 299-726Q368-726 419-702Q470-679 498-636Q525-593 525-534Q525-468 484-428Q442-387 361-372L361-390Q448-380 499-328Q550-276 550-198Q550-130 517-82Q484-34 426-9Q368 16 294 16Z", "M388 0L388-154L40-154L40-232L382-710L474-710L474-238L560-238L560-154L474-154L474 0ZM128-238L388-238L388-590Z", "M298 16Q229 16 178-9Q126-34 96-79Q65-124 60-183L150-189Q158-129 198-98Q237-68 298-68Q367-68 408-110Q450-153 450-228Q450-278 432-314Q414-351 380-370Q347-390 300-390Q258-390 220-370Q181-349 164-311L72-311L119-710L497-710L497-626L198-626L166-364L150-380Q166-411 192-431Q218-451 250-462Q281-472 312-472Q380-472 432-440Q483-409 512-354Q540-299 540-228Q540-157 509-102Q478-46 424-15Q369 16 298 16Z", "M302 16Q222 16 166-20Q109-57 80-128Q50-199 50-300Q50-388 64-465Q79-542 112-600Q144-659 198-692Q251-726 330-726Q393-726 437-705Q481-684 508-646Q536-608 550-558L460-550Q448-592 418-617Q389-642 330-642Q271-642 229-608Q187-575 164-508Q140-441 138-340L120-344Q131-380 158-410Q186-441 226-460Q267-478 318-478Q388-478 440-448Q492-418 521-364Q550-309 550-236Q550-158 518-102Q487-45 432-14Q376 16 302 16ZM304-68Q374-68 417-112Q460-157 460-236Q460-310 420-353Q379-396 312-396Q264-396 226-376Q188-357 166-321Q144-285 144-236Q144-187 164-149Q183-111 219-90Q255-68 304-68Z", "M192 0Q192-110 222-220Q253-329 310-432Q367-535 446-626L60-626L60-710L540-710L540-632Q473-556 424-481Q376-406 345-330Q314-253 299-172Q284-90 284 0Z", "M300 16Q230 16 173-8Q116-32 83-79Q50-126 50-195Q50-272 96-322Q142-373 218-391L220-371Q159-388 122-426Q84-465 84-531Q84-587 112-631Q140-675 188-700Q237-726 300-726Q363-726 412-700Q461-675 488-631Q516-587 516-531Q516-465 479-426Q442-388 380-371L382-391Q459-373 504-322Q550-272 550-195Q550-126 517-79Q484-32 428-8Q371 16 300 16ZM300-68Q370-68 415-100Q460-133 460-200Q460-262 420-300Q380-337 300-337Q221-337 180-300Q140-262 140-200Q140-133 185-100Q230-68 300-68ZM300-417Q357-417 392-446Q426-474 426-531Q426-582 392-612Q359-642 300-642Q242-642 208-612Q174-582 174-531Q174-474 208-446Q243-417 300-417Z", "M298-726Q378-726 434-690Q491-653 520-582Q550-512 550-410Q550-322 536-245Q521-168 488-110Q456-51 402-18Q349 16 270 16Q207 16 163-5Q119-26 92-64Q64-102 50-152L140-160Q152-118 182-93Q212-68 270-68Q329-68 372-102Q414-135 437-202Q460-269 462-370L480-366Q469-330 442-300Q414-269 374-250Q333-232 282-232Q212-232 160-262Q108-292 79-346Q50-401 50-474Q50-552 82-608Q113-665 169-696Q225-726 298-726ZM296-642Q226-642 183-598Q140-554 140-474Q140-401 180-358Q221-314 288-314Q336-314 374-334Q412-353 434-389Q456-425 456-474Q456-523 436-561Q417-599 381-620Q345-642 296-642Z"];
const monoFigures = (digits, x, baseline, size) => digits.split('').map((digit, i) => MONO_FIGURES[digit].replace(/(-?\d+) (-?\d+)|(-?\d+)(-?\d+)/g, (all, a, b, c, d) => fmt(x + (i * 600 + +(a ?? c)) * size / 1000) + ' ' + fmt(baseline + +(b ?? d) * size / 1000))).join('');
const textLimit = () => { throw Object.assign(new Error('Drawing text exceeds the geometry limit'), { code: 'drawing_geometry_limit' }); };

function admitText(raw, kind) {
	const out = {};
	if (raw.textWrap != null) { if (raw.textWrap !== 'balance') return null; out.textWrap = raw.textWrap; }
	if (raw.label != null) {
		if (typeof raw.label !== 'string' || raw.label.length > DRAW_TEXT_MAX || /[\ud800-\udfff\ufffe\uffff]/u.test(raw.label)) return null;
		const value = raw.label.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ');
		if (value) out.label = value;
	}
	for (const [key, min, max] of [['textSize', 6, 512], ['lineHeight', 1, 2.5], ['letterSpacing', -.2, .6], ['labelWidth', 6, 65536], ['labelPos', 0, 1]]) {
		if (raw[key] == null) continue;
		if (!number(raw[key]) || raw[key] < min || raw[key] > max) return null;
		out[key] = raw[key];
	}
	for (const [key, values] of [['labelAlign', ['start', 'middle', 'end']], ['labelVAlign', ['top', 'middle', 'bottom']]]) {
		if (raw[key] == null) continue;
		if (!values.includes(raw[key])) return null;
		if (raw[key] !== (key === 'labelAlign' && kind === 'text' ? 'start' : 'middle')) out[key] = raw[key];
	}
	if (raw.textFont != null) {
		if (typeof raw.textFont !== 'string' || !/^(?:sans|serif|mono|f[0-9a-f]{24}|letters:[a-z][a-z0-9-]{0,31})$/.test(raw.textFont)) return null;
		if (raw.textFont !== 'sans') out.textFont = raw.textFont;
	}
	if (raw.labelBeside && (!['arrow', 'line'].includes(kind) || raw.route !== 'auto')) return null;
	for (const key of ['textBold', 'textItalic', 'textUnderline', 'labelBeside']) {
		if (raw[key] != null && typeof raw[key] !== 'boolean') return null;
		if (raw[key]) out[key] = true;
	}
	// The type a designer reaches for past weight and slant: word spacing (em, like tracking), the
	// case the words are shown in (the label keeps what was typed), metric kerning (on unless
	// switched off), the figure style an uploaded font carries, and the one effect, the pressed letter.
	if (raw.wordSpacing != null) {
		if (!number(raw.wordSpacing) || raw.wordSpacing < -.2 || raw.wordSpacing > 1) return null;
		out.wordSpacing = raw.wordSpacing;
	}
	for (const [key, values] of [['textCase', ['upper', 'lower', 'small']], ['textFigures', ['oldstyle', 'lining', 'tabular']], ['textEffect', ['pressed']]]) {
		if (raw[key] == null) continue;
		if (!values.includes(raw[key]) || key === 'textEffect' && kind !== 'text') return null;
		out[key] = raw[key];
	}
	if (raw.textKern != null) {
		if (typeof raw.textKern !== 'boolean') return null;
		if (!raw.textKern) out.textKern = false;
	}
	if (raw.labelIn === true && !['text', 'line', 'arrow', 'arc', 'ink'].includes(kind)) out.labelIn = true;
	// A step number: the place a box holds in the order a flow is read, set above its words.
	if (raw.step != null) {
		if (!Number.isInteger(raw.step) || raw.step < 1 || raw.step > 99 || !out.labelIn) return null;
		out.step = raw.step;
	}
	return out;
}

function clusters(text) {
	const out = [];
	let i = 0, join = false, regional = false;
	for (const c of text) {
		const cp = c.codePointAt(0), mark = /\p{Mark}/u.test(c) || cp >= 0xfe00 && cp <= 0xfe0f || cp >= 0xe0100 && cp <= 0xe01ef || cp >= 0x1f3fb && cp <= 0x1f3ff;
		const flag = cp >= 0x1f1e6 && cp <= 0x1f1ff;
		if (out.length && (mark || join || cp === 0x200d || flag && regional)) {
			out[out.length - 1].text += c;
			out[out.length - 1].end += c.length;
		} else out.push({ text: c, start: i, end: i + c.length });
		join = cp === 0x200d;
		regional = flag && !regional;
		i += c.length;
	}
	return out;
}

function fallbackAdvance(text, family) {
	let total = 0;
	for (const unit of clusters(text)) {
		let sum = 0, widest = 0, joined = false, flags = 0;
		for (const c of unit.text) {
			const n = c.codePointAt(0);
			if (n === 0x200d) { joined = true; continue; }
			if (/\p{Mark}|\p{Default_Ignorable_Code_Point}/u.test(c) || n >= 0x1f3fb && n <= 0x1f3ff) continue;
			if (n >= 0x1f1e6 && n <= 0x1f1ff) flags++;
			const width = family === 'mono' ? .6 : c === '\t' ? 1.28 : c === ' ' || c === '\u00a0' || c === '\u202f' ? .32 : /[ilI.,'`!|:;]/.test(c) ? .28 : /[ftr()\[\]{}]/.test(c) ? .4 : /[mwMW@#%&]/.test(c) ? .86 : /[A-Z]/.test(c) ? .66 : /[0-9]/.test(c) ? .56 : n >= 0x2e80 && n <= 0xd7af || n >= 0xf900 && n <= 0xfaff || n >= 0x1f000 ? 1 : family === 'serif' ? .51 : .54;
			sum += width;
			widest = Math.max(widest, width);
		}
		total += joined || flags === 2 ? widest : sum;
	}
	return total;
}

function textTokens(text, start) {
	const out = [];
	let current = null;
	for (const unit of clusters(text)) {
		const n = unit.text.codePointAt(0), space = /^[ \t\u1680\u2000-\u2006\u2008-\u200a\u205f\u3000]+$/.test(unit.text), soft = unit.text === '\u200b';
		const breakable = n >= 0x2e80 && n <= 0xd7af || n >= 0xf900 && n <= 0xfaff || n >= 0x20000 && n <= 0x3ffff;
		const glue = /^[\u00a0\u2007\u202f\u2060]/.test(unit.text) || /[\u00a0\u2007\u202f\u2060]$/.test(current?.text || '');
		if (!current || current.space !== space || !glue && (soft || breakable || current.breakAfter)) {
			current = { text: '', start: start + unit.start, end: start + unit.end, space, breakAfter: false };
			out.push(current);
		}
		current.text += unit.text;
		current.end = start + unit.end;
		current.breakAfter = soft || breakable || /[-\u2010\u2013]$/.test(unit.text);
	}
	return out;
}

function wrapText(text, width, measure, balance = 0, lineHeight = 0) {
	const paragraphs = text.split(/[\n\u2028\u2029]/), rows = [], groups = [];
	let offset = 0, longest = 0;
	for (const paragraph of paragraphs) {
		const tokens = textTokens(paragraph, offset);
		for (const token of tokens) {
			token.width = measure(token.text);
			if (!token.space) longest = Math.max(longest, token.width);
		}
		groups.push({ text: paragraph, start: offset, tokens });
		offset += paragraph.length + 1;
	}
	// Width is a soft wrap limit: keep words and Unicode clusters intact, widening for an unbreakable run.
	const limit = width ? Math.max(width, longest) : Infinity;
	for (const group of groups) {
		if (!width || !group.tokens.length) {
			rows.push({ text: group.text, start: group.start, end: group.start + group.text.length, width: measure(group.text) });
			continue;
		}
		if (balance && group.tokens.some(token => !token.space)) {
			const planned = measuredLines(group.tokens, limit, lineHeight, balance);
			if (!planned) textLimit();
			rows.push(...planned); continue;
		}
		let current = '', lineStart = group.start, end = group.start, advance = 0, pending = '', pendingWidth = 0;
		const flush = () => { rows.push({ text: current, start: lineStart, end, width: advance }); current = ''; advance = 0; pending = ''; pendingWidth = 0; };
		for (const token of group.tokens) {
			if (token.space) { pending += token.text; pendingWidth += token.width; continue; }
			if (current && advance + pendingWidth + token.width > limit + .001) { flush(); lineStart = token.start; }
			if (!current && !advance && lineStart === group.start) { current = pending; advance = pendingWidth; }
			else if (current) { current += pending; advance += pendingWidth; }
			current += token.text;
			advance += token.width;
			end = token.end;
			pending = '';
			pendingWidth = 0;
		}
		if (pending) { current += pending; advance += pendingWidth; end = group.start + group.text.length; }
		flush();
	}
	return { lines: rows, longest, wrapWidth: width ? Math.max(width, longest) : 0 };
}

function pathData(points) {
	const lengths = [0];
	for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
	return { points, lengths, total: lengths[lengths.length - 1] || 0 };
}

function along(data, fraction) {
	const d = data.total * fraction;
	for (let i = 1; i < data.points.length; i++) {
		if (data.lengths[i] < d) continue;
		const a = data.points[i - 1], b = data.points[i], t = (d - data.lengths[i - 1]) / (data.lengths[i] - data.lengths[i - 1] || 1);
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	}
	return data.points[data.points.length - 1];
}

function endClearance(points, width, height, inset) {
	if (!(inset > 0)) return 0;
	const start = points[0], hx = width / 2 + inset, hy = height / 2 + inset;
	let length = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1], segment = Math.hypot(dx, dy);
		if (Math.abs(b[0] - start[0]) > hx || Math.abs(b[1] - start[1]) > hy) {
			const tx = dx ? (start[0] + Math.sign(dx) * hx - a[0]) / dx : Infinity;
			const ty = dy ? (start[1] + Math.sign(dy) * hy - a[1]) / dy : Infinity;
			return length + segment * clamp(Math.min(tx, ty), 0, 1);
		}
		length += segment;
	}
	return length;
}

function rotatedBox(rect, origin, rotation) {
	const c = Math.cos(rotation), s = Math.sin(rotation);
	const points = [[rect.minX, rect.minY], [rect.maxX, rect.minY], [rect.maxX, rect.maxY], [rect.minX, rect.maxY]].map(p => [origin.x + (p[0] - origin.x) * c - (p[1] - origin.y) * s, origin.y + (p[0] - origin.x) * s + (p[1] - origin.y) * c]);
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]), minX = Math.min(...xs), minY = Math.min(...ys);
	return { polygon: points, bounds: box(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY) };
}

// The pressed letter: type printed by a plate into soft paper, as SVG's own filter primitives, so a
// pressed text stays a text shape and an SVG in every viewer. The light comes from the upper left.
// The glyph's edge is nibbled by the paper's finest fibres (a displacement by the finest octave of
// grain.mjs, a fraction of a unit); the ink lies in the well a shade darker, its density mottled by
// the same three octaves at the paper's own cell sizes, the coarser ones weighted up, so the paper
// shows through where its tooth stands up; the well's upper-left walls fall into shadow and its
// lower-right walls catch the light as the ink itself lifted toward white; the paper just above and
// left of the letter is pushed down with it, a faint shade. `depth` is the wall's width, growing
// slowly with the size and capped, as a plate's bite is. No colour is written as a value (every tint
// is a matrix over the ink or its alpha), so the dark-paper display that re-inks a drawing's colours
// re-inks the pressed ink with them; no light is laid on the paper outside, so dark paper shows no halo.
function pressed(shape, size, painted) {
	const depth = clamp(1 + size * .018, 1.2, 4.5), margin = depth * 4 + 2, id = 'rapier-pressed-' + String(shape.id || 'text').replace(/[^\w-]/g, '_');
	let seed = 7;
	for (const c of String(shape.id || '')) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) % 9973;
	const [[, w0], [, w1], [, w2]] = PAPER_OCTAVES, shift = (input, deviation, d, out) => '<feGaussianBlur in="' + input + '" stdDeviation="' + fmt(depth * deviation) + '"/><feOffset dx="' + fmt(depth * d) + '" dy="' + fmt(depth * d) + '" result="' + out + '"/>';
	const matrix = (input, rows, out) => '<feColorMatrix in="' + input + '" values="' + rows + '" result="' + out + '"/>';
	return '<defs><filter id="' + id + '" filterUnits="userSpaceOnUse" x="' + fmt(painted.minX - margin) + '" y="' + fmt(painted.minY - margin) + '" width="' + fmt(painted.w + margin * 2) + '" height="' + fmt(painted.h + margin * 2) + '" color-interpolation-filters="sRGB">' +
		PAPER_OCTAVES.map(([cell], i) => '<feTurbulence type="fractalNoise" baseFrequency="' + fmt(1 / cell) + '" seed="' + (seed + i) + '" result="t' + i + '"/>').join('') +
		'<feDisplacementMap in="SourceGraphic" in2="t0" scale="' + fmt(Math.min(depth * .12, .5)) + '" xChannelSelector="R" yChannelSelector="G" result="bitten"/>' +
		// The ink: a shade darker in the well, thinned where the tooth rises.
		'<feComposite in="t1" in2="t2" operator="arithmetic" k2="' + fmt(w1 * 1.4) + '" k3="' + fmt(w2 * 3) + '" result="m"/><feComposite in="t0" in2="m" operator="arithmetic" k2="' + fmt(w0 * .5) + '" k3="1"/>' +
		matrix('', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -.45 0 0 0 1.22', 'density').replace(' in=""', '') +
		matrix('bitten', '.9 0 0 0 0 0 .9 0 0 0 0 0 .9 0 0 0 0 0 1 0', 'well') + '<feComposite in="well" in2="density" operator="in" result="ink"/>' +
		// The walls: the paper outside the glyph, moved in from one side, softened, kept inside it.
		matrix('bitten', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1 1', 'hole') +
		shift('hole', .4, .6, 'fall') + '<feComposite in="fall" in2="bitten" operator="arithmetic" k1=".6" result="shade"/>' +
		shift('hole', .15, -.42, 'rise') + '<feComposite in="rise" in2="bitten" operator="in" result="rim"/>' +
		matrix('bitten', '.5 0 0 0 .5 0 .5 0 0 .5 0 0 .5 0 .5 0 0 0 1 0', 'lifted') + '<feComposite in="lifted" in2="rim" operator="in" result="light"/>' +
		// The paper above and left of the letter, pushed down with it.
		shift('bitten', .8, -.4, 'above') + matrix('above', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .1 0', 'aboveA') + '<feComposite in="aboveA" in2="bitten" operator="out" result="slope"/>' +
		'<feMerge><feMergeNode in="slope"/><feMergeNode in="ink"/><feMergeNode in="shade"/><feMergeNode in="light"/></feMerge></filter></defs><g filter="url(#' + id + ')">';
}


// One line in a letter set: each capital its path, placed at the pen by the set's advance and scaled from the em to
// the size; spaces advance; any other character, and a capital whose outline this page has not got, is a serif <text>
// held to its planned width.
function letterLine(line, letters, size, tracking, words, family, color) {
	const k = letters ? size / letters.em : 0;
	let x = line.x, paths = '', type = '';
	for (const unit of clusters(line.text)) {
		const glyph = letterGlyph(letters, unit.text), em = glyph ? glyph[0] / letters.em : unit.text === ' ' && letters ? letters.space / letters.em : fallbackAdvance(unit.text, 'serif');
		if (glyph?.[1]) paths += '<path transform="matrix(' + fmt(k) + ' 0 0 ' + fmt(k) + ' ' + fmt(x + letters.bearing * k) + ' ' + fmt(line.y - size) + ')" d="' + glyph[1] + '"/>';
		else if (!/^\s+$/u.test(unit.text)) type += '<text x="' + fmt(x) + '" y="' + fmt(line.y) + '" font-family="' + escape(family) + '" font-size="' + fmt(size) + '" fill="' + escape(color) + '" textLength="' + fmt(em * size) + '" lengthAdjust="spacingAndGlyphs">' + escape(unit.text) + '</text>';
		x += (em + tracking + (/^[ \u00a0]$/.test(unit.text) ? words : 0)) * size;
	}
	return (paths ? '<g fill="' + escape(color) + '" fill-rule="evenodd">' + paths + '</g>' : '') + type;
}

// The capitals a drawing carries: a text in a letter set this page does not hold draws its capitals from the paths in the
// drawing's own SVG (letterLine's <g fill-rule="evenodd"> runs, in the order the label draws them), each kept for its
// set, so a reopen, a re-render and an agent's edit draw the same capitals with no set and no network. A capital the
// SVG shows in the serif (its <text>) was not there when it was written and stays so. Returns the recipe.
function restoreLetters(recipe, svg) {
	if (typeof svg !== 'string' || !Array.isArray(recipe?.shapes)) return recipe;
	for (const shape of recipe.shapes) {
		const id = /^letters:([a-z][a-z0-9-]{0,31})$/.exec(shape?.textFont || '')?.[1];
		if (!id || letterSetHeld(id) || typeof shape.label !== 'string' || typeof shape.id !== 'string') continue;
		const start = svg.indexOf('<g data-shape-id="' + escape(shape.id) + '"');
		if (start < 0) continue;
		const end = svg.indexOf('<g data-shape-id="', start + 1), own = svg.slice(start, end < 0 ? svg.length : end);
		const paths = [...own.matchAll(/<g fill="[^"]*" fill-rule="evenodd">((?:<path transform="matrix\([^)"]*\)" d="[^"]*"\/>)+)<\/g>/g)].flatMap(run => [...run[1].matchAll(/ d="([^"]*)"/g)].map(m => m[1]));
		const serif = new Set([...own.matchAll(/<text [^>]*>([A-Za-z])<\/text>/g)].map(m => m[1].toUpperCase()));
		const drawn = clusters(shape.label.replace(/\u200b/g, '')).map(unit => unit.text).filter(c => /^[A-Za-z]$/.test(c) && !serif.has(c.toUpperCase()));
		if (drawn.length === paths.length) drawn.forEach((c, i) => keepLetterGlyph(id, c.toUpperCase(), paths[i]));
	}
	return recipe;
}

function layoutText(shape, context = {}) {
	const text = shape.label || '', standalone = shape.recognized === 'text', arrow = shape.recognized === 'arrow' || shape.recognized === 'line';
	if (typeof text !== 'string' || text.length > DRAW_TEXT_MAX || /[\ud800-\udfff\ufffe\uffff]/u.test(text)) textLimit();
	const size = shape.textSize ?? (standalone ? 24 : 14), multiplier = shape.lineHeight ?? 1.25, tracking = shape.letterSpacing ?? 0, font = shape.textFont || 'sans', fonts = context.fonts;
	if (!number(size) || size < 6 || size > 512 || !number(multiplier) || multiplier < 1 || multiplier > 2.5 || !number(tracking) || tracking < -.2 || tracking > .6) textLimit();
	// A letter set draws its capitals as the set's own paths, the em the capital's height; anything else it holds
	// is the serif face at the same size on the same baseline. A set this page does not carry draws in the serif.
	const lettered = font.startsWith('letters:'), letters = lettered ? letterSet(font.slice(8)) : null;
	const lineHeight = Math.round(size * multiplier), family = fontFamily(lettered ? 'serif' : font, fonts), metrics = lettered ? { ascent: 1, descent: .1, lineGap: 0 } : fontMetrics(font, fonts) || { ascent: .8, descent: .2, lineGap: 0 };
	const ascent = number(metrics.ascent) && metrics.ascent > 0 ? metrics.ascent : .8, descent = number(metrics.descent) && metrics.descent >= 0 ? metrics.descent : .2;
	const baseline = (lineHeight - size * (ascent + descent)) / 2 + size * ascent;
	const ink = metrics.ink, padLeft = Math.max(size * .12, ink && number(ink.minX) ? -ink.minX * size : 0), padRight = Math.max(size * (shape.textItalic ? .32 : .12), ink && number(ink.maxX) ? (ink.maxX - .3) * size : 0);
	const padTop = Math.max(size * .1, ink && number(ink.minY) ? -ink.minY * size - baseline : 0), padBottom = Math.max(size * .1, ink && number(ink.maxY) ? ink.maxY * size - (lineHeight - baseline) : 0);
	// The case is shown, never written: the label keeps what was typed, the planner and the SVG both
	// read the shown string, so wrapping, carets and the drawn words agree.
	const textCase = lettered ? '' : shape.textCase, words = shape.wordSpacing || 0;
	const cache = new Map(), display = value => {
		const shown = value.replace(/\t/g, '    ').replace(/\u200b/g, '');
		return textCase === 'upper' ? shown.toUpperCase() : textCase === 'lower' ? shown.toLowerCase() : shown;
	};
	const letterAdvance = value => { let em = 0; for (const c of value) { const glyph = letterGlyph(letters, c); em += glyph ? glyph[0] / letters.em : c === ' ' && letters ? letters.space / letters.em : fallbackAdvance(c, 'serif'); } return em; };
	const advance = value => { if (lettered) return letterAdvance(value); const precise = fontAdvance(value, font, fonts); return number(precise) && precise >= 0 ? precise : fallbackAdvance(value, font); };
	const measure = value => {
		if (cache.has(value)) return cache.get(value);
		const shown = display(value);
		// Small capitals are the capitals at the size a browser gives synthesized small caps (0.7),
		// so a font without its own set and the planner measure the same line.
		let em;
		if (textCase === 'small') {
			let small = '', rest = '';
			for (const c of shown) { if (c !== c.toUpperCase() && c === c.toLowerCase()) small += c.toUpperCase(); else rest += c; }
			em = advance(rest) + .7 * advance(small);
		} else em = advance(shown);
		// Tracking is part of layout, not decoration: it changes wrapping, the selection box and caret
		// positions. Charging one tracking step per displayed cluster keeps token widths additive, so
		// the wrapper and the per-cluster caret plan stay in the same metric space. Word spacing is
		// charged the same way, once per space the words are separated by.
		const width = Math.max(0, em * size * (shape.textBold && !lettered ? 1.04 : 1) + clusters(shown).length * size * tracking + (words ? (shown.match(/[ \u00a0]/g) || []).length * size * words : 0));
		if (!number(width) || width > 65536) textLimit();
		cache.set(value, width);
		return width;
	};
	const g = shape.geom || {}, supplied = context.box || box(g.cx || 0, g.cy || 0, 0, 0);
	const frame = context.frame || { cx: (supplied.minX + supplied.maxX) / 2, cy: (supplied.minY + supplied.maxY) / 2, w: supplied.w ?? supplied.maxX - supplied.minX, h: supplied.h ?? supplied.maxY - supplied.minY };
	const inside = !standalone && !arrow && shape.labelIn;
	// The step number: two Geist Mono figures above the words at the size of a caption, in the quiet ink, on the words' edge.
	// Its block (the figures' cap height and a gap of half the words' size) is room the words give up, so the planner that
	// sizes a box to its words sizes it for both.
	const step = inside && Number.isInteger(shape.step) ? shape.step : 0, stepSize = step ? Math.round(size * 1.6) : 0;
	const stepBlock = step ? Math.round(stepSize * .71 + size * .5) : 0;
	const room = step ? 12 : 8, insetLeft = inside ? room + padLeft : 0, insetRight = inside ? room + padRight : 0, insetTop = inside ? room + padTop + stepBlock : 0, insetBottom = inside ? room + padBottom : 0;
	const align = arrow ? 'middle' : shape.labelAlign || (standalone ? 'start' : 'middle'), alignFactor = align === 'start' ? 0 : align === 'end' ? 1 : .5;
	let width = 0, path = null;
	if (standalone) width = g.w > 0 ? Math.max(16, g.w) : 0;
	else if (arrow && context.path?.length > 1) {
		path = pathData(context.path);
		const xs = context.path.map(p => p[0]), ys = context.path.map(p => p[1]), spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
		width = spanX >= spanY ? Math.max(size * 2, spanX - 48) : size * 16;
	} else if (inside) width = Math.max(size, frame.w - insetLeft - insetRight);
	else width = shape.labelWidth || size * 20;
	if (shape.labelWidth) width = width ? Math.min(width, shape.labelWidth) : shape.labelWidth;
	if (!number(width) || width < 0 || width > 65536) textLimit();
	const wrapped = wrapText(text, width, measure, shape.textWrap === 'balance' ? size : 0, lineHeight), lines = wrapped.lines;
	const measuredWidth = Math.max(0, ...lines.map(line => line.width)), height = Math.max(size, lines.length * lineHeight);
	const contentWidth = standalone ? Math.max(16, width ? wrapped.wrapWidth : 0, measuredWidth) : Math.max(size / 2, measuredWidth);
	if (contentWidth > 65536 || height > 65536) textLimit();
	let x, y, rotation = 0, origin, labelRange = [0, 1], fraction = shape.labelPos ?? .5;
	if (standalone) {
		x = g.cx - contentWidth / 2;
		y = g.cy - height / 2;
		rotation = g.rot || 0;
		origin = { x: g.cx, y: g.cy };
	} else if (path) {
		const insets = context.insets || {}, start = endClearance(path.points, contentWidth, height, insets.start || 0), end = endClearance(path.points.slice().reverse(), contentWidth, height, insets.end || 0);
		labelRange = path.total ? [start / path.total, 1 - end / path.total] : [.5, .5];
		if (labelRange[0] > labelRange[1]) labelRange = [.5, .5];
		fraction = clamp(fraction, ...labelRange);
		const point = along(path, fraction);
		x = point[0] - contentWidth / 2;
		y = point[1] - height / 2;
		origin = { x: point[0], y: point[1] };
	} else if (inside) {
		x = frame.cx - frame.w / 2 + insetLeft + (frame.w - insetLeft - insetRight - contentWidth) * alignFactor;
		const vertical = shape.labelVAlign || 'middle';
		y = frame.cy - frame.h / 2 + insetTop + (frame.h - insetTop - insetBottom - height) * (vertical === 'top' ? 0 : vertical === 'bottom' ? 1 : .5);
		rotation = frame.rot || 0;
		origin = { x: frame.cx, y: frame.cy };
	} else {
		const anchor = context.anchor || { x: supplied.maxX + 6, y: supplied.minY - 6, anchor: 'start' };
		x = anchor.x - contentWidth * (anchor.anchor === 'end' ? 1 : anchor.anchor === 'middle' ? .5 : 0);
		y = anchor.y - (anchor.middle ? height / 2 : height);
		origin = { x: x + contentWidth / 2, y: y + height / 2 };
	}
	if (![x, y, rotation, origin.x, origin.y].every(number)) textLimit();
	const rect = box(x, y, contentWidth, height), transformed = rotatedBox(rect, origin, rotation);
	const painted = box(x - padLeft, y - padTop, contentWidth + padLeft + padRight, height + padTop + padBottom), bounds = rotatedBox(painted, origin, rotation).bounds;
	if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(n => number(n) && Math.abs(n) <= 65536) || bounds.w > 65536 || bounds.h > 65536) textLimit();
	let markup = '';
	const color = context.color || '#121212';
	const features = (shape.textKern === false ? 'font-kerning:none;' : '') + (shape.textFigures ? 'font-variant-numeric:' + { oldstyle: 'oldstyle-nums', lining: 'lining-nums', tabular: 'tabular-nums' }[shape.textFigures] + ';' : '');
	const cutout = arrow && text ? box(painted.minX - 4, painted.minY - 3, painted.w + 8, painted.h + 6) : null;
	if (cutout && context.background) markup += '<rect x="' + fmt(cutout.minX) + '" y="' + fmt(cutout.minY) + '" width="' + fmt(cutout.w) + '" height="' + fmt(cutout.h) + '" rx="2" fill="' + escape(context.background) + '"/>';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		line.x = x + (contentWidth - line.width) * alignFactor;
		line.y = y + baseline + i * lineHeight;
		// Per-cluster caret x offsets (relative to line.x), in the same units measure() produced
		// line.width in -- the exact same sums the SVG's own textLength/lengthAdjust squeeze targets.
		// Built from the still-raw line text (real tabs/zwsp) before display() below folds those away,
		// so a caret offset stays a plain index into the shape's own label string -- the same space a
		// textarea's selectionStart already lives in. Consumed by the label editor to size, align and
		// caret-place its overlay; never used by the markup below.
		const carets = [{ offset: line.start, x: 0 }];
		let cx = 0;
		for (const unit of clusters(line.text)) { cx += measure(unit.text); carets.push({ offset: line.start + unit.end, x: cx }); }
		line.carets = carets;
		line.text = display(line.text);
		if (!line.text) continue;
		if (lettered) markup += letterLine(line, letters, size, tracking, words, family, color);
		else markup += '<text x="' + fmt(line.x) + '" y="' + fmt(line.y) + '" font-family="' + escape(family) + '" font-size="' + fmt(size) + '" fill="' + escape(color) + '" xml:space="preserve"' +
			(shape.textBold ? ' font-weight="700"' : '') + (shape.textItalic ? ' font-style="italic"' : '') +
			(tracking ? ' letter-spacing="' + fmt(tracking) + 'em"' : '') + (words ? ' word-spacing="' + fmt(words) + 'em"' : '') +
			(textCase === 'small' ? ' font-variant="small-caps"' : '') + (features ? ' style="' + features + '"' : '') +
			(line.width > 0 ? ' textLength="' + fmt(line.width) + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + escape(line.text) + '</text>';
		if (shape.textUnderline && line.width > 0) markup += '<path d="M' + fmt(line.x) + ' ' + fmt(line.y + size * .12) + 'h' + fmt(line.width) + '" stroke="' + escape(color) + '" stroke-width="' + fmt(Math.max(.6, size * .055)) + '"/>';
	}
	if (step) {
		// The figures share the words' left edge (or their centre, in a round or pointed box); their top sits where the
		// words' own top inset would have begun, so a number and its words keep the box's one padding.
		const top = frame.cy - frame.h / 2 + room + padTop, figures = String(step).padStart(2, '0'), wide = figures.length * stepSize * .6;
		const at = align === 'start' ? x : align === 'end' ? x + contentWidth - wide : x + (contentWidth - wide) / 2;
		markup = '<path d="' + monoFigures(figures, at, top + stepSize * .71, stepSize) + '" fill="' + escape(context.stepColor || color) + '"/>' + markup;
	}
	if (standalone && shape.textEffect === 'pressed' && markup) markup = pressed(shape, size, painted) + markup + '</g>';
	if (rotation && markup) markup = '<g transform="rotate(' + fmt(rotation * 180 / Math.PI) + ' ' + fmt(origin.x) + ' ' + fmt(origin.y) + ')">' + markup + '</g>';
	return { markup, bounds, box: rect, polygon: transformed.polygon, center: { x: x + contentWidth / 2, y: y + height / 2 }, origin, rotation, width: contentWidth, height, wrapWidth: wrapped.wrapWidth, measuredWidth, measuredHeight: height,
		requiredWidth: text ? wrapped.longest + insetLeft + insetRight : 0, requiredHeight: text || step ? height + insetTop + insetBottom : 0, lines, lineHeight, fontFamily: family, fontSize: size, cutout, labelRange, labelPos: fraction,
		// `baseline` and `align` are additive for the label editor's overlay math (line top = line.y -
		// baseline; `align` is the already-resolved 'start'|'middle'|'end' the markup above used) -- the
		// SVG markup itself only ever needed `baseline` as a local variable and alignFactor inline.
		baseline, align, ...(step ? {stepBlock} : {}) };
}

export { DRAW_TEXT_MAX, admitText, layoutText, restoreLetters };
