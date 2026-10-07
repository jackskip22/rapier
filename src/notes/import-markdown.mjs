// Markdown import projects metadata; source is never a disposable preview. Only an explicit
// export flavour may convert recognized source spans. The shared links scanner owns protected
// Markdown regions and the door owns all final-name/link and picture mapping. A note's tags are
// the note's own bytes: they are read from the metadata block by the one module that owns it
// (notes/frontmatter.mjs), and a name this import would otherwise take out of the file is written
// back into that block through the same module. Nothing here is written to the sidecar.
import {noteFileName, orderAfter} from './model.mjs';
import {readZipEntries, zipOversizeSkip} from './zip.mjs';
import {headingAnchors, linkMask} from './links.mjs';
import {propertiesOf, tagsOf, parseFrontMatter} from './frontmatter.mjs';
import {importTags, importDate, literalInline, literalBlock} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters} from './import-characters.mjs';

const ENCODER = new TextEncoder();
const PICTURE_MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', jxl: 'image/jxl', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff'};
const STRUCTURAL_FOLDER = new Set(['pages', 'journals', 'assets', '.obsidian', '.trash']);
function literalText(text, title) {
	const body = literalBlock(text);
	return '# ' + literalInline(title) + (body ? '\n\n' + body : '') + (body.endsWith('\n') ? '' : '\n');
}
function extOf(name) { return /\.([A-Za-z0-9]+)$/.exec(String(name).split('/').pop())?.[1].toLowerCase() || ''; }
function leftoverFolder(path) {
	const parts = String(path).split('/').filter(Boolean); parts.pop();
	return parts.filter(p => !STRUCTURAL_FOLDER.has(p.toLowerCase()) && !/\.textbundle$/i.test(p)).join('/');
}
// The capped, folded names a category is chosen from -- the placement helper, not the note's tags.
function labelsOf(raw) {
	const labels = [], seen = new Set();
	for (const value of Array.isArray(raw) ? raw : []) {
		const name = typeof value === 'string' ? value.trim() : '', key = name.toLowerCase();
		if (!name || name.length > 48 || seen.has(key) || labels.length >= 16) continue;
		seen.add(key); labels.push(name);
	}
	return labels;
}
function sourceFor(entry, warnings) {
	const text = readImportText(entry, warnings);
	// For valid UTF-8 this is the exact source byte sequence (including a BOM). A damaged
	// sequence has been reported; never pair its old bytes with the repaired displayed text.
	return {text, bytes: ENCODER.encode(text)};
}
function *linesOf(text) {
	let start = 0;
	while (start < text.length) {
		let end = start;
		while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end++;
		const next = end + (text[end] === '\r' && text[end + 1] === '\n' ? 2 : end < text.length ? 1 : 0);
		yield {start, end, next, text: text.slice(start, end)}; start = next;
	}
}
function clear(mask, start, end) { for (let i = start; i < end; i++) if (mask[i]) return false; return true; }
function applyPatches(text, patches) {
	let at = 0, out = '';
	for (const p of patches) { out += text.slice(at, p.start) + p.text; at = p.end; }
	return out + text.slice(at);
}

// The metadata block is read by its one owner (notes/frontmatter.mjs), which reads the block and
// nothing else: no second reader here, and no fence guessed at by a regular expression.
// A projected date must fit the folder's non-negative integer time. The original frontmatter
// remains exact; a supplied value that cannot become a date also earns its receipt entry.
function fmTime(properties, keys, warnings) {
	for (const key of keys) {
		const value = properties.get(key), time = importDate(value, typeof value === 'string' ? Date.parse(value) : NaN, warnings, key);
		if (time !== undefined) return time;
	}
}

// A hashtag is metadata only for the explicit Bear/Obsidian row, or for a TextBundle that names Bear. This is the
// one grammar of Bear's tags and both readers call it: a bare word, nested with `/`, `.` or `-` (`#recipes/italian`),
// or wrapped in a second hash (`#vacation plans#`, the form a name with spaces needs); letters carry their combining
// marks. A name of digits alone (`#123`, an issue number) is prose, never a tag. Scanner ranges exclude every
// protected region, including YAML; a tag-looking Python comment is never an import command.
export function tagsIn(text, mask) {
	const found = [], re = /(^|[\s([{])(#(?:([\p{L}\p{M}\p{N}_](?:[\p{L}\p{M}\p{N}_/ .-]*[\p{L}\p{M}\p{N}_])?)#|([\p{L}\p{M}\p{N}_]+(?:[/.-][\p{L}\p{M}\p{N}_]+)*)))/gu;
	let m;
	while ((m = re.exec(text))) {
		const name = m[3] || m[4], start = m.index + m[1].length, end = start + m[2].length;
		if (/^\p{Nd}+$/u.test(name.replace(/[\s./_-]/g, '')) || !clear(mask, start, end)) continue;
		found.push({name, start, end});
	}
	return found;
}
function convertBear(text, tags) {
	const patches = []; let at = 0;
	for (const line of linesOf(text)) {
		while (at < tags.length && tags[at].start < line.start) at++;
		const first = at; let rest = '', pos = line.start;
		while (at < tags.length && tags[at].end <= line.end) { rest += text.slice(pos, tags[at].start); pos = tags[at].end; at++; }
		rest += text.slice(pos, line.end);
		if (first !== at && !rest.trim()) patches.push({start: tags[first].start, end: tags[at - 1].end, text: ''});
	}
	return applyPatches(text, patches);
}
export async function importMarkdown(entries, options) {
	const list = Array.isArray(entries) ? entries : [], opts = options && typeof options === 'object' ? options : {};
	const pool = Array.isArray(opts.existing) ? opts.existing.filter(n => typeof n === 'string').slice() : [];
	const lastOrder = typeof opts.lastOrder === 'string' ? opts.lastOrder : '';
	const notes = [], skipped = [], pictures = [], sections = [], spelled = new Map(), formatWarnings = [];
	for (const value of Array.isArray(opts.sections) ? opts.sections : []) { const name = typeof value === 'string' ? value : value?.name; if (typeof name === 'string' && name && !spelled.has(name.toLowerCase())) spelled.set(name.toLowerCase(), name); }
	const flat = [];
	for (let i = 0; i < list.length; i++) {
		const e = list[i];
		if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !e.name) continue;
		if (e.oversize) { flat.push(e); continue; }
		if (/\.(zip|textpack)$/i.test(e.name)) {
			// Entry by entry, never the whole archive at once. A folder of Markdown is the likeliest
			// thing anybody imports -- a vault, an export, a zip they made themselves -- so this is the
			// importer most likely to meet an archive bigger than a cheap phone's headroom.
			//
			// `start` is not decoration. The eager read was atomic: it returned everything or threw
			// before a single push, so the catch below could simply record the archive as skipped.
			// Streaming pushes as it goes, so a failure halfway through leaves this archive's earlier
			// entries in `flat` -- and they would be imported as notes from an archive the very same
			// catch is calling unreadable. Rewinding to `start` keeps those two statements from
			// contradicting each other.
			const start = flat.length;
			try {
				const rootId = e.rootId ?? opts.rootId ?? 'container-' + i + ':' + e.name;
				for await (const item of readZipEntries(e.bytes)) if (item?.name && (item.oversize || !item.name.endsWith('/'))) flat.push({...item, rootId, from: e.name, flavour: e.flavour ?? opts.flavour});
			} catch (error) { flat.length = start; skipped.push({name: e.name, rootId: e.rootId ?? opts.rootId ?? '', why: 'could not be read as a zip: ' + String(error?.message || error)}); }
		} else flat.push(e);
	}
	for (const e of flat) {
		if (e.oversize) { skipped.push(zipOversizeSkip(e)); continue; }
		const name = e.name.replace(/\\/g, '/'), rootId = e.rootId ?? opts.rootId ?? e.from ?? '';
		const refuse = why => skipped.push({name, rootId, why});
		if (/(^|\/)(\.obsidian|\.trash|__MACOSX)(\/|$)/i.test(name) || /(^|\/)\.DS_Store$/i.test(name)) { refuse('application or archive metadata is not note text'); continue; }
		const ext = extOf(name), bundle = /^(.*\/)?([^/]+)\.textbundle\/(.+)$/i.exec(name);
		if (PICTURE_MIME[ext] && e.bytes instanceof Uint8Array) { pictures.push({name, sourceName: name, rootId, bytes: e.bytes, mime: PICTURE_MIME[ext]}); continue; }
		if (ext === 'canvas') {
			formatWarnings.push({code: 'canvas_preserved', name, rootId, message: 'The canvas remains an original attachment. Its cards, connections and file paths are not converted into editable notes.'});
			refuse('canvas source is an attachment, not Markdown note text'); continue;
		}
		if (bundle && /^info\.json$/i.test(bundle[3])) { refuse('package metadata is not note text'); continue; }
		if (!['md', 'markdown', 'txt', 'text'].includes(ext)) { refuse('not Markdown, plain text, or a supported picture'); continue; }
		try {
			const warnings = [];
			const original = sourceFor(e, warnings), raw = original.text;
			const plain = ext === 'txt' || ext === 'text';
			const bundleNote = bundle && /^text\.(md|markdown|txt|text)$/i.test(bundle[3]);
			const fileTitle = (bundleNote ? bundle[2] : name.split('/').pop().replace(/\.(md|markdown|txt|text)$/i, '')).trim() || 'note';
			const flavour = String(e.flavour ?? opts.flavour ?? 'markdown').trim().toLowerCase();
			const properties = plain ? new Map() : propertiesOf(raw);
			// Source remains exact even when the tag reader cannot project an opaque field or trims
			// a character from its display name. Say so; never rewrite the person's metadata block.
			if (!plain) for (const field of parseFrontMatter(raw).fields) if (['tag', 'tags'].includes(field.key)) {
				if (field.value === undefined) warnings.push({code: 'tags-unreadable', message: 'The original tag characters and syntax were kept in the note, but this metadata field cannot be read safely as tags.'});
				else for (const value of Array.isArray(field.value) ? field.value : [field.value]) if (typeof value === 'string') reportCharacterChange(value, value.trim(), warnings, 'metadata tag display name');
			}
			// `tags` is everything this file says its tags are, for the category below. `lifted` is the
			// subset that would otherwise be nowhere in the note after import -- a tag line Bear's own
			// conversion takes out of the body -- and
			// that is what gets written into the note's own metadata block. A tag already in the bytes
			// (a block's own list, a hashtag left in the body) is left exactly where the person put it.
			let tags = plain ? [] : tagsOf(raw), lifted = [], text = raw;
			const titleProperty = properties.get('title');
			let projectionTitle = typeof titleProperty === 'string' ? titleProperty.trim() : '';
			if (plain) { text = literalText(raw, fileTitle); reportCharacterChange(raw, text, warnings, 'plain-text body'); }
			else if (flavour === 'bear' || flavour === 'obsidian') {
				const found = tagsIn(raw, linkMask(raw)); tags = tags.concat(found.map(t => t.name));
				if (flavour === 'bear') {
					const converted = convertBear(raw, found);
					const stillThere = new Set(tagsIn(converted, linkMask(converted)).map(t => t.name));
					lifted = [...new Set(found.map(t => t.name))].filter(tag => !stillThere.has(tag));
					const said = warnings.length;
					const written = lifted.length ? importTags(converted, lifted, warnings, name) : converted;
					// Taking the tag lines out of the body stands only if their names reached the block.
					// A refused edit leaves the note exactly as it arrived rather than half written.
					text = warnings.length === said ? written : raw;
				}
			}
			const title = projectionTitle || (plain ? '' : headingAnchors(raw)[0]?.text) || fileTitle;
			const file = noteFileName('# ' + title, pool); pool.push(file);
			const entry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''};
			const category = labelsOf(tags)[0] || leftoverFolder(name);
			if (category) {
				const key = category.toLowerCase();
				if (!spelled.has(key)) { spelled.set(key, category); sections.push(category); }
				entry.category = spelled.get(key);
			}
			const created = fmTime(properties, ['created', 'date'], warnings), modified = fmTime(properties, ['updated', 'modified'], warnings) ?? created;
			if (created !== undefined) entry.created = Math.round(created);
			if (modified !== undefined) entry.modified = Math.round(modified);
			notes.push({file, title, text, bytes: text === raw ? original.bytes : ENCODER.encode(text), entry, sourceName: name, rootId, flavour, warnings});
		} catch (error) { refuse('could not be read: ' + String(error?.message || error)); }
	}
	let last = lastOrder;
	const byNewest = notes.slice().sort((a, b) => (b.entry.created ?? -Infinity) - (a.entry.created ?? -Infinity));
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; }
	return finishImportCharacters({notes, skipped, sections, pictures, warnings: formatWarnings});
}
