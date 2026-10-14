import {audioMime, appendImportedRecording, recordingHref} from './audio.mjs';
import {noteFileName, orderAfter} from './model.mjs';
import {htmlToMarkdown} from './html-md.mjs';
import {scanLinks, escapeLinkAttribute} from './links.mjs';
import {importTags, literalInline, importMetadata, importDate, importTrash, importAlarm} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';

function readTar(bytes) {
	bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const dec = new TextDecoder(), out = [], names = new Set();
	const str = (off, len, warnings) => { let end = off; while (end < off + len && bytes[end] !== 0) end++; const part = bytes.subarray(off, end); return warnings ? readImportText({bytes: part}, warnings, 'JEX member name') : dec.decode(part); };
	const octal = (off, len) => {
		const s = str(off, len).trim();
		if (s && !/^[0-7]+$/.test(s)) throw new Error('invalid TAR octal field');
		const value = s ? Number.parseInt(s, 8) : 0;
		if (!Number.isSafeInteger(value)) throw new Error('TAR size is not exact');
		return value;
	};
	for (let off = 0; off < bytes.length;) {
		if (bytes.length - off < 512) throw new Error('truncated TAR header');
		let blank = true;
		for (let i = 0; i < 512 && blank; i++) if (bytes[off + i] !== 0) blank = false;
		if (blank) break;
		let checksum = 0;
		for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : bytes[off + i];
		if (checksum !== octal(off + 148, 8)) throw new Error('TAR header checksum mismatch');
		const characterWarnings = [], name = str(off, 100, characterWarnings), prefix = str(off + 345, 155, characterWarnings);
		const size = octal(off + 124, 12), typeflag = String.fromCharCode(bytes[off + 156] || 0);
		const full = prefix ? prefix + '/' + name : name;
		if (!full || /[\0\r\n]/.test(full) || /^(?:[\\/]|[a-z]:)/i.test(full) || full.replace(/\\/g, '/').split('/').includes('..')) throw new Error('unsafe JEX member path: ' + full);
		if (!['0', '\0', '5'].includes(typeflag)) throw new Error('unsupported JEX member type: ' + full);
		if (names.has(full)) throw new Error('duplicate JEX member path: ' + full);
		names.add(full);
		off += 512;
		if (size > bytes.length - off) throw new Error('truncated TAR payload: ' + full);
		if (full && !full.endsWith('/') && (typeflag === '0' || typeflag === '\0' || typeflag === '')) out.push({name: full, bytes: bytes.slice(off, off + size), characterWarnings});
		off += Math.ceil(size / 512) * 512;
	}
	return out;
}

const KNOWN_KEYS = new Set(['id', 'parent_id', 'created_time', 'updated_time', 'is_conflict', 'latitude', 'longitude', 'altitude', 'author', 'source_url', 'is_todo', 'todo_due', 'todo_completed', 'source', 'source_application', 'application_data', 'order', 'user_created_time', 'user_updated_time', 'encryption_cipher_text', 'encryption_applied', 'encryption_blob_encrypted', 'markup_language', 'is_shared', 'share_id', 'master_key_id', 'note_id', 'tag_id', 'icon', 'mime', 'filename', 'file_extension', 'size', 'ocr_text', 'ocr_status', 'ocr_error', 'blob_updated_time', 'user_data', 'deleted_time', 'conflict_original_id', 'is_locked', 'extracted_resource_ids', 'type_']);

function parseItem(text) {
	const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
	let end = lines.length;
	while (end > 0 && lines[end - 1] === '') end--;
	let start = end;
	while (start > 0) {
		const line = lines[start - 1];
		if (line === '') break;
		const at = line.indexOf(': ');
		const key = at < 0 ? (line.endsWith(':') ? line.slice(0, -1) : null) : line.slice(0, at);
		if (!key || !KNOWN_KEYS.has(key)) return null;
		start--;
	}
	if (start === end) return null;
	const fields = {};
	for (let i = start; i < end; i++) { const line = lines[i]; const at = line.indexOf(': '); const key = at < 0 ? line.slice(0, -1) : line.slice(0, at); fields[key] = at < 0 ? '' : line.slice(at + 2); }
	if (!('id' in fields) || !('type_' in fields)) return null;
	if (parseInt(fields.type_, 10) !== 1 && ('is_locked' in fields || 'extracted_resource_ids' in fields)) return null;
	const rest = lines.slice(0, Math.max(0, start - 1));
	const title = rest[0] || '';
	const body = rest.slice(1).join('\n').replace(/^\n+/, '');
	return {title, body, fields};
}

const IMAGE_MIME_BY_EXT = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heic'};

const JOPLIN_ZERO_UNSET = new Set(['is_conflict', 'encryption_applied', 'is_shared', 'is_locked', 'deleted_time', 'order']);
const JOPLIN_LABELS = {source: 'source app', source_application: 'source app id', order: 'custom order', is_conflict: 'conflict flag', is_shared: 'published flag', encryption_applied: 'encryption flag', application_data: 'app data', extracted_resource_ids: 'referenced resource ids'};
const joplinZero = value => value === undefined || value === '' || /^-?0+(?:\.0+)?$/.test(value);
const joplinInstant = value => /^\d+$/.test(value || '') ? Number(value) : Date.parse(value);
function joplinUnset(fields, applied) {
	const nowhere = joplinZero(fields.latitude) && joplinZero(fields.longitude);
	return (key, value) => JOPLIN_ZERO_UNSET.has(key) ? value === '0'
		: key === 'latitude' || key === 'longitude' ? nowhere
		: key === 'altitude' ? nowhere && joplinZero(value)
		: Object.hasOwn(applied, key) && joplinInstant(value) === applied[key];
}

export async function importJoplin(entries, options) {
	const list = Array.isArray(entries) ? entries : [];
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const skipped = [], damagedItems = [];

	const named = [];
	for (const e of list) {
		if (!e || typeof e.name !== 'string') continue;
		if (/\.jex$/i.test(e.name) && e.bytes && e.text === undefined) {
			let inner; try { inner = readTar(e.bytes); } catch (error) { skipped.push({name: e.name, why: 'could not be read as a JEX: ' + String((error && error.message) || error)}); continue; }
			for (const z of inner) named.push({...z, rootId: e.rootId});
		} else if (e.text !== undefined || e.bytes !== undefined) named.push({...e});
	}

	const metadataWarnings = [], resourceWarnings = [];
	for (const e of named) if (/\.md$/i.test(e.name)) {
		e.characterWarnings = [...(e.characterWarnings || [])];
		try { e.text = readImportText(e, e.characterWarnings); }
		catch (error) { skipped.push({name: e.name, why: error.message}); }
	}
	const notes = [], folders = new Map(), tags = new Map(), noteTagPairs = [], resources = new Map(), consumed = [], metadataEntries = new Set();
	for (const e of named) {
		if (!/\.md$/i.test(e.name) || typeof e.text !== 'string') continue;
		const item = parseItem(e.text);
		if (!item) {
			if (/(?:^|[/\\])[0-9a-f]{32}\.md$/i.test(e.name)) damagedItems.push(e);
			else skipped.push({name: e.name, rootId: e.rootId ?? '', bytes: e.bytes, text: e.text, why: 'not a Joplin item'});
			continue;
		}
		metadataEntries.add(e);
		const type = parseInt(item.fields.type_, 10);
		if (type !== 1 || joplinZero(item.fields.is_locked)) reportCharacterChange(e.text, e.text.replace(/\r\n?/g, '\n'), e.characterWarnings, 'Joplin line endings');
		if (type !== 1) metadataWarnings.push(...e.characterWarnings);
		if ([2, 5].includes(type) && item.body) metadataWarnings.push({code: 'import-metadata-text', name: e.name, message: 'Text under a Joplin notebook or tag title was not used as its name. The whole item stays in the original export.'});
		if (type === 1) notes.push({source: e, name: e.name, rootId: e.rootId ?? '', title: item.title, body: item.body, f: item.fields, characterWarnings: e.characterWarnings});
		else if (type === 2) folders.set(item.fields.id, {title: item.title, parent: item.fields.parent_id || ''});
		else if (type === 5) tags.set(item.fields.id, item.title);
		else if (type === 6) noteTagPairs.push({note: item.fields.note_id, tag: item.fields.tag_id});
		else if (type === 4) {
			resources.set(item.fields.id, {title: item.title, mime: item.fields.mime || '', ext: item.fields.file_extension || '', rootId: e.rootId ?? ''});
			const warnings = [];
			importMetadata(item.fields, ['id', 'type_', 'mime', 'file_extension', 'filename', 'size'], warnings, 'Joplin resource fields', {at: item.fields.id});
			resourceWarnings.push(...warnings.map(warning => ({...warning, sourceName: e.name, rootId: e.rootId ?? ''})));
		}
		else skipped.push({name: e.name, rootId: e.rootId ?? '', bytes: e.bytes, text: e.text, why: 'unsupported Joplin metadata retained in source export', attachment: true});
		if ([2, 4, 5, 6].includes(type)) consumed.push({name: e.name, rootId: e.rootId ?? ''});
	}
	const resourceBytes = new Map();
	for (const e of named) {
		if (!e.bytes || metadataEntries.has(e)) continue;
		const base = e.name.split(/[\\/]/).pop();
		const noExt = base.replace(/\.[^./]+$/, '');
		for (const id of resources.keys()) if (base === id || noExt === id) { if (!resourceBytes.has(id)) resourceBytes.set(id, []); resourceBytes.get(id).push(e); break; }
	}
	const matchedResources = new Set([...resourceBytes.values()].flat());
	for (const e of named) if (!metadataEntries.has(e) && !matchedResources.has(e) && !(/\.md$/i.test(e.name) && typeof e.text === 'string')) {
		skipped.push({name: e.name, rootId: e.rootId ?? '', bytes: e.bytes, text: e.text,
			byteLength: e.bytes?.length ?? new TextEncoder().encode(e.text ?? '').length,
			attachment: true, why: 'unrecognised attachment retained in source export'});
	}

	function folderPath(id, warnings) {
		const parts = [], seen = new Set(); let cur = id;
		for (; cur && folders.has(cur) && !seen.has(cur) && parts.length < 32; cur = folders.get(cur).parent) { seen.add(cur); parts.unshift(folders.get(cur).title); }
		if (cur && folders.has(cur)) warnings.push({code: 'import-folder-bound', message: 'Notebook path characters above the existing 32-level bound, or in a parent cycle, were not projected into the category. Original folder metadata remains in the source input.'});
		return parts.join('/');
	}
	const noteTagsOf = new Map();
	for (const pair of noteTagPairs) { if (!tags.has(pair.tag)) continue; if (!noteTagsOf.has(pair.note)) noteTagsOf.set(pair.note, []); noteTagsOf.get(pair.note).push(tags.get(pair.tag)); }

	const attachments = [], pictures = [], audio = [], audioPool = [...(Array.isArray(options?.audioExisting) ? options.audioExisting : [])], sounds = new Map();
	for (const [id, r] of resources) for (const source of resourceBytes.get(id) || []) {
		const ext = r.ext ? '.' + r.ext.replace(/^\./, '') : '';
		const mime = r.mime || IMAGE_MIME_BY_EXT[ext.replace(/^\./, '').toLowerCase()] || 'application/octet-stream';
		const sound = audioMime(mime, source.name);
		if (sound) { if (!sounds.has(id)) sounds.set(id, {name: source.name, bytes: source.bytes, mime: sound}); }
		else if (/^image\//i.test(mime)) pictures.push({name: source.name, sourceName: source.name, sourceAliases: [':/' + id], rootId: source.rootId ?? r.rootId, bytes: source.bytes, mime});
		else attachments.push({name: source.name, sourceName: source.name, label: r.title || source.name.split('/').pop(), sourceAliases: [':/' + id], rootId: source.rootId ?? r.rootId, bytes: source.bytes, mime});
	}

	const pool = existing.slice(), built = [], seenSections = new Set(), sections = [];
	function addSection(name) { if (name && !seenSections.has(name.toLowerCase())) { seenSections.add(name.toLowerCase()); sections.push(name); } }
	for (const e of damagedItems) built.push({...literalImportSource(e, pool, 'Joplin item metadata was incomplete or unreadable.', [...(e.characterWarnings || [])]), created: -Infinity});

	for (const n of notes) {
		try {
			const id = n.f.id;
			let title = n.title, body = n.body;
			const warnings = [...metadataWarnings, ...(n.characterWarnings || [])];
			if (!joplinZero(n.f.is_locked)) {
				const kept = literalImportSource(n.source, pool, 'This Joplin note is locked and its body is encrypted; unlock it in Joplin and export again.', warnings);
				built.push({...kept, created: -Infinity});
				continue;
			}
			reportCharacterChange(n.title, n.title.trim(), warnings, 'Joplin title');
			if (n.f.encryption_applied === '1') {
				const source = JSON.stringify({encryption_applied: n.f.encryption_applied, encryption_cipher_text: n.f.encryption_cipher_text ?? ''}, null, 2);
				const fence = '`'.repeat(Math.max(3, 1 + Math.max(0, ...(source.match(/`+/g) || []).map(part => part.length))));
				body += (body ? '\n\n' : '') + fence + 'json\n' + source + '\n' + fence;
				warnings.push({code: 'encrypted_block', message: 'Encrypted source retained literally; it was not decrypted.'});
			} else if (n.f.markup_language === '2') body = htmlToMarkdown(body, {warnings});
			for (const link of scanLinks(body)) {
				const resourceId = link.dest?.startsWith(':/') ? link.dest.slice(2) : '';
				const resource = resources.get(resourceId);
				if ((resourceBytes.get(resourceId) || []).length > 1) warnings.push({code: 'picture_ambiguous', name: resource?.title || resourceId, message: 'Multiple resource files claim this identity; the original reference is retained.'});
				if (sounds.has(resourceId)) continue;
				if (resource && !resourceBytes.has(resourceId)) warnings.push({code: 'attachment_missing', name: resource.title || resourceId, message: 'Attachment reference retained; its file was not in the source export.'});
			}
			const noteSounds = [];
			for (const link of scanLinks(body).reverse()) {
				const resourceId = link.dest?.startsWith(':/') ? link.dest.slice(2) : '';
				const sound = sounds.get(resourceId);
				if (!sound) continue;
				let row = noteSounds.find(row => row.id === resourceId);
				if (!row) noteSounds.unshift(row = {id: resourceId, sound, append: false});
				if (link.kind === 'html' || row.append) continue;
				row.append = true;
				body = body.slice(0, link.start) + body.slice(link.end);
			}
			if (n.f.is_todo === '1') title = '- [' + (n.f.todo_completed && n.f.todo_completed !== '0' ? 'x' : ' ') + '] ' + literalInline(title);
			else if (title.trim()) title = '# ' + literalInline(title.trim()).replace(/(\s+#+)$/, m => m.replace('#', '\\#'));
			const separator = n.f.is_todo === '1' && /^(?: {4}| {0,3}\t)/.test(body) ? '\n\n<!-- -->\n\n' : '\n\n';
			let text = (title.trim() ? title + (body ? separator : '') : '') + body;
			if (!text && !noteSounds.length) { skipped.push({name: n.name, why: 'empty note'}); continue; }
			const file = noteFileName(text + '\n', pool); pool.push(file);
			const soundHrefs = new Map();
			for (const {id, sound, append} of noteSounds) {
				const mapped = appendImportedRecording(text, file, sound, audioPool);
				if (append) text = mapped.text.trimEnd();
				audio.push(mapped.audio); audioPool.push(mapped.audio.name);
				soundHrefs.set(':/' + id, escapeLinkAttribute(recordingHref(mapped.audio.name)));
			}
			for (const link of scanLinks(text).reverse()) {
				if (link.kind !== 'html' || !soundHrefs.has(link.dest)) continue;
				text = text.slice(0, link.destStart) + soundHrefs.get(link.dest) + text.slice(link.destEnd);
			}
			const category = n.f.parent_id ? folderPath(n.f.parent_id, warnings) : '';
			const tags = noteTagsOf.get(id) || [];
			const entry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''};
			if (category) { entry.category = category; addSection(category); }
			const time = (value, field) => importDate(value, /^\d+$/.test(value || '') ? Number(value) : Date.parse(value), warnings, 'Joplin ' + field);
			entry.trashed = Number(n.f.deleted_time) > 0;
			importTrash(entry, options, warnings);
			if (n.f.is_todo === '1') importAlarm(entry, time(n.f.todo_due, 'due date'), time(n.f.todo_completed, 'completion date'), warnings);
			const modified = time(n.f.user_updated_time || n.f.updated_time, 'edit date');
			if (Number.isFinite(modified)) entry.modified = modified;
			const created = time(n.f.user_created_time || n.f.created_time, 'creation date');
			importMetadata(n.f, ['id','type_','parent_id','user_created_time','user_updated_time','markup_language','is_todo','todo_due','todo_completed'], warnings, 'Joplin fields',
				{unset: joplinUnset(n.f, {created_time: created, updated_time: modified}), labels: JOPLIN_LABELS});
			built.push({file, text: importTags(text + (text.endsWith('\n') ? '' : '\n'), tags, warnings, n.name), entry, sourceName: n.name, sourceAliases: [':/' + id], rootId: n.rootId, warnings, created: Number.isFinite(created) ? created : -Infinity});
		} catch (_) { skipped.push({name: n.name, why: 'could not be read'}); }
	}

	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, pictures, attachments, consumed, audio, warnings: resourceWarnings});
}
