// Notion Markdown passes through; CSV properties are literal text. Shared final-name allocation
// owns link edits.
import {noteFileName, orderAfter} from './model.mjs';
import {readZipEntries, zipOversizeSkip} from './zip.mjs';
import {importTags, literalInline, literalLine} from './import.mjs';
import {parseFrontMatter} from './frontmatter.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';

// Every exported page and database-row file carries a 32-hex ID Notion appends to keep names unique across a whole
// workspace; it is not part of the title a person wrote. The source path keeps it so the import door can resolve
// links through the complete final-name map. Notion's own export page does not document the suffix's shape;
// third-party descriptions of the export do.
const ID_SUFFIX = / [0-9a-f]{32}$/i;
const stripId = name => name.replace(ID_SUFFIX, '');
function splitExt(name) { const m = /^(.*)(\.[^./]*)$/.exec(name); return m ? [m[1], m[2]] : [name, '']; }
function basename(path) { const s = String(path).split(/[\\/]/); return s[s.length - 1]; }

const IMAGE_MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heic'};
function imageMime(ext) { return IMAGE_MIME[ext.replace(/^\./, '').toLowerCase()] || null; }
const trimPropertySpace = text => String(text).replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, '');
function oneLine(s) { return trimPropertySpace(String(s).replace(/[ \t\r\n\f]+/g, ' ')); }

// A minimal RFC4180 reader: a quoted field doubles its own quote to escape one and may itself hold a
// comma or a real newline. Notion's own CSV export uses ordinary quoting, nothing proprietary.
function parseCsv(text) {
	const rows = []; let row = [], field = '', quoted = false;
	const s = String(text).replace(/\r\n?/g, '\n');
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (quoted) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
		else if (c === '"') quoted = true;
		else if (c === ',') { row.push(field); field = ''; }
		else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
		else field += c;
	}
	if (quoted) throw new Error('unterminated quoted CSV field');
	if (field.length || row.length) { row.push(field); rows.push(row); }
	return rows;
}

// A created or edited column whose value carries its timezone becomes the row's own date (a
// wall-clock text without a zone stays text) -- a plain Notion page carries no timestamp at all in
// this export, so a CSV column is the only source importNotion ever has for one.
const CREATED_HEADER = /^(?:created|created time|creation date)$/i;
const MODIFIED_HEADER = /^(?:updated|modified|edited|last edited time|last edited|updated time|modified time)$/i;
function dateFromRow(headers, values, pattern) {
	for (let i = 0; i < headers.length; i++) {
		if (!pattern.test(headers[i])) continue;
		// CSV names alone do not prove a timezone. An ambiguous date stays a property.
		if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(values[i] || '')) continue;
		const t = Date.parse(values[i]);
		if (Number.isFinite(t)) return t;
	}
	return undefined;
}

export async function importNotion(entries, options) {
	const list = Array.isArray(entries) ? entries : [];
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const skipped = [];

	// A whole export picked unopened: unzip it here and fold its entries in by their own path inside
	// the archive, exactly as though the person had picked those files loose. Every entry handed
	// onward is a fresh object -- the caller's own entries are never written to below.
	const collected = [];
	for (const e of list) {
		if (!e || typeof e.name !== 'string') continue;
		if (/\.zip$/i.test(e.name) && e.bytes && e.text === undefined) {
			const start = collected.length;
			try {
				for await (const z of readZipEntries(e.bytes)) collected.push({...z, rootId: e.rootId});
			} catch (error) { collected.length = start; skipped.push({name: e.name, why: 'could not be read as a zip: ' + String((error && error.message) || error)}); }
		} else if (e.oversize || e.text !== undefined || e.bytes !== undefined) collected.push({...e});
	}
	const named = collected.filter(e => { if (!e.oversize) return true; skipped.push(zipOversizeSkip(e)); return false; });
	for (const e of named) {
		e.name = e.name.replace(/\\/g, '/'); e.sourceName = e.sourceName || e.name;
		e.characterWarnings = [];
		if (/\.(md|csv)$/i.test(e.name)) {
			try { e.text = readImportText(e, e.characterWarnings); }
			catch (error) { skipped.push({name: e.sourceName, why: error.message}); }
		}
	}
	// A workspace export wraps everything in one outer "Export-..." folder; a single-page export
	// does not. Stripping a shared root when one exists turns both shapes into the same one, so
	// nothing downstream has to know which kind of export it was handed.
	if (named.length && named.every(e => e.name.includes('/'))) {
		const first = named[0].name.split('/')[0];
		if (named.every(e => e.name.split('/')[0] === first)) for (const e of named) e.name = e.name.slice(first.length + 1);
	}

	const mdEntries = named.filter(e => /\.md$/i.test(e.name) && typeof e.text === 'string');
	const csvEntries = named.filter(e => /\.csv$/i.test(e.name) && typeof e.text === 'string');
	const pictureEntries = named.filter(e => e.bytes && imageMime(splitExt(basename(e.name))[1]));

	const pictures = pictureEntries.map(e => ({name: e.sourceName, sourceName: e.sourceName, rootId: e.rootId ?? '', bytes: e.bytes, mime: imageMime(splitExt(e.name)[1])}));
	for (const e of named) if (!mdEntries.includes(e) && !csvEntries.includes(e) && !pictureEntries.includes(e)) skipped.push({name: e.sourceName, rootId: e.rootId ?? '', byteLength: e.bytes?.length, attachment: true, why: 'unsupported attachment retained in source export'});
	const mdByTitle = new Map();
	for (const page of mdEntries) {
		const title = stripId(splitExt(basename(page.name))[0]);
		if (!mdByTitle.has(title)) mdByTitle.set(title, []);
		mdByTitle.get(title).push(page);
	}
	// A page's self-named folder is not its parent category.
	function categoryFor(path, ownTitle) {
		const parts = path.split('/'); parts.pop();
		if (!parts.length) return '';
		let name = stripId(parts[parts.length - 1]);
		if (name === ownTitle) { parts.pop(); if (!parts.length) return ''; name = stripId(parts[parts.length - 1]); }
		return name;
	}

	// A title alone is not identity: bind only a unique page inside this database's own directory.
	// Ambiguous and unmatched rows stay separate, preserving their properties without guessing.
	const claims = new Map(), standalone = [], damagedCsv = [];
	for (const csv of csvEntries) {
		let rows; try { rows = parseCsv(csv.text); } catch (error) {
			damagedCsv.push({entry: csv, why: 'CSV structure is damaged: ' + String(error?.message || error)}); continue;
		}
		if (!rows.length) { skipped.push({name: csv.name, why: 'empty CSV'}); continue; }
		const headers = rows[0].map(h => trimPropertySpace(h));
		if (!headers.length || !headers[0]) { skipped.push({name: csv.name, why: 'no column to use as a title'}); continue; }
		const dbTitle = stripId(splitExt(basename(csv.name))[0]);
		const lineWarnings = [];
		// The source-wide change is identical for every row. Read it once, then retain
		// that same diagnostic on each row without rescanning a workspace-sized CSV.
		reportCharacterChange(csv.text, csv.text.replace(/\r\n?/g, '\n'), lineWarnings, 'CSV line endings');
		for (const [rowIndex, values] of rows.slice(1).entries()) {
			if (!values.some(value => trimPropertySpace(value))) continue;
			const title = trimPropertySpace(values[0] || '') || 'Untitled row ' + (rowIndex + 2);
			const warnings = [...(csv.characterWarnings || []), ...(trimPropertySpace(values[0] || '') ? [] : [{code: 'row_untitled', message: 'Row has no title; its remaining values were kept in a separately named note.'}])];
			warnings.push(...lineWarnings);
			warnings.push({code: 'database_properties', message: 'Database properties are plain text in this note, not live relations, formulas or database views. Date columns without a timezone remain text.'});
			const lines = [], tags = [];
			for (let i = 1; i < Math.max(headers.length, values.length); i++) { const v = values[i] || ''; if (v) lines.push(literalLine(headers[i] || 'Column ' + (i + 1)) + ': ' + v.split('\n').map(literalLine).join('  \n')); }
			// A column actually named Tag or Tags is the row's tags; every column, that one included,
			// still becomes a property line in the note, and no other column is read as a tag.
			for (let i = 1; i < Math.min(headers.length, values.length); i++) if (/^tags?$/i.test(headers[i])) { const names = String(values[i] || '').split(','); for (const name of names) reportCharacterChange(name, trimPropertySpace(name), warnings, 'CSV tag display name'); tags.push(...names.map(tag => trimPropertySpace(tag)).filter(Boolean)); }
			if (values.length > headers.length) warnings.push({code: 'csv_extra_columns', message: 'Values beyond the named columns were kept by column number.'});
			const created = dateFromRow(headers, values, CREATED_HEADER), modified = dateFromRow(headers, values, MODIFIED_HEADER);
			const queue = mdByTitle.get(title) || [];
			const directory = csv.name.replace(/\.csv$/i, '') + '/';
			// A row's own subpages are descendants of its directory, not other rows in the
			// database. A repeated child title must not detach the parent's CSV properties.
			const candidates = queue.filter(page => page.name.slice(0, page.name.lastIndexOf('/') + 1) === directory);
			const md = candidates.length === 1 ? candidates[0] : null;
			if (md) queue.splice(queue.indexOf(md), 1);
			if (md) claims.set(md, {lines, tags, created, modified, sourceName: csv.sourceName, warnings});
			else standalone.push({title: oneLine(title), sourceItem: 'row:' + (rowIndex + 2), lines, tags, created, modified, category: dbTitle, sourceName: csv.sourceName, rootId: csv.rootId ?? '', warnings: [...warnings, {code: candidates.length > 1 ? 'row_ambiguous' : 'row_unmatched', message: 'CSV row kept as a separate note because its own page could not be identified uniquely.'}]});
		}
	}

	const pool = existing.slice(), built = [], seenSections = new Set(), sections = [];
	function addSection(name) { if (name && !seenSections.has(name.toLowerCase())) { seenSections.add(name.toLowerCase()); sections.push(name); } }
	for (const row of damagedCsv) built.push({...literalImportSource({...row.entry, name: row.entry.sourceName}, pool, row.why, [...(row.entry.characterWarnings || [])], 'csv'), created: -Infinity});

	for (const e of mdEntries) {
		try {
			const ownTitle = stripId(splitExt(basename(e.name))[0]);
			// A page that arrived with a metadata block of its own keeps every byte of it: the row's
			// property lines go under the page's own first line, never inside that block. The one
			// module that reads a block says where it ends; nothing here looks for a fence.
			const front = parseFrontMatter(String(e.text));
			let text = front.body;
			const warnings = [...(e.characterWarnings || [])];
			if (/<(?:aside|table|iframe|object|embed)\b/i.test(text)) warnings.push({code: 'html_retained', message: 'Rich block retained as its original HTML; editor-specific presentation may differ.'});
			const claim = claims.get(e);
			warnings.push(...(claim?.warnings || []));
			if (claim && claim.lines.length) {
				// A CR-only page has lines too. Locate the first authored line without splitting
				// and rejoining its bytes: CSV properties belong below its title, not at its tail.
				const eol = /\r\n|\r|\n/.exec(text)?.[0] || '\n';
				const first = /[^\r\n]*\S[^\r\n]*(?:\r\n|\r|\n|$)/.exec(text);
				const at = first ? first.index + first[0].length : text.length;
				const prefix = text.slice(0, at), rest = text.slice(at);
				text = prefix + (prefix && !/[\r\n]$/.test(prefix) ? eol : '') + eol
					+ claim.lines.join('\n').replace(/\n/g, eol) + eol + (rest && !/^[\r\n]/.test(rest) ? eol : '') + rest;
			}
			text = (front.present ? front.bom + front.block : '') + text;
			// Even an empty page is a file the person handed us.
			const category = categoryFor(e.name, ownTitle);
			if (category) addSection(category);
			const file = noteFileName(text, pool); pool.push(file);
			const entry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''};
			if (category) entry.category = category;
			const modified = claim && claim.modified;
			if (modified !== undefined) entry.modified = modified;
			built.push({file, text: importTags(text, claim?.tags || [], warnings, e.name), entry, sourceName: e.sourceName, rootId: e.rootId ?? '', propertySourceName: claim?.sourceName, warnings, created: claim?.created ?? -Infinity});
		} catch (_) { skipped.push({name: e.name, why: 'could not be read'}); }
	}
	for (const row of standalone) {
		try {
			const text = '# ' + literalInline(row.title) + '\n\n' + row.lines.join('\n') + '\n';
			if (row.category) addSection(row.category);
			const file = noteFileName(text, pool); pool.push(file);
			const entry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''};
			if (row.category) entry.category = row.category;
			if (row.modified !== undefined) entry.modified = row.modified;
			built.push({file, text: importTags(text, row.tags, row.warnings, row.title), entry, sourceName: row.sourceName, sourceItem: row.sourceItem, rootId: row.rootId, warnings: row.warnings, created: row.created ?? -Infinity});
		} catch (_) { skipped.push({name: row.title, why: 'could not be read'}); }
	}

	// Order: chained orderAfter keys after lastOrder, newest first -- see takeout.mjs's own comment on
	// importTakeout for why the newest-to-oldest direction hands the newest note the lowest key.
	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, pictures, consumed: csvEntries.filter(csv => built.some(note => note.propertySourceName === csv.sourceName || note.sourceName === csv.sourceName)).map(csv => ({name: csv.sourceName, rootId: csv.rootId ?? '', files: built.filter(note => note.propertySourceName === csv.sourceName || note.sourceName === csv.sourceName).map(note => note.file)}))});
}
