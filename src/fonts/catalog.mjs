// SPDX-License-Identifier: AGPL-3.0-only
export const FONT_CATALOG_SCHEMA = 1;
export const FONT_CATALOG_LIMITS = Object.freeze({families: 10000, files: 512, fileBytes: 32 * 1024 * 1024, familyBytes: 128 * 1024 * 1024, licenseBytes: 128 * 1024});
// Complete-family coverage evidence, google/fonts e7db6ca603; this order is editorial,
// not a new popularity ranking. These families follow the unchanged ranked slice.
export const FONT_CATALOG_ADDITIONS = Object.freeze({
	revision: 'e7db6ca603fd4862010383ff17ffd6cc4ffac1c0',
	metadataSri: 'sha384-Q+sn7HE7Z2L/ibIOfhAe53fql9u9LctvzIKapyO0VfoBCRIfgD0chSQ5fRChU5TF',
	families: Object.freeze([
		{id: 'gf-06aa142b285324b082a697d3', name: 'Gentium Plus', sourceRank: 889, sourcePosition: 1385},
		{id: 'gf-d5cdddf466406101428d0750', name: 'Noto Sans Lao', sourceRank: 659, sourcePosition: 1135},
		{id: 'gf-b5b25571e27e951e3151a93c', name: 'Noto Sans Armenian', sourceRank: 604, sourcePosition: 1069},
		{id: 'gf-49c87a4b700e4a2a47be7b31', name: 'Noto Serif Armenian', sourceRank: 1010, sourcePosition: 1506},
		{id: 'gf-75c33883f8084621ec5bc88b', name: 'Noto Sans Ethiopic', sourceRank: 658, sourcePosition: 1134},
		{id: 'gf-f9118eb4158c9d818800a705', name: 'Noto Serif Tibetan', sourceRank: 957, sourcePosition: 1456},
		{id: 'gf-d71a32783c2e1712ce3b358a', name: 'Noto Sans Cherokee', sourceRank: 1197, sourcePosition: 1693},
		{id: 'gf-55b38761795f856308f95177', name: 'Noto Sans Canadian Aboriginal', sourceRank: 1007, sourcePosition: 1503},
	].map(Object.freeze)),
});
const categories = new Set(['serif', 'sans-serif', 'display', 'handwriting', 'monospace']);
const licenses = new Set(['OFL-1.0', 'OFL-1.1', 'Apache-2.0', 'Ubuntu-font-1.0']);
const sriPattern = /^sha384-[A-Za-z0-9+/]{64}$/;
const variantPattern = /^(?:regular|italic|(?:[1-9]\d{0,2}|1000)(?:italic)?)(?:-[a-f0-9]{8})?$/;
const asciiName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
function fail(detail) { throw Object.assign(new TypeError('Invalid font catalog: ' + detail), {code: 'font_catalog_invalid'}); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label); return value; }
function string(value, label, max = 160) {
	if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(label);
	return value;
}
function integer(value, label, max) { if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(label); return value; }
function rank(value, label) { if (!Number.isSafeInteger(value) || value < 0 || value > FONT_CATALOG_LIMITS.families) fail(label); return value; }
function list(value, label, max, admit) {
	if (!Array.isArray(value) || value.length > max) fail(label);
	const result = value.map(admit);
	if (new Set(result).size !== result.length) fail('duplicate ' + label);
	return Object.freeze(result);
}
function url(value, relative = false) {
	string(value, 'URL', 2048);
	if (relative && /^families\/[a-z0-9][a-z0-9-]{0,95}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value) && !value.includes('..')) return value;
	if (value.includes('\\')) fail('URL');
	let parsed;
	try { parsed = new URL(value); } catch (_) { fail('URL'); }
	if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || /(?:^|\/)menu(?:\/|\.)/i.test(parsed.pathname)) fail('full-file HTTPS URL');
	return parsed.href;
}
// The editorial curation (repo/fonts/curation.json, joined by tools/font-catalog.mjs --curation): a group, one line, tags
// for search, and a suggested pairing. It never changes ranks, files or licenses.
const groupPattern = /^[a-z][a-z0-9-]{0,31}$/, tagPattern = /^[a-z0-9]+(?:[ -][a-z0-9]+)*$/;
const pairRoles = new Set(['body', 'headings', 'code', 'Latin companion']);
function curation(raw) {
	object(raw, 'curation');
	if (typeof raw.group !== 'string' || !groupPattern.test(raw.group)) fail('curation group');
	const tags = list(raw.tags, 'curation tags', 16, value => { if (typeof value !== 'string' || value.length > 32 || !tagPattern.test(value)) fail('curation tag'); return value; });
	const out = {group: raw.group, description: string(raw.description, 'curation description', 240), tags};
	if (raw.pair !== undefined) {
		object(raw.pair, 'curation pair');
		if (typeof raw.pair.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(raw.pair.id) || !pairRoles.has(raw.pair.role)) fail('curation pair');
		out.pair = Object.freeze({id: raw.pair.id, role: raw.pair.role});
	}
	return Object.freeze(out);
}
function variant(value) { if (typeof value !== 'string' || !variantPattern.test(value)) fail('variant'); return value; }
function file(raw, license = false) {
	object(raw, 'file');
	if (typeof raw.name !== 'string' || !asciiName.test(raw.name) || (license ? !/\.(?:txt|md)$/i.test(raw.name) : !/\.woff2$/i.test(raw.name))) fail('file name');
	if (typeof raw.sri !== 'string' || !sriPattern.test(raw.sri)) fail('SHA-384');
	const out = {name: raw.name, url: url(raw.url, true), bytes: integer(raw.bytes, 'file bytes', license ? FONT_CATALOG_LIMITS.licenseBytes : FONT_CATALOG_LIMITS.fileBytes), sri: raw.sri, sourceUrl: url(raw.sourceUrl)};
	if (!license) {
		out.variants = list(raw.variants, 'file variants', FONT_CATALOG_LIMITS.files, variant);
		if (!out.variants.length) fail('file variants');
	}
	return out;
}
export function admitFontFamily(raw) {
	object(raw, 'family');
	if (typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(raw.id)) fail('family id');
	if (!categories.has(raw.category)) fail('category');
	const variants = list(raw.variants, 'variants', FONT_CATALOG_LIMITS.files, variant);
	if (!variants.length || !Array.isArray(raw.files) || !raw.files.length || raw.files.length > FONT_CATALOG_LIMITS.files) fail('family files');
	const files = raw.files.map(value => Object.freeze(file(value))), names = new Set(), pins = new Map(), covered = new Set();
	let bytes = 0;
	for (const entry of files) {
		if (names.has(entry.name)) fail('duplicate file name');
		names.add(entry.name); bytes += entry.bytes;
		const prior = pins.get(entry.url);
		if (prior && (prior.bytes !== entry.bytes || prior.sri !== entry.sri)) fail('conflicting file pin');
		pins.set(entry.url, entry);
		for (const name of entry.variants) {
			if (!variants.includes(name) || covered.has(name)) fail('variant file coverage');
			covered.add(name);
		}
	}
	if (covered.size !== variants.length || bytes > FONT_CATALOG_LIMITS.familyBytes) fail('family file coverage or size');
	const axes = list(raw.axes, 'axes', 64, value => {
		object(value, 'axis');
		if (typeof value.tag !== 'string' || !/^[a-zA-Z][a-zA-Z0-9 ]{3}$/.test(value.tag) || !Number.isFinite(value.start) || !Number.isFinite(value.end) || value.start > value.end) fail('axis');
		return Object.freeze({tag: value.tag, start: value.start, end: value.end});
	});
	if (new Set(axes.map(axis => axis.tag)).size !== axes.length) fail('duplicate axis');
	const subsets = list(raw.subsets, 'language coverage', 256, value => {
		if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) fail('language coverage');
		return value;
	});
	// Symbol fonts and some complete upstream families declare no language subsets.
	if (subsets.includes('menu')) fail('language coverage');
	const license = file(raw.license, true);
	if (!licenses.has(raw.license.id) || names.has(license.name)) fail('license');
	license.id = raw.license.id;
	const lastModified = string(raw.lastModified, 'last modified', 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(lastModified) || !Number.isFinite(Date.parse(lastModified)) || new Date(lastModified).toISOString().slice(0, 10) !== lastModified) fail('last modified');
	return Object.freeze({id: raw.id, name: string(raw.name, 'family name'), category: raw.category, variants, axes, subsets,
		popularity: integer(raw.popularity, 'popularity rank', FONT_CATALOG_LIMITS.families),
		sourceRank: rank(raw.sourceRank, 'source rank'),
		sourcePosition: integer(raw.sourcePosition, 'source position', FONT_CATALOG_LIMITS.families), version: string(raw.version, 'version', 128), lastModified,
		files: Object.freeze(files), license: Object.freeze(license), ...(raw.curation === undefined ? {} : {curation: curation(raw.curation)})});
}
export function admitFontPreviewDescriptor(raw) {
	object(raw, 'preview descriptor');
	if (typeof raw.sri !== 'string' || !sriPattern.test(raw.sri)) fail('preview SHA-384');
	return Object.freeze({url: raw.url === 'previews/manifest.json' ? raw.url : url(raw.url),
		bytes: integer(raw.bytes, 'preview manifest bytes', 1024 * 1024), sri: raw.sri});
}
export function admitFontCatalog(raw) {
	object(raw, 'catalog');
	if (raw.schema !== FONT_CATALOG_SCHEMA || !Array.isArray(raw.families) || !raw.families.length || raw.families.length > FONT_CATALOG_LIMITS.families) fail('schema or families');
	const source = object(raw.source, 'source'), metadata = object(source.metadata, 'metadata source'), converter = object(source.converter, 'converter');
	if (source.provider !== 'google-fonts' || metadata.url !== 'https://fonts.google.com/metadata/fonts' || !sriPattern.test(metadata.sri) ||
		source.repository !== 'https://github.com/google/fonts' || !/^[a-f0-9]{40}$/.test(source.revision) || source.ordering !== 'popularity-then-family' ||
		converter.repository !== 'https://github.com/google/woff2' || !/^[a-f0-9]{40}$/.test(converter.revision) || !sriPattern.test(converter.sri)) fail('source provenance');
	const generatedAt = string(raw.generatedAt, 'generated date', 32), capturedAt = string(metadata.capturedAt, 'capture date', 32);
	if (!Number.isFinite(Date.parse(generatedAt)) || !Number.isFinite(Date.parse(capturedAt))) fail('date');
	const additions = raw.additions === undefined ? [] : FONT_CATALOG_ADDITIONS.families;
	if (raw.additions !== undefined) {
		if (source.revision !== FONT_CATALOG_ADDITIONS.revision || metadata.sri !== FONT_CATALOG_ADDITIONS.metadataSri || !Array.isArray(raw.additions) || raw.additions.length !== additions.length) fail('curated additions source pin or list');
		for (let at = 0; at < additions.length; at++) {
			const row = object(raw.additions[at], 'curated addition'), pin = additions[at];
			if (row.id !== pin.id || row.name !== pin.name || row.sourceRank !== pin.sourceRank || row.sourcePosition !== pin.sourcePosition) fail('curated addition identity or order');
		}
	}
	const families = raw.families.map(admitFontFamily), ids = new Set(), names = new Set();
	const rankedCount = families.length - additions.length;
	if (rankedCount < 1) fail('ranked families');
	const sourceBase = 'https://raw.githubusercontent.com/google/fonts/' + source.revision + '/', assetPins = new Map(), contentSizes = new Map();
	for (let at = 0; at < families.length; at++) {
		const family = families[at];
		const prior = families[at - 1];
		if (family.popularity !== at + 1 || family.sourcePosition < family.popularity || at < rankedCount && prior && (family.sourcePosition <= prior.sourcePosition || family.sourceRank < prior.sourceRank || family.sourceRank === prior.sourceRank && family.name <= prior.name) || ids.has(family.id) || names.has(family.name)) fail('family order or identity');
		if (at >= rankedCount) {
			const pin = additions[at - rankedCount];
			if (family.id !== pin.id || family.name !== pin.name || family.sourceRank !== pin.sourceRank || family.sourcePosition !== pin.sourcePosition) fail('curated addition family identity or order');
		}
		ids.add(family.id); names.add(family.name);
		for (const file of [...family.files, family.license]) {
			if (!file.sourceUrl.startsWith(sourceBase)) fail('pinned upstream source URL');
			const pin = assetPins.get(file.url), size = contentSizes.get(file.sri);
			if (pin && (pin.sri !== file.sri || pin.bytes !== file.bytes) || size !== undefined && size !== file.bytes) fail('conflicting catalog file pin');
			assetPins.set(file.url, file); contentSizes.set(file.sri, file.bytes);
		}
	}
	const exclusions = list(raw.exclusions, 'excluded families', FONT_CATALOG_LIMITS.families, value => {
		object(value, 'exclusion');
		return Object.freeze({name: string(value.name, 'excluded name'), sourceRank: rank(value.sourceRank, 'excluded rank'),
			sourcePosition: integer(value.sourcePosition, 'excluded position', FONT_CATALOG_LIMITS.families), reason: string(value.reason, 'exclusion reason', 1024)});
	});
	const groups = raw.groups === undefined ? null : list(raw.groups, 'curation groups', 32, value => {
		object(value, 'curation group');
		if (typeof value.id !== 'string' || !groupPattern.test(value.id)) fail('curation group');
		return Object.freeze({id: value.id, label: string(value.label, 'curation group label', 64)});
	});
	if (groups && new Set(groups.map(group => group.id)).size !== groups.length) fail('duplicate curation group');
	for (const family of families) {
		if (!family.curation) continue;
		if (!groups?.some(group => group.id === family.curation.group)) fail('curation group');
		if (family.curation.pair && (family.curation.pair.id === family.id || !ids.has(family.curation.pair.id))) fail('curation pair');
	}
	const ordered = [...families.slice(0, rankedCount), ...exclusions].sort((a, b) => a.sourcePosition - b.sourcePosition), sourceNames = new Set();
	for (let at = 0; at < ordered.length; at++) {
		const entry = ordered[at], prior = ordered[at - 1];
		if (entry.sourcePosition !== at + 1 || sourceNames.has(entry.name) || prior && (entry.sourceRank < prior.sourceRank || entry.sourceRank === prior.sourceRank && entry.name <= prior.name)) fail('source order or exclusions');
		sourceNames.add(entry.name);
	}
	for (const entry of additions) {
		if (entry.sourcePosition <= ordered.length || sourceNames.has(entry.name)) fail('curated addition overlaps ranked source');
		sourceNames.add(entry.name);
	}
	return Object.freeze({schema: FONT_CATALOG_SCHEMA, generatedAt,
		source: Object.freeze({provider: 'google-fonts', metadata: Object.freeze({url: metadata.url, sri: metadata.sri, capturedAt}), repository: source.repository,
			revision: source.revision, ordering: source.ordering, converter: Object.freeze({repository: converter.repository, revision: converter.revision, sri: converter.sri, brotliVersion: string(converter.brotliVersion, 'Brotli version', 64)})}),
		exclusions, families: Object.freeze(families), ...(additions.length ? {additions} : {}), ...(groups ? {groups} : {}), ...(raw.previews === undefined ? {} : {previews: admitFontPreviewDescriptor(raw.previews)})});
}

