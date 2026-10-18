// SPDX-License-Identifier: AGPL-3.0-only
import {FONT_FILE_BYTES, FONT_BATCH_BYTES, unpackFonts, packWoff, packWoff2} from './font-format.mjs';
import {fontCharacterMap, subsetSfnt} from './font-subset.mjs';
import {zipEntries} from '../notes/zip-reader.mjs';
export const FONT_LIMITS = Object.freeze({bytes: FONT_FILE_BYTES, total: FONT_BATCH_BYTES, count: 1024});
const FONT_ID = /^f[0-9a-f]{24}$/;
const parsed = new WeakMap();
const webAssets = new WeakMap();
const families = {sans: 'system-ui,sans-serif', serif: 'Georgia,serif', mono: 'ui-monospace,monospace'};
function fail(message, code = 'drawing_font_invalid') { throw Object.assign(new Error(message), {code}); }
function bytesOf(value) {
	const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
	if (!bytes || bytes.length < 12) fail('Choose a valid TrueType or OpenType font.');
	if (bytes.length > FONT_LIMITS.bytes) fail('Choose a font smaller than 32 MiB.', 'drawing_font_limit');
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
function sameBytes(a, b) {
	if (a.length !== b.length) return false;
	for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
	return true;
}
function inspect(bytes, {print = false} = {}) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = bytes.length;
	const u16 = at => view.getUint16(at), s16 = at => view.getInt16(at), u32 = at => view.getUint32(at);
	const flavor = u32(0), format = flavor === 0x00010000 ? 'ttf' : flavor === 0x4f54544f ? 'otf' : null;
	if (!format) fail('The font must be decoded before it is admitted.');
	const count = u16(4), directoryEnd = 12 + count * 16, tables = new Map(), spans = [];
	if (!count || count > 256 || directoryEnd > n) fail('The font table directory is invalid.');
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
	const head = table('head', 54).at, hhea = table('hhea', 36).at, maxp = table('maxp', 6).at, os = table('OS/2', 78);
	if (u32(head) !== 0x00010000 || u32(head + 12) !== 0x5f0f3cf5 || u32(hhea) !== 0x00010000) fail('The font metrics are invalid.');
	const version = u16(os.at), fsType = u16(os.at + 8), permission = fsType & 15;
	if (version > 5 || os.length < [78, 86, 96, 96, 96, 100][version]) fail('The font embedding permissions are invalid.');
	const editable = version < 3 ? !permission || !(permission & 1) && !!(permission & 8) : permission === 0 || permission === 8;
	const printable = version < 3 ? !permission || !!(permission & 12) : [0, 4, 8].includes(permission);
	if (!(print ? printable : editable) || version >= 2 && (fsType & 0x200)) fail('This font does not permit embedding in ' + (print ? 'a printed' : 'an editable') + ' document.', 'drawing_font_permission');
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
	const cmap = table('cmap', 4), mapping = fontCharacterMap(bytes.subarray(cmap.at, cmap.at + cmap.length), glyphs);
	const nameTable = table('name', 6), nameCount = u16(nameTable.at + 2), strings = u16(nameTable.at + 4);
	if (u16(nameTable.at) > 1 || nameCount > 4096 || 6 + nameCount * 12 > nameTable.length || strings < 6 + nameCount * 12 || strings > nameTable.length) fail('The font name table is invalid.');
	const names = new Map();
	for (let i = 0; i < nameCount; i++) {
		const row = nameTable.at + 6 + i * 12, platform = u16(row), language = u16(row + 4), type = u16(row + 6), length = u16(row + 8), offset = u16(row + 10);
		if (offset + length > nameTable.length - strings) fail('The font name table is invalid.');
		const score = (language === 0x409 ? 20 : language === 0 ? 10 : 0) + (platform === 3 ? 3 : platform === 0 ? 2 : 0);
		if (score <= (names.get(type)?.score ?? -1) || length > 2048 || ![0, 1, 3].includes(platform) || platform !== 1 && length % 2) continue;
		let text = '';
		if (platform === 1) { try { text = new TextDecoder('macintosh').decode(bytes.subarray(nameTable.at + strings + offset, nameTable.at + strings + offset + length)); } catch (_) { continue; } }
		else for (let k = 0; k < length; k += 2) text += String.fromCharCode(u16(nameTable.at + strings + offset + k));
		text = text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/g, '').trim().slice(0, 96).replace(/[\ud800-\udfff]/gu, '');
		if (text) names.set(type, {text, score});
	}
	const family = names.get(16)?.text || names.get(1)?.text, subfamily = names.get(17)?.text || names.get(2)?.text || 'Regular';
	if (!family) fail('The font has no readable family name.');
	const name = names.get(4)?.text || (family + (subfamily === 'Regular' ? '' : ' ' + subfamily));
	const axes = [], variations = tables.get('fvar');
	if (variations) {
		const at = variations.at;
		if (variations.length < 16 || u32(at) !== 0x00010000) fail('The variable font axis header is invalid.');
		const start = u16(at + 4), count = u16(at + 8), size = u16(at + 10), instances = u16(at + 12), instanceSize = u16(at + 14);
		if (start < 16 || size < 20 || !count || count > 256 || start + count * size + instances * instanceSize > variations.length || instanceSize < 4 + count * 4) fail('The variable font axes are invalid.');
		for (let i = 0; i < count; i++) {
			const row = at + start + i * size, tag = String.fromCharCode(...bytes.subarray(row, row + 4)), min = view.getInt32(row + 4) / 65536, value = view.getInt32(row + 8) / 65536, max = view.getInt32(row + 12) / 65536;
			if (!/^[ -~]{4}$/.test(tag) || axes.some(axis => axis.tag === tag) || min > value || value > max) fail('The variable font axis range is invalid.');
			axes.push(Object.freeze({tag, min, default: value, max, name: names.get(u16(row + 18))?.text || tag}));
		}
	}
	const weightAxis = axes.find(axis => axis.tag === 'wght'), widthAxis = axes.find(axis => axis.tag === 'wdth'), slantAxis = axes.find(axis => axis.tag === 'slnt'), italicAxis = axes.find(axis => axis.tag === 'ital');
	const selection = u16(os.at + 62), weight = weightAxis?.default ?? u16(os.at + 4), stretch = widthAxis?.default ?? [100, 50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200][u16(os.at + 6)];
	if (weight < 1 || weight > 1000 || !Number.isFinite(stretch) || stretch <= 0) fail('The font weight or width is invalid.');
	const style = selection & 512 || slantAxis?.default ? 'oblique' : selection & 1 || italicAxis?.default || u16(head + 44) & 2 ? 'italic' : 'normal';
	const minX = s16(head + 36), minY = s16(head + 38), maxX = s16(head + 40), maxY = s16(head + 42);
	if (minX > maxX || minY > maxY) fail('The font bounds are invalid.');
	const features = new Set(), gsub = tables.get('GSUB');
	if (gsub && gsub.length >= 10) {
		const list = gsub.at + u16(gsub.at + 6), count = list + 2 <= gsub.at + gsub.length ? u16(list) : 0;
		for (let i = 0; i < count && list + 2 + i * 6 + 6 <= gsub.at + gsub.length; i++) {
			const tag = String.fromCharCode(...bytes.subarray(list + 2 + i * 6, list + 6 + i * 6));
			if (tag === 'onum' || tag === 'lnum' || tag === 'tnum') features.add(tag);
		}
	}
	return {view, format, name, postscriptName: names.get(6)?.text, family, subfamily, style, weight, stretch, axes: Object.freeze(axes), weightRange: Object.freeze(weightAxis ? [weightAxis.min, weightAxis.max] : [weight, weight]), embedding: Object.freeze({fsType, subset: !(fsType & 256)}), units, glyphs, horizontal, hmtx, mapping, features, metrics: Object.freeze({
		ascent: Math.max(0, s16(hhea + 4)) / units, descent: Math.max(0, -s16(hhea + 6)) / units,
		lineGap: Math.max(0, s16(hhea + 8)) / units, ink: Object.freeze({minX: minX / units, minY: -maxY / units, maxX: maxX / units, maxY: -minY / units})
	})};
}
function record(bytes, data, subset) {
	const info = inspect(bytes), {name, family, subfamily, style, weight, stretch, axes, weightRange, embedding, format} = info;
	const font = Object.freeze({id: identity(bytes), name, family, subfamily, style, weight, stretch, axes, weightRange, embedding, format,
		get data() { return data ??= encode(bytes); }, ...(subset ? {subset: Object.freeze(subset)} : {})});
	info.bytes = bytes; info.font = font;
	parsed.set(font, info);
	return font;
}
export function importFont(value) { return record(new Uint8Array(bytesOf(value))); }
export async function importFonts(files) {
	const fonts = [], refused = [], seen = new Map(); let total = 0, inputs = 0;
	const add = async (name, bytes) => {
		try {
			for (const face of await unpackFonts(bytes)) {
				const font = record(face), prior = seen.get(font.id);
				if (prior) { if (!sameBytes(parsed.get(prior).bytes, face)) fail('Two fonts have conflicting identities.'); continue; }
				if (fonts.length >= FONT_LIMITS.count || total + face.length > FONT_LIMITS.total) fail('These fonts exceed the 128 MiB intake limit.', 'drawing_font_limit');
				if (typeof FontFace === 'function') { try { await new FontFace('rapier-' + font.id, face).load(); } catch (_) { fail('The browser rejected this font’s outlines or tables.'); } }
				total += face.length; seen.set(font.id, font); fonts.push(font);
			}
		} catch (error) { refused.push({name, reason: error.message || 'The font could not be read.'}); }
	};
	for (const file of Array.from(files || [])) {
		const name = String(file?.name || 'Font');
		try {
			if (++inputs > FONT_LIMITS.count) fail('Add at most 1024 files at once.', 'drawing_font_limit');
			if (Number.isFinite(file?.size) && file.size > FONT_BATCH_BYTES) fail('Choose a font or archive below 128 MiB.', 'drawing_font_limit');
			const value = typeof file?.bytes === 'function' ? await file.bytes() : file?.bytes ?? (typeof file?.arrayBuffer === 'function' ? await file.arrayBuffer() : file),
				bytes = value instanceof Uint8Array ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
			if (!bytes || bytes.length > FONT_BATCH_BYTES) fail('Choose a font or archive below 128 MiB.', 'drawing_font_limit');
			const signature = bytes.length >= 4 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) : 0;
			if (signature === 0x504b0304 || signature === 0x504b0506) {
				let found = false;
				for await (const entry of zipEntries(bytes, {maxBytes: FONT_BATCH_BYTES, maxEntries: 4096, maxEntryBytes: FONT_BATCH_BYTES})) {
					if (entry.name.endsWith('/') || !/\.(ttf|otf|woff2?|ttc|otc)$/i.test(entry.name) || /(^|\/)__MACOSX\/|(^|\/)\._/.test(entry.name)) continue;
					found = true;
					try { if (entry.oversize) fail('This font exceeds the archive member limit.', 'drawing_font_limit'); await add(name + '/' + entry.name, await entry.read()); }
					catch (error) { refused.push({name: name + '/' + entry.name, reason: error.message || 'The font could not be read.'}); }
				}
				if (!found) fail('The archive contains no TTF, OTF, WOFF, WOFF2 or collection files.');
			} else await add(name, bytes);
		} catch (error) { refused.push({name, reason: error.message || 'The file could not be read.'}); }
	}
	return {fonts, refused};
}
export function fontBytes(font) {
	return parsed.get(checked(font)).bytes.slice();
}
export async function printFont(value, text, face = {}) {
	const faces = await unpackFonts(value);
	for (const bytes of faces) {
		const info = inspect(bytes, {print: true});
		if (faces.length > 1 && !(face.postscriptName && info.postscriptName === face.postscriptName || face.fullName && info.name === face.fullName)) continue;
		const subset = subsetSfnt(bytes, String(text));
		return {bytes: subset.bytes, axes: info.axes, style: info.style, postscriptName: info.postscriptName, subset: subset.stats.subset};
	}
	fail('The print font must identify one face.');
}
export async function subsetFont(font, text) {
	font = checked(font); const result = subsetSfnt(parsed.get(font).bytes, String(text ?? ''));
	return record(result.bytes, null, result.stats);
}
function encodedAsset(format, bytes, original) {
	let data;
	return Object.freeze({format, bytes, get data() { return data ??= original ? original.data : encode(bytes); },
		get url() { return 'data:font/' + format + ';base64,' + this.data; }});
}
export async function fontAsset(font, {original = false} = {}) {
	font = checked(font);
	let entry = webAssets.get(font);
	if (!entry) {
		entry = {packed: (async () => {
			const source = parsed.get(font).bytes; let best = {format: font.format, bytes: source};
			for (const [format, pack] of [['woff2', packWoff2], ['woff', packWoff]]) {
				try { const bytes = await pack(source); if (bytes.length < best.bytes.length) best = {format, bytes}; }
				catch (error) { if (error.code !== 'font_compression_unavailable') throw error; }
			}
			return encodedAsset(best.format, best.bytes, best.bytes === source ? font : null);
		})()};
		webAssets.set(font, entry);
		entry.packed.catch(() => { if (webAssets.get(font) === entry) webAssets.delete(font); });
	}
	if (original && !entry.original) {
		entry.original = entry.packed.then(async asset => {
			const source = parsed.get(font).bytes;
			if (asset.bytes === source) return asset;
			const restored = await unpackFonts(asset.bytes);
			return restored.length === 1 && sameBytes(restored[0], source) ? asset : encodedAsset(font.format, source, font);
		});
		const pending = entry.original;
		pending.catch(() => { if (entry.original === pending) delete entry.original; });
	}
	const asset = await (original ? entry.original : entry.packed);
	let bytes;
	return {format: asset.format, data: asset.data, url: asset.url, get bytes() { return bytes ??= asset.bytes.slice(); }};
}
function checked(raw) {
	if (!raw || typeof raw !== 'object' || !FONT_ID.test(raw.id)) fail('The drawing contains an invalid font.');
	const prior = parsed.get(raw);
	if (prior?.font === raw) return raw;
	const {id, format, data} = raw;
	if (prior && prior.font.id === id && prior.font.format === format && prior.font.data === data) return prior.font;
	parsed.delete(raw);
	const font = record(decode(data), data);
	if (font.id !== id || font.format !== format) fail('The drawing font does not match its resource.');
	parsed.set(raw, parsed.get(font));
	return font;
}

export function fontSession() {
	const imported = new Map(), subsets = new Map();
	let retained = 0;
	function memo(cache, key, create, textBytes = 0) {
		let pending = cache.get(key);
		if (!pending) {
			pending = Promise.resolve().then(create); cache.set(key, pending);
			pending.then(font => {
				retained += parsed.get(font).bytes.length + textBytes;
				if (retained > FONT_LIMITS.total) { imported.clear(); subsets.clear(); retained = 0; }
			}, () => { if (cache.get(key) === pending) cache.delete(key); });
		}
		return pending;
	}
	return Object.freeze({
		read({url}) {
			return memo(imported, url, async () => {
				const match = typeof url === 'string' && /^data:font\/(woff2?|ttf|otf);base64,([a-z\d+/]+={0,2})$/i.exec(url);
				if (!match || match[2].length > Math.ceil(FONT_BATCH_BYTES / 3) * 4) fail('The document does not carry valid font bytes.');
				const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
				const result = await importFonts([{name: 'embedded.' + match[1], bytes}]);
				if (result.refused.length || result.fonts.length !== 1) fail(result.refused[0]?.reason || 'An embedded asset must contain one font.');
				return result.fonts[0];
			}, typeof url === 'string' ? url.length * 2 : 0);
		},
		subset(font, text) {
			font = checked(font); text = String(text ?? '');
			if (!subsets.has(font)) subsets.set(font, new Map());
			return memo(subsets.get(font), text, () => subsetFont(font, text), text.length * 2);
		},
	});
}
export function admitFonts(input, usedIds) {
	const wanted = usedIds == null ? null : new Set(usedIds);
	if (input == null) { if (wanted?.size) fail('The drawing is missing a font.'); return []; }
	if (!Array.isArray(input) || input.length > FONT_LIMITS.count) fail('Use at most 1024 custom fonts in one document.', 'drawing_font_limit');
	const out = [], ids = new Map();
	let total = 0;
	for (const raw of input) {
		if (!raw || !FONT_ID.test(raw.id)) fail('The drawing contains an invalid font.');
		if (wanted && !wanted.has(raw.id)) continue;
		const font = checked(raw), prior = ids.get(font.id);
		if (prior) { if (!sameBytes(parsed.get(prior).bytes, parsed.get(font).bytes)) fail('Two drawing fonts have conflicting identities.'); continue; }
		total += parsed.get(font).bytes.length;
		if (total > FONT_LIMITS.total) fail('Keep custom fonts below 128 MiB per document.', 'drawing_font_limit');
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
export function fontMetadata(fonts) { return (fonts || []).map(raw => { const {id, name, family, subfamily, style, weight, stretch, axes, weightRange, embedding, format} = checked(raw); return {id, name, family, subfamily, style, weight, stretch, axes, weightRange, embedding, format}; }); }
function fontRule(font) { return '@font-face{font-family:' + fontFaceFamily(font) + ';src:url(' + fontDataURL(font) + ')}'; }
function fontResource(css) {
	if (typeof css !== 'string' || css.length > Math.ceil(FONT_LIMITS.bytes / 3) * 4 + 4096) return null;
	const open = /^[ \t\r\n\f]*@font-face[ \t\r\n\f]*\{/i.exec(css);
	if (!open) return null;
	const fields = new Map();
	let at = open[0].length;
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
export function fontFigures(id, fonts) {
	const tags = infoFor(id, fonts)?.features;
	return tags ? [['onum', 'oldstyle'], ['lnum', 'lining'], ['tnum', 'tabular']].filter(([tag]) => tags.has(tag)).map(row => row[1]) : [];
}
export function fontAdvance(text, id, fonts) {
	const info = infoFor(id, fonts);
	if (!info) return null;
	let width = 0;
	for (const character of text) {
		if (/\p{Default_Ignorable_Code_Point}/u.test(character)) continue;
		const glyph = info.mapping.glyph(character.codePointAt(0));
		width += info.view.getUint16(info.hmtx + Math.min(glyph, info.horizontal - 1) * 4);
	}
	return width / info.units;
}
