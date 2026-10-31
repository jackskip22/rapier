// SPDX-License-Identifier: AGPL-3.0-only
// Preview data admission only. The existing verified-data loader owns all downloads.
const sriPattern = /^sha384-[A-Za-z0-9+/]{64}$/;
const kinds = new Set(['name', 'autonym', 'masthead', 'source-characters']);
const freeze = Object.freeze;
function fail(detail) { throw Object.assign(new TypeError('Invalid font preview: ' + detail), {code: 'font_preview_invalid'}); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label); return value; }
function string(value, label, max = 160) { if (typeof value !== 'string' || !value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(label); return value; }
function integer(value, label, max) { if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(label); return value; }
function finite(value, label, min = -1000, max = 1000) { if (!Number.isFinite(value) || value < min || value > max) fail(label); return value; }
function pin(value) { if (typeof value !== 'string' || !sriPattern.test(value)) fail('SHA-384'); return value; }
function https(value) {
	string(value, 'URL', 2048); let url;
	try { url = new URL(value); } catch (_) { fail('URL'); }
	if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || value.includes('\\')) fail('HTTPS URL');
	return url.href;
}
function sourceFile(raw, prefix, max) {
	object(raw, 'source file'); const url = https(raw.url);
	if (!url.startsWith(prefix)) fail('pinned source URL');
	return freeze({url, bytes: integer(raw.bytes, 'source bytes', max), sri: pin(raw.sri)});
}
function codepoints(value) {
	if (!Array.isArray(value) || value.length > 160 || value.some(cp => !Number.isSafeInteger(cp) || cp < 0 || cp > 0x10ffff || cp >= 0xd800 && cp <= 0xdfff)) fail('codepoints');
	return freeze([...value]);
}
function problem(raw) {
	object(raw, 'unavailable reason');
	if (typeof raw.reason !== 'string' || !/^[a-z][a-z0-9-]{0,95}$/.test(raw.reason)) fail('unavailable reason');
	const out = {reason: raw.reason};
	if (raw.text !== undefined) out.text = string(raw.text, 'unavailable text');
	if (raw.missing !== undefined) out.missing = codepoints(raw.missing);
	if (raw.targetScript !== undefined) out.targetScript = script(raw.targetScript);
	if (raw.script !== undefined) out.script = raw.script === null ? null : script(raw.script);
	if (raw.glyph !== undefined) out.glyph = integer(raw.glyph, 'glyph', 65535);
	if (raw.tables !== undefined) {
		if (!Array.isArray(raw.tables) || raw.tables.length > 256 || raw.tables.some(tag => typeof tag !== 'string' || !/^[ -~]{4}$/.test(tag))) fail('source tables');
		out.tables = freeze([...raw.tables]);
	}
	// Detailed intermediate candidate refusals belong in build receipts, not recursive runtime data.
	return freeze(out);
}
function script(value) { if (typeof value !== 'string' || !/^[A-Z][a-z]{3}$/.test(value)) fail('script'); return value; }
function language(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value) || value.length > 80) fail('language'); return value; }
function selectedFace(family) {
	const options = family.files.flatMap(file => file.variants.map(variant => {
		const base = variant.split('-')[0], weight = base === 'regular' || base === 'italic' ? 400 : Number.parseInt(base, 10);
		return {file, base, weight, italic: base.includes('italic')};
	}));
	const upright = options.filter(option => !option.italic), candidates = upright.length ? upright : options;
	candidates.sort((a, b) => Number(b.base === 'regular') - Number(a.base === 'regular') || Math.abs(a.weight - 400) - Math.abs(b.weight - 400) || b.weight - a.weight);
	if (!candidates.length) fail('selected font');
	return {file: candidates[0].file, italicFallback: !upright.length};
}
export function admitPreviewPath(value) {
	if (typeof value !== 'string' || !value || value.length > 1024 * 1024 || !/^[MLHVQCZ0-9+.,\s-]+$/.test(value)) fail('path data');
	const tokens = value.match(/[MLHVQCZ]|[+-]?(?:\d+\.?\d*|\.\d+)/g) || [];
	if (tokens.join('') !== value.replace(/[\s,]/g, '') || tokens[0] !== 'M') fail('path tokens');
	const arity = {M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, Z: 0};
	let command = null, count = 0;
	const finish = () => { if (command !== null && (arity[command] ? !count || count % arity[command] : count)) fail('path arity'); };
	for (const token of tokens) {
		if (Object.hasOwn(arity, token)) { finish(); command = token; count = 0; }
		else { if (command === null || command === 'Z') fail('path command'); finite(Number(token), 'path coordinate'); count++; }
	}
	finish();
	return value;
}
function specimen(raw, prefix) {
	object(raw, 'specimen'); if (!kinds.has(raw.kind)) fail('specimen kind');
	const out = {kind: raw.kind, text: string(raw.text, 'specimen text', 320), d: admitPreviewPath(raw.d),
		w: finite(raw.w, 'advance', Number.MIN_VALUE), ascent: finite(raw.ascent, 'ascent', -16, 16), descent: finite(raw.descent, 'descent', -16, 16),
		script: script(raw.script), direction: raw.direction, language: language(raw.language)};
	if (!['ltr', 'rtl'].includes(out.direction) || !Array.isArray(raw.bounds) || raw.bounds.length !== 4) fail('direction or bounds');
	out.bounds = freeze(raw.bounds.map(value => finite(value, 'bound')));
	if (out.bounds[0] > out.bounds[2] || out.bounds[1] > out.bounds[3]) fail('bounds');
	if (raw.kind !== 'name') {
		const source = object(raw.sampleSource, 'sample source'), targetScript = script(source.targetScript);
		if (raw.kind === 'source-characters') {
			const values = codepoints(source.codepoints);
			if (JSON.stringify(values) !== JSON.stringify(Array.from(raw.text, c => c.codePointAt(0))) || raw.language !== 'und') fail('source-character custody');
			out.sampleSource = freeze({targetScript, codepoints: values});
		} else {
			if (typeof source.language !== 'string' || !/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(source.language) || source.language.length > 80 ||
				!['autonym', 'sample_text.masthead_full', 'sample_text.masthead_partial'].includes(source.field) ||
				(raw.kind === 'autonym') !== (source.field === 'autonym')) fail('language sample identity');
			const file = sourceFile(source, prefix + 'lang/Lib/gflanguages/data/languages/', 1024 * 1024);
			if (!file.url.endsWith('/' + source.language + '.textproto') || out.language !== source.language.replaceAll('_', '-').toLowerCase()) fail('language sample source');
			out.sampleSource = freeze({...file, field: source.field, language: source.language, targetScript});
		}
	}
	return freeze(out);
}
export function admitFontPreviewManifest(raw, catalog) {
	object(raw, 'manifest'); object(catalog, 'catalog');
	if (raw.schema !== 1 || !Array.isArray(catalog.families) || raw.families !== catalog.families.length || !raw.families || raw.families > 10000) fail('manifest family count');
	const source = object(raw.source, 'source');
	if (source.revision !== catalog.source.revision || source.metadataSri !== catalog.source.metadata.sri || source.coordinates !== 'em-baseline-y-down' || source.precision !== 4 || source.hinting !== false) fail('source identity or coordinates');
	for (const field of ['fontTools', 'harfBuzz', 'uharfbuzz']) if (typeof source[field] !== 'string' || !/^\d+\.\d+\.\d+$/.test(source[field])) fail('tool version');
	if (source.shaperSource !== 'https://pypi.org/project/uharfbuzz/' + source.uharfbuzz + '/' || source.fontToolsSource !== 'https://pypi.org/project/fonttools/' + source.fontTools + '/') fail('tool source');
	if (!Array.isArray(raw.shards) || raw.shards.length !== Math.ceil(raw.families / 100)) fail('shard count');
	let next = 1;
	const shards = raw.shards.map((row, at) => {
		object(row, 'shard'); const name = 'previews-' + String(at + 1).padStart(4, '0') + '.json', last = Math.min(next + 99, raw.families);
		if (row.name !== name || row.first !== next || row.last !== last || row.families !== last - next + 1) fail('shard order');
		next = last + 1;
		return freeze({name, url: row.url === name ? name : https(row.url), first: row.first, last, families: row.families,
			bytes: integer(row.bytes, 'shard bytes', 16 * 1024 * 1024), sri: pin(row.sri), gzipBytes: integer(row.gzipBytes, 'gzip bytes', 16 * 1024 * 1024)});
	});
	return freeze({schema: 1, source: freeze({revision: source.revision, metadataSri: pin(source.metadataSri), fontTools: source.fontTools,
		harfBuzz: source.harfBuzz, uharfbuzz: source.uharfbuzz, shaperSri: pin(source.shaperSri), shaperSource: source.shaperSource,
		fontToolsSource: source.fontToolsSource, outlinePenSri: pin(source.outlinePenSri), coordinates: source.coordinates, precision: 4, hinting: false}),
		families: raw.families, shards: freeze(shards)});
}
export function admitFontPreviewShard(raw, descriptor, catalog) {
	object(raw, 'shard');
	if (raw.schema !== 1 || raw.first !== descriptor.first || raw.last !== descriptor.last || !Array.isArray(raw.families) || raw.families.length !== descriptor.families) fail('shard identity');
	const prefix = 'https://raw.githubusercontent.com/google/fonts/' + catalog.source.revision + '/';
	const families = raw.families.map((row, at) => {
		object(row, 'family'); const family = catalog.families[raw.first + at - 1];
		if (!family || row.id !== family.id || row.name !== family.name) fail('family identity');
		const selection = selectedFace(family), selected = selection.file;
		if (row.fileSri !== selected.sri || row.sourceFont?.url !== selected.sourceUrl) fail('selected font custody');
		if (selection.italicFallback ? row.italicFallback !== true : row.italicFallback !== undefined) fail('italic fallback custody');
		const location = object(row.location, 'variation location');
		if (!Array.isArray(row.sourceAxes) || row.sourceAxes.length > 64 || Object.keys(location).length !== row.sourceAxes.length) fail('source axes or variation count');
		const tags = new Set(), sourceAxes = row.sourceAxes.map(axis => {
			object(axis, 'source axis'); const union = family.axes.find(value => value.tag === axis.tag);
			if (!union || tags.has(axis.tag) || !Number.isFinite(axis.min) || !Number.isFinite(axis.default) || !Number.isFinite(axis.max) ||
				axis.min < union.start || axis.max > union.end || axis.min > axis.default || axis.default > axis.max) fail('source axis range');
			tags.add(axis.tag);
			const expected = axis.tag === 'wght' ? Math.max(axis.min, Math.min(400, axis.max)) : axis.default;
			if (!Object.hasOwn(location, axis.tag) || location[axis.tag] !== expected) fail('preview variation location');
			return freeze({tag: axis.tag, min: axis.min, default: axis.default, max: axis.max});
		});
		const out = {id: row.id, name: row.name, fileSri: pin(row.fileSri), sourceFont: sourceFile(row.sourceFont, prefix, 32 * 1024 * 1024),
			sourceAxes: freeze(sourceAxes), location: freeze({...location}), ...(selection.italicFallback ? {italicFallback: true} : {}), primaryScript: row.primaryScript === '' ? '' : script(row.primaryScript), primaryLanguage: row.primaryLanguage};
		if (typeof out.primaryLanguage !== 'string' || out.primaryLanguage.length > 80 || out.primaryLanguage && !/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(out.primaryLanguage)) fail('primary language');
		if (row.preview === null) { out.preview = null; out.unavailable = problem(row.unavailable); }
		else {
			out.preview = specimen(row.preview, prefix);
			if (out.preview.kind === 'name' && (out.preview.text !== family.name || row.nameUnavailable !== undefined) || out.preview.kind !== 'name' && !row.nameUnavailable || row.unavailable !== undefined) fail('name preview identity');
		}
		if (row.nameUnavailable !== undefined) {
			out.nameUnavailable = problem(row.nameUnavailable);
			if (out.nameUnavailable.text !== family.name) fail('unavailable name');
		}
		if (row.sample !== undefined) { out.sample = specimen(row.sample, prefix); if (out.sample.kind === 'name' || out.preview?.kind !== 'name' || row.sampleUnavailable !== undefined) fail('second sample'); }
		if (row.sampleUnavailable !== undefined) { if (out.preview?.kind !== 'name') fail('sample unavailable'); out.sampleUnavailable = problem(row.sampleUnavailable); }
		return freeze(out);
	});
	return freeze({schema: 1, first: raw.first, last: raw.last, families: freeze(families)});
}
