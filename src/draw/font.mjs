// SPDX-License-Identifier: AGPL-3.0-only
export const FONT_LIMITS = Object.freeze({bytes: 2097152, total: 4194304, count: 4});
const FONT_ID = /^f[0-9a-f]{24}$/;
const parsed = new WeakMap();
const families = {sans: 'system-ui,sans-serif', serif: 'Georgia,serif', mono: 'ui-monospace,monospace'};
function fail(message, code = 'drawing_font_invalid') { throw Object.assign(new Error(message), {code}); }
function bytesOf(value) {
	const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
	if (!bytes || bytes.length < 12) fail('Choose a valid TrueType or OpenType font.');
	if (bytes.length > FONT_LIMITS.bytes) fail('Choose a font smaller than 2 MiB.', 'drawing_font_limit');
	return bytes;
}
function encode(bytes) {
	let text = '';
	for (let at = 0; at < bytes.length; at += 16384) text += String.fromCharCode(...bytes.subarray(at, at + 16384));
	return btoa(text);
}
function decode(data) {
	if (typeof data !== 'string' || data.length < 16 || data.length > Math.ceil(FONT_LIMITS.bytes / 3) * 4 || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) fail('The drawing contains an invalid font.');
	let raw;
	try { raw = atob(data); } catch (_) { fail('The drawing contains an invalid font.'); }
	const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
	bytesOf(bytes);
	if (encode(bytes) !== data) fail('The drawing contains a noncanonical font.');
	return bytes;
}
function identity(bytes) {
	let a = 2166136261, b = 2246822519;
	for (const byte of bytes) { a = Math.imul(a ^ byte, 16777619); b = Math.imul(b ^ byte, 3266489917); }
	return 'f' + [bytes.length, a >>> 0, b >>> 0].map(value => value.toString(16).padStart(8, '0')).join('');
}
function inspect(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = bytes.length;
	const u16 = at => view.getUint16(at), s16 = at => view.getInt16(at), u32 = at => view.getUint32(at);
	const flavor = u32(0), format = flavor === 0x00010000 ? 'ttf' : flavor === 0x4f54544f ? 'otf' : null;
	if (!format) fail('Choose a .ttf or .otf font file. Font collections and webfont containers are not supported.');
	const count = u16(4), directoryEnd = 12 + count * 16, tables = new Map(), spans = [];
	if (!count || count > 128 || directoryEnd > n) fail('The font table directory is invalid.');
	for (let i = 0; i < count; i++) {
		const row = 12 + i * 16, tag = String.fromCharCode(...bytes.subarray(row, row + 4));
		const at = u32(row + 8), length = u32(row + 12);
		if (!/^[ -~]{4}$/.test(tag) || tables.has(tag) || at < directoryEnd || at % 4 || at > n || length > n - at) fail('The font table directory is invalid.');
		tables.set(tag, {at, length});
		if (length) spans.push([at, at + length]);
	}
	spans.sort((a, b) => a[0] - b[0]);
	for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) fail('The font contains overlapping tables.');
	const table = (tag, min) => {
		const row = tables.get(tag);
		if (!row || row.length < min) fail('The font is missing a valid ' + tag.trim() + ' table.');
		return row;
	};
	if (tables.has('SVG ')) fail('Choose a font without embedded SVG glyphs.');
	const head = table('head', 54).at, hhea = table('hhea', 36).at, maxp = table('maxp', 6).at, os = table('OS/2', 78);
	if (u32(head) !== 0x00010000 || u32(head + 12) !== 0x5f0f3cf5 || u32(hhea) !== 0x00010000) fail('The font metrics are invalid.');
	const version = u16(os.at), fsType = u16(os.at + 8), permission = fsType & 15;
	if (version > 5 || os.length < [78, 86, 96, 96, 96, 100][version]) fail('The font embedding permissions are invalid.');
	const editable = version < 3 ? !permission || !(permission & 1) && !!(permission & 8) : permission === 0 || permission === 8;
	if (!editable || version >= 2 && (fsType & 0x200)) fail('This font does not permit embedding in an editable drawing.', 'drawing_font_permission');
	const units = u16(head + 18), glyphs = u16(maxp + 4), horizontal = u16(hhea + 34), hmtx = table('hmtx', 4).at;
	if (units < 16 || units > 16384 || !glyphs || !horizontal || horizontal > glyphs || table('hmtx', horizontal * 4 + (glyphs - horizontal) * 2).length < 4) fail('The font metrics are invalid.');
	if (format === 'ttf') {
		if (u32(maxp) !== 0x00010000 || table('maxp', 32).length < 32) fail('The font glyph directory is invalid.');
		const locaFormat = s16(head + 50), glyf = table('glyf', 0), loca = table('loca', (glyphs + 1) * (locaFormat ? 4 : 2));
		if (locaFormat !== 0 && locaFormat !== 1) fail('The font glyph directory is invalid.');
		let prior = 0;
		for (let i = 0; i <= glyphs; i++) {
			const offset = locaFormat ? u32(loca.at + i * 4) : u16(loca.at + i * 2) * 2;
			if (offset < prior || offset > glyf.length) fail('The font glyph directory is invalid.');
			prior = offset;
		}
	} else {
		const modern = tables.has('CFF2'), cff = table(modern ? 'CFF2' : 'CFF ', modern ? 5 : 4);
		const header = bytes[cff.at + 2];
		if (bytes[cff.at] !== (modern ? 2 : 1) || bytes[cff.at + 1] || header < (modern ? 5 : 4) || header > cff.length || (modern ? u16(cff.at + 3) > cff.length - header : bytes[cff.at + 3] < 1 || bytes[cff.at + 3] > 4)) fail('The OpenType outline header is invalid.');
	}
	const cmap = table('cmap', 4), cmapCount = u16(cmap.at + 2);
	if (u16(cmap.at) !== 0 || !cmapCount || cmapCount > 256 || 4 + cmapCount * 8 > cmap.length) fail('The font character map is invalid.');
	let mapping = null, priority = -1;
	for (let i = 0; i < cmapCount; i++) {
		const row = cmap.at + 4 + i * 8, platform = u16(row), encoding = u16(row + 2), offset = u32(row + 4);
		if (offset > cmap.length - 2) fail('The font character map is invalid.');
		if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
		const at = cmap.at + offset, kind = u16(at), score = kind === 12 ? 2 : kind === 4 ? 1 : 0;
		if (!score || score <= priority) continue;
		if (kind === 12) {
			if (offset > cmap.length - 16) fail('The font character map is invalid.');
			const length = u32(at + 4), groups = u32(at + 12);
			if (u16(at + 2) || length < 16 || length > cmap.length - offset || !groups || groups > 65536 || groups * 12 > length - 16) fail('The font character map is invalid.');
			let end = -1;
			for (let g = 0; g < groups; g++) {
				const start = u32(at + 16 + g * 12), stop = u32(at + 20 + g * 12), first = u32(at + 24 + g * 12);
				if (start <= end || stop < start || stop > 0x10ffff || first + stop - start >= glyphs) fail('The font character map is invalid.');
				end = stop;
			}
			mapping = {kind, at, count: groups};
		} else {
			if (offset > cmap.length - 16) fail('The font character map is invalid.');
			const length = u16(at + 2), segments = u16(at + 6) / 2;
			if (!Number.isInteger(segments) || !segments || segments > 8192 || length < 16 + segments * 8 || length > cmap.length - offset) fail('The font character map is invalid.');
			const ends = at + 14, starts = ends + 2 + segments * 2, deltas = starts + segments * 2, offsets = deltas + segments * 2;
			let end = -1;
			for (let s = 0; s < segments; s++) {
				const start = u16(starts + s * 2), stop = u16(ends + s * 2), range = u16(offsets + s * 2);
				if (start <= end || stop < start || range % 2 || range && (offsets + s * 2 + range < offsets + segments * 2 || offsets + s * 2 + range + (stop - start) * 2 + 2 > at + length)) fail('The font character map is invalid.');
				end = stop;
			}
			if (end !== 65535) fail('The font character map is invalid.');
			mapping = {kind, at, count: segments, ends, starts, deltas, offsets};
		}
		priority = score;
	}
	if (!mapping) fail('Choose a font with a Unicode character map.');
	const nameTable = table('name', 6), nameCount = u16(nameTable.at + 2), strings = u16(nameTable.at + 4);
	if (u16(nameTable.at) > 1 || nameCount > 4096 || 6 + nameCount * 12 > nameTable.length || strings < 6 + nameCount * 12 || strings > nameTable.length) fail('The font name table is invalid.');
	let name = 'Custom font', nameScore = -1;
	for (let i = 0; i < nameCount; i++) {
		const row = nameTable.at + 6 + i * 12, platform = u16(row), language = u16(row + 4), type = u16(row + 6), length = u16(row + 8), offset = u16(row + 10);
		if (offset + length > nameTable.length - strings) fail('The font name table is invalid.');
		const score = (type === 4 ? 4 : type === 16 ? 2 : type === 1 ? 0 : -20) + (language === 0x409 ? 2 : language === 0 ? 1 : 0);
		if (score <= nameScore || length > 1024 || platform !== 0 && platform !== 3 || length % 2) continue;
		let text = '';
		for (let k = 0; k < length; k += 2) text += String.fromCharCode(u16(nameTable.at + strings + offset + k));
		text = text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/g, '').trim().slice(0, 96).replace(/[\ud800-\udfff]/gu, '');
		if (text) { name = text; nameScore = score; }
	}
	const minX = s16(head + 36), minY = s16(head + 38), maxX = s16(head + 40), maxY = s16(head + 42);
	if (minX > maxX || minY > maxY) fail('The font bounds are invalid.');
	// The figure styles the font carries, read from its substitution features; a missing or
	// malformed table only means the font offers none (never a refusal: the font draws either way).
	const features = new Set(), gsub = tables.get('GSUB');
	if (gsub && gsub.length >= 10) {
		const list = gsub.at + u16(gsub.at + 6), count = list + 2 <= gsub.at + gsub.length ? u16(list) : 0;
		for (let i = 0; i < count && list + 2 + i * 6 + 6 <= gsub.at + gsub.length; i++) {
			const tag = String.fromCharCode(...bytes.subarray(list + 2 + i * 6, list + 6 + i * 6));
			if (tag === 'onum' || tag === 'lnum' || tag === 'tnum') features.add(tag);
		}
	}
	return {view, format, name, units, glyphs, horizontal, hmtx, mapping, features, metrics: Object.freeze({
		ascent: Math.max(0, s16(hhea + 4)) / units, descent: Math.max(0, -s16(hhea + 6)) / units,
		lineGap: Math.max(0, s16(hhea + 8)) / units, ink: Object.freeze({minX: minX / units, minY: -maxY / units, maxX: maxX / units, maxY: -minY / units})
	})};
}
function record(bytes, data) {
	const info = inspect(bytes), font = Object.freeze({id: identity(bytes), name: info.name, format: info.format, data: data || encode(bytes)});
	parsed.set(font, info);
	return font;
}
export function importFont(value) { return record(bytesOf(value).slice()); }
function checked(raw) {
	if (!raw || typeof raw !== 'object' || !FONT_ID.test(raw.id)) fail('The drawing contains an invalid font.');
	if (parsed.has(raw)) return raw;
	const font = record(decode(raw.data), raw.data);
	if (font.id !== raw.id || font.format !== raw.format) fail('The drawing font does not match its resource.');
	return font;
}
export function admitFonts(input, usedIds) {
	const wanted = usedIds == null ? null : new Set(usedIds);
	if (input == null) { if (wanted?.size) fail('The drawing is missing a font.'); return []; }
	if (!Array.isArray(input) || input.length > FONT_LIMITS.count) fail('Use at most four custom fonts in one drawing.', 'drawing_font_limit');
	const out = [], ids = new Map();
	let total = 0;
	for (const raw of input) {
		if (!raw || !FONT_ID.test(raw.id)) fail('The drawing contains an invalid font.');
		if (wanted && !wanted.has(raw.id)) continue;
		const font = checked(raw), prior = ids.get(font.id);
		if (prior) { if (prior.data !== font.data) fail('Two drawing fonts have conflicting identities.'); continue; }
		total += Math.floor(font.data.length * 3 / 4) - (font.data.endsWith('==') ? 2 : font.data.endsWith('=') ? 1 : 0);
		if (total > FONT_LIMITS.total) fail('Keep custom fonts below 4 MiB per drawing.', 'drawing_font_limit');
		ids.set(font.id, font); out.push(font);
	}
	if (wanted) for (const id of wanted) if (!ids.has(id)) fail('The drawing is missing a font.');
	return out;
}
export function fontFaceFamily(font) { return 'rapier-' + checked(font).id; }
export function fontFamily(id, fonts) {
	if (Object.hasOwn(families, id)) return families[id];
	const font = fonts?.find(font => font.id === id);
	if (!font && FONT_ID.test(id)) fail('The drawing is missing a font.');
	return font ? fontFaceFamily(font) + ',sans-serif' : families.sans;
}
export function fontDataURL(font) {
	font = checked(font);
	return 'data:font/' + font.format + ';base64,' + font.data;
}
export function fontMetadata(fonts) { return (fonts || []).map(font => ({id: font.id, name: font.name, format: font.format})); }
function fontRule(font) { return '@font-face{font-family:' + fontFaceFamily(font) + ';src:url(' + fontDataURL(font) + ')}'; }
function fontResource(css) {
	if (typeof css !== 'string' || css.length > Math.ceil(FONT_LIMITS.bytes / 3) * 4 + 4096) return null;
	const open = /^[ \t\r\n\f]*@font-face[ \t\r\n\f]*\{/i.exec(css);
	if (!open) return null;
	const fields = new Map();
	let at = open[0].length;
	// Admit the entire two-descriptor rule before trusting any embedded URL.
	for (let i = 0; i < 2; i++) {
		const descriptor = /^[ \t\r\n\f]*(font-family|src)[ \t\r\n\f]*:[ \t\r\n\f]*/i.exec(css.slice(at));
		if (!descriptor || fields.has(descriptor[1].toLowerCase())) return null;
		const key = descriptor[1].toLowerCase();
		at += descriptor[0].length;
		const value = (key === 'font-family' ? /^(["']?)rapier-(f[0-9a-f]{24})\1/i : /^url\([ \t\r\n\f]*(["']?)(data:font\/(ttf|otf);base64,([A-Za-z0-9+/]+={0,2}))\1[ \t\r\n\f]*\)/i).exec(css.slice(at));
		if (!value) return null;
		fields.set(key, value); at += value[0].length;
		const end = /^[ \t\r\n\f]*(?:;|(?=\}))/.exec(css.slice(at));
		if (!end) return null;
		at += end[0].length;
	}
	if (!/^[ \t\r\n\f]*\}[ \t\r\n\f]*$/.test(css.slice(at))) return null;
	const source = fields.get('src'), id = fields.get('font-family')[2].toLowerCase();
	return {font: checked({id, format: source[3].toLowerCase(), data: source[4]}), url: source[2]};
}
export function fontCssURL(css) {
	try { return fontResource(css)?.url || ''; } catch (_) { return ''; }
}
export function fontDefs(fonts) {
	if (!fonts?.length) return '';
	return '<defs>' + fonts.map(font => '<style data-rapier-font="' + font.id + '">' + fontRule(font) + '</style>').join('') + '</defs>';
}
function xmlText(text) {
	return text.replace(/&(?:#(x[0-9a-fA-F]+|\d+)|(amp|lt|gt|quot|apos));/g, (raw, numeric, named) => {
		if (named) return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}[named];
		const value = numeric[0] === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric);
		return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : '\ufffd';
	});
}
function fontStyleId(text) {
	const attributes = new Map(), pattern = /[ \t\r\n]+([A-Za-z_][\w.:-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/y;
	let at = 0;
	while (!/^[ \t\r\n]*\/?$/.test(text.slice(at))) {
		pattern.lastIndex = at;
		const match = pattern.exec(text);
		if (!match || attributes.has(match[1])) fail('The drawing contains an invalid font style.');
		attributes.set(match[1], xmlText(match[2] ?? match[3])); at = pattern.lastIndex;
	}
	const id = attributes.get('data-rapier-font');
	if (id != null && !FONT_ID.test(id)) fail('The drawing contains an invalid font resource.');
	return id;
}
export function restoreFonts(recipe, svg) {
	const required = new Set(Array.isArray(recipe?.shapes) ? recipe.shapes.map(shape => shape?.textFont).filter(id => FONT_ID.test(id)) : []);
	if (recipe?.fonts == null) { if (required.size) fail('The drawing is missing a font.'); return recipe; }
	if (!Array.isArray(recipe.fonts) || recipe.fonts.length > FONT_LIMITS.count) fail('The drawing fonts are invalid.');
	const descriptors = new Map();
	for (const font of recipe.fonts) {
		if (!font || !FONT_ID.test(font.id) || !['ttf', 'otf'].includes(font.format) || font.data != null) fail('The drawing contains an invalid font descriptor.');
		if (descriptors.has(font.id)) fail('The drawing contains duplicate font descriptors.');
		descriptors.set(font.id, font);
	}
	for (const id of required) if (!descriptors.has(id)) fail('The drawing is missing a font.');
	if (!descriptors.size) return recipe;
	if (typeof svg !== 'string' || svg.length > 16 * 1024 * 1024) fail('The drawing fonts are invalid.');
	const resources = new Map(), pattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^>"'\[]|"[^"]*"|'[^']*'|\[[\s\S]*?\])*>|<([A-Za-z_][\w.:-]*)(?=[ \t\r\n/>])((?:"[^"]*"|'[^']*'|[^<>"'])*)>/g;
	for (let match; (match = pattern.exec(svg));) {
		if (match[1]?.split(':').pop() !== 'style') continue;
		const id = fontStyleId(match[2]), close = new RegExp('<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<\\?[\\s\\S]*?\\?>|<\\/' + match[1].replace(/\./g, '\\.') + '[ \\t\\r\\n]*>', 'g');
		if (/\/[ \t\r\n]*$/.test(match[2])) { if (id != null) fail('The drawing is missing its original font resource.'); continue; }
		close.lastIndex = pattern.lastIndex;
		let end;
		while ((end = close.exec(svg)) && !end[0].startsWith('</')) {}
		if (!end) fail('The drawing contains an invalid font style.');
		const text = svg.slice(pattern.lastIndex, end.index);
		pattern.lastIndex = close.lastIndex;
		if (id == null) continue;
		if (resources.size >= FONT_LIMITS.count || resources.has(id)) fail('The drawing contains duplicate font resources.');
		const css = xmlText(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (raw, body) => body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')));
		const resource = fontResource(css);
		if (!resource || resource.font.id !== id) fail('The drawing contains an invalid font resource.');
		resources.set(id, resource.font);
	}
	const fonts = recipe.fonts.map(font => {
		const resource = resources.get(font.id);
		if (!resource) fail('The drawing is missing its original font resource.');
		if (resource.format !== font.format) fail('The drawing font does not match its resource.');
		return resource;
	});
	return {...recipe, fonts: admitFonts(fonts)};
}
function infoFor(id, fonts) {
	const raw = fonts?.find(font => font.id === id);
	if (!raw) { if (FONT_ID.test(id)) fail('The drawing is missing a font.'); return null; }
	const font = checked(raw);
	return parsed.get(font);
}
export function fontMetrics(id, fonts) { return infoFor(id, fonts)?.metrics || null; }
// The figure styles (`oldstyle`, `lining`, `tabular`) an uploaded font carries; a built-in family
// is whatever the reader's system gives it, so it offers none it cannot promise.
export function fontFigures(id, fonts) {
	const tags = infoFor(id, fonts)?.features;
	return tags ? [['onum', 'oldstyle'], ['lnum', 'lining'], ['tnum', 'tabular']].filter(([tag]) => tags.has(tag)).map(row => row[1]) : [];
}
function glyphFor(info, code) {
	const {view, mapping: m} = info;
	let low = 0, high = m.count - 1;
	while (low <= high) {
		const mid = (low + high) >>> 1;
		const start = m.kind === 12 ? view.getUint32(m.at + 16 + mid * 12) : view.getUint16(m.starts + mid * 2);
		const end = m.kind === 12 ? view.getUint32(m.at + 20 + mid * 12) : view.getUint16(m.ends + mid * 2);
		if (code < start) high = mid - 1;
		else if (code > end) low = mid + 1;
		else {
			if (m.kind === 12) return view.getUint32(m.at + 24 + mid * 12) + code - start;
			const delta = view.getInt16(m.deltas + mid * 2), range = view.getUint16(m.offsets + mid * 2);
			const raw = range ? view.getUint16(m.offsets + mid * 2 + range + (code - start) * 2) : code;
			const glyph = !range || raw ? (raw + delta) & 65535 : 0;
			return glyph < info.glyphs ? glyph : 0;
		}
	}
	return 0;
}
export function fontAdvance(text, id, fonts) {
	const info = infoFor(id, fonts);
	if (!info) return null;
	let width = 0;
	for (const character of text) {
		if (/\p{Default_Ignorable_Code_Point}/u.test(character)) continue;
		const glyph = glyphFor(info, character.codePointAt(0));
		width += info.view.getUint16(info.hmtx + Math.min(glyph, info.horizontal - 1) * 4);
	}
	return width / info.units;
}
