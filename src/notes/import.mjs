// One import door: inventory roots, project notes, allocate once, then transform exact spans.
// Storage effects belong to the folder owner; a result is a plan, never a successful write.
import {zipEntries, readZipEntries, zipOversizeSkip, ZIP_MAX_ENTRIES, ZIP_READ_MAX_BYTES, ZIP_WRITE_METADATA_BYTES} from './zip.mjs';
import {walkZipEntries} from './zip-walk.mjs';
import {noteFileName, orderAfter, isCodeFile, codeFileName} from './model.mjs';
import {importAttachments} from './import-attachments.mjs';
import {attachmentHref} from './attachments.mjs';
import {importLinkPatches, scanLinks, resolveAssetPath} from './links.mjs';
import {addBackup, backupSetId, verifyBackupStream, BACKUP_MANIFEST_FILE} from './restore.mjs';
import {createImportReceipt} from './import-receipt.mjs';
import {sha256} from './integrity.mjs';
import {setTags, tagsOf} from './frontmatter.mjs';
import {readImportText, keepImportCharacters, reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';

// Exact restore admits each picked ZIP under the reader's own bound, then the snapshot owner
// checks the complete set. No additive-import aggregate budget can truncate a backup set.
export async function openBackupFiles(files) {
	if (!Array.isArray(files) || !files.length || files.length > ZIP_MAX_ENTRIES) throw new Error('Choose a complete backup or its numbered ZIP parts.');
	const parts = [];
	for (const file of files) {
		if (!/\.zip$/i.test(file?.name || '')) throw new Error('Choose only backup ZIP files. Nothing was restored.');
		const entries = [];
		for await (const entry of zipEntries(file)) {
			if (entry.oversize) {
				if (typeof entry.source !== 'function') throw new Error('This backup member cannot be read whole: ' + entry.name);
				entries.push({...entry, read: async () => { const source = await entry.source(); return source.read(0, entry.size); }});
			} else entries.push(entry);
		}
		parts.push({entries});
	}
	return parts;
}

// Only this admission can carry a deliberately picked set beyond the ordinary import's
// aggregate byte bound. A filename or self-asserted marker is not that capability: every
// selected part and digest is checked first. Reopening the immutable inventory preserves it;
// copying or editing the inventory goes through the ordinary door again.
const backupSetImports = new WeakSet();
export async function openBackupSetForImport(files) {
	const parts = await openBackupFiles(files), groups = new Map();
	let hasSet = false, hasOther = false;
	for (let i = 0; i < parts.length; i++) {
		const marker = parts[i].entries.find(entry => entry.name === BACKUP_MANIFEST_FILE);
		let manifest = null;
		if (marker) {
			if (marker.size > ZIP_WRITE_METADATA_BYTES) throw new Error('The backup manifest exceeds its file-details bound.');
			manifest = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await marker.read()));
		}
		if (manifest?.set) hasSet = true; else hasOther = true;
		const key = manifest?.set ? 'set:' + manifest.set.id : 'pick:' + i;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(parts[i]);
	}
	if (!hasSet) return null;
	if (hasOther) throw new Error('Choose backup parts without other archives. Add ordinary archives separately. Nothing was imported.');
	for (const selected of groups.values()) await verifyBackupStream({parts:selected}, {partial:true});
	const out = [];
	for (let i = 0; i < parts.length; i++) for (let j = 0; j < parts[i].entries.length; j++) {
		const entry = parts[i].entries[j], bytes = await entry.read(), characterWarnings = [];
		const row = {name:entry.name, bytes, size:bytes.length, rootId:'pick:' + i, rootName:files[i].name, inputId:'pick:' + i + ':entry:' + j, expanded:true, characterWarnings};
		if (TEXT_EXT.test(row.name)) row.text = readImportText({bytes}, characterWarnings, row.name);
		Object.freeze(characterWarnings); out.push(Object.freeze(row));
	}
	out.picked = Object.freeze(files.map((file, i) => Object.freeze({rootId:'pick:' + i, name:file.name, byteLength:file.size, kind:'container'})));
	Object.freeze(out); backupSetImports.add(out); return out;
}

export const IMPORT_SOURCES = Object.freeze(['rapier', 'keep', 'markdown', 'notion', 'evernote', 'html', 'zoho', 'joplin', 'simplenote', 'standardnotes', 'code']);
export const IMPORT_MAX_ENTRIES = ZIP_MAX_ENTRIES;
export const IMPORT_MAX_BYTES = ZIP_READ_MAX_BYTES;
export const IMPORT_JSON_MAX_BYTES = 25 * 1024 * 1024;
const TEXT_EXT = /\.(?:json|md|markdown|txt|text|csv|html?|mht|mhtml|enex|xml|yaml|yml|opml)$/i;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|jxl|bmp|svg|heic|heif|avif|ico)$/i;
const CONTAINER_EXT = /\.(?:zip|textpack)$/i;
const enc = new TextEncoder();
const baseOf = name => String(name).split(/[\\/]/).pop();
const extOf = name => /\.([^./\\]+)$/.exec(String(name))?.[1].toLowerCase() || '';
const bytesOf = entry => entry?.bytes instanceof Uint8Array ? entry.bytes : entry?.bytes instanceof ArrayBuffer ? new Uint8Array(entry.bytes) : enc.encode(typeof entry?.text === 'string' ? entry.text : '');
const byteLength = entry => entry?.oversize && Number.isSafeInteger(entry.size) && entry.size >= 0 ? entry.size : bytesOf(entry).length;
const message = error => String(error?.message || error);
function archiveRefusal(error) {
	const reason = {entries: 'This archive has too many files for one import.', bytes: 'This archive opens into more data than Rapier can bring in at once.', metadata: 'This archive has more file details than Rapier can handle in one import.'}[error?.zipBudget];
	return reason ? reason + ' Nothing from this archive was imported. Keep the original ZIP. You can extract it with a ZIP tool to recover its files, but importing the notes alone does not restore their recordings or history.'
		: 'could not be read as a zip: ' + message(error);
}
const pathOK = name => typeof name === 'string' && !!name && !/[\0\r\n]/.test(name) && !/^(?:[\\/]|[a-z]:)/i.test(name) && !name.replace(/\\/g, '/').split('/').some(p => p === '..');
const sameInput = (a, b) => a.inputId && a.inputId === b.inputId;

// Metadata without a target field stays in the durable record, not invented note prose. The sheet
// shows the words, never the values: a line says where a value really is, the original export and
// this import record, because no screen shows "the receipt".
//
// A value that carries nothing is not kept: null, undefined, '', [] and {} are empty in any
// export. `unset(key, value)` is the importer's own source's word for nothing set -- what that
// app's serializer writes for an unset field, or a value the mapping already applied -- each from
// that app's own source; a value a person could have set is never one of them. `at` names the
// object inside the item, so two objects' fields never share a key. This per-note row is the
// plan's; the record names each field once per import (createImportReceipt).
const emptySourceValue = value => value === undefined || value === null || value === ''
	|| Array.isArray(value) && !value.length || object(value) && !Object.keys(value).length;
const FIELD_LABELS = {publicURL:'publishing link',collaboratorEmails:'collaborator email addresses',
	created_time:'storage creation time',updated_time:'storage edit time',deleted_time:'original deletion time',
	'reminder-order':'reminder order',protected:'protection setting'};
const fieldLabel = key => Object.hasOwn(FIELD_LABELS, key) ? FIELD_LABELS[key] : key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase();
export function importMetadata(source, represented, warnings, subject, {unset, labels = {}, at = ''} = {}) {
	if (!object(source)) return;
	// Entries, never assignment: a source key may be spelled __proto__ and is a key like any other.
	const kept = Object.entries(source).filter(([key, value]) => !represented.includes(key) && !emptySourceValue(value) && !unset?.(key, value))
		.map(([key, value]) => [at ? at + '.' + key : key, value, Object.hasOwn(labels, key) ? labels[key] : fieldLabel(key)]);
	if (kept.length) warnings.push({code: 'source_metadata', subject, fields: Object.fromEntries(kept.map(([path, value]) => [path, value])),
		labels: Object.fromEntries(kept.map(([path, , label]) => [path, label])),
		message: subject + ' not applied: ' + [...new Set(kept.map(([, , label]) => label))].join(', ') + '. Their values stay in the original export and in this import record.'});
}
// The folder cannot represent invalid or pre-epoch dates; preserve the supplied value instead.
export function importDate(value, parsed, warnings, field) {
	if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
	if (value !== undefined && value !== null && value !== '') warnings.push({code:'invalid_time', field, value,
		message: 'The ' + field + ' could not be read, so no date was set. Its value stays in the original export and in this import record.'});
	return undefined;
}
export function importClock(options) {
	return Number.isSafeInteger(options?.now) && options.now >= 0 ? options.now : Date.now();
}
export function importTrash(entry, options, warnings) {
	if (!entry.trashed) return;
	entry.trashedAt = importClock(options);
	// The recycle bin is the app's own word for Trash; its notice says "after 7 days".
	warnings.push({code: 'trash_clock', message: 'This note arrived in the recycle bin. Its 7 days there start at this import, not at its old deletion date.'});
}
// An acknowledgement belongs to the scheduled occurrence, not the wall clock of completion.
export function importAlarm(entry, at, done, warnings) {
	if (!Number.isSafeInteger(at) || at <= 0) {
		if (Number.isSafeInteger(done) && done > 0) warnings.push({code:'alarm_completion', completedAt:done,
			message:'This note was marked done with no due time, so no reminder was set. Its completion time stays in the original export and in this import record.'});
		return;
	}
	entry.remind = {at};
	if (Number.isSafeInteger(done) && done > 0) {
		entry.remindDone = at; entry.remindDoneFor = JSON.stringify(entry.remind);
		warnings.push({code: 'alarm_completion', completedAt: done, occurrenceAt: at,
			message: 'The reminder arrived already done. Its completion time stays in the original export and in this import record.'});
	}
}

// Imported words can be PLAIN TEXT, and a person's `# not a heading`, `*literal asterisks*` or `[not a link](x)`
// must read in Rapier exactly as it read in its source app. So each string is escaped for the place it lands: inline
// marks everywhere (a backslash, the emphasis, code, links, HTML and the admitted extended marks and entities), and
// at the start of a line of prose the block openers as well (a heading's hashes, a quote's bracket, a list's dash, a
// rule's dashes or equals, a fence, a table's pipe, a number followed by a dot or a bracket) plus the indentation
// that would make a code block. Nothing visible changes; the source view shows the backslashes, the page shows the
// words.
const INLINE_MARKS = /([\\*`\[\]<+~^$=])|(^|[^\p{L}\p{N}])(_)|(_)(?=$|[^\p{L}\p{N}])/gu;
// A Markdown destination is not a URL encoder: preserve separators and existing percent escapes,
// but quote Markdown delimiters and entity-looking ampersands so readers keep the exact URL.
export function literalDestination(url) {
	return String(url).replace(/[\u0000-\u0020()<>\\]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
		.replace(/&/g, '&amp;');
}
export function literalInline(text) {
	return String(text).replace(INLINE_MARKS, (m, mark, before, under, under2) =>
		mark ? '\\' + mark : under ? before + '\\_' : under2 ? '\\_' : m)
		.replace(/&(?=(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);)/g, '\\&')
		// This text may become an ATX heading. Escape every trailing hash: Pandoc still trims
	// the later hashes when only the first is escaped, though CommonMark keeps the run.
		.replace(/(^|[ \t])(#+)$/, (_, gap, hashes) => gap + hashes.replace(/#/g, '\\#'));
}
export function literalLine(line) {
	const trimmed = line.replace(/^[ \t]+/, ''), indent = line.length - trimmed.length;
	let out = literalInline(trimmed);
	// A block opener the inline pass did not already neutralise (an asterisk, a backtick or a tilde
	// at the start is escaped there, which is enough): a hash, a quote's bracket, a dash or plus, a
	// rule of dashes or equals, a table's pipe, get a backslash in front; a number's dot or bracket
	// gets it before the dot (a backslash before a digit is not an escape and would show).
	const number = /^(\d{1,9})([.)])(?:\s|$)/.exec(trimmed);
	if (number) out = number[1] + '\\' + out.slice(number[1].length);
	else if (/^(?:#{1,6}(?:\s|$)|>|[-+](?:\s|$)|(?:-{3,}|={3,})\s*$|\|)/.test(out)) out = '\\' + out;
	return (indent ? ' '.repeat(Math.min(indent, 3)) : '') + out;
}
export function literalBlock(text) { return String(text).replace(/\r\n?/g, '\n').split('\n').map(literalLine).join('\n'); }

// A markup import may receive a ZIP directly or already-expanded files from the import door.
// One owner for HTML and ENEX: a late rejected member rolls back only its own container.
export async function expandImportZips(entries) {
	const out = [];
	for (const e of entries) {
		if (e && typeof e.name === 'string' && /\.zip$/i.test(e.name) && e.bytes) {
			const start = out.length;
			try { for await (const z of readZipEntries(e.bytes)) out.push({...z, rootId: e.rootId}); }
			catch (error) { out.length = start; out.push({...e, unreadable: String(error?.message || error)}); } // no streamed members or silent success from a rejected container
		} else out.push(e);
	}
	return out;
}

export async function readJsonInputs(list, skipped) {
	const named = [];
	for (const e of list) {
		if (!e || typeof e.name !== 'string') continue;
		if (/\.zip$/i.test(e.name) && e.bytes && e.text === undefined) {
			const start = named.length;
			try {
				for await (const z of readZipEntries(e.bytes)) named.push({...z, rootId: e.rootId});
			} catch (error) { named.length = start; skipped.push({name: e.name, why: 'could not be read as a zip: ' + String((error && error.message) || error)}); }
		} else if (e.oversize || e.text !== undefined || e.bytes !== undefined) named.push({...e});
	}
	const readable = named.filter(e => { if (!e.oversize) return true; skipped.push(zipOversizeSkip(e)); return false; });
	for (const e of readable) if (/\.(?:json|txt|text)$/i.test(e.name)) {
		e.characterWarnings = [];
		try { e.text = readImportText(e, e.characterWarnings); }
		catch (error) { skipped.push({name: e.name, why: error.message}); }
	}
	return readable;
}

// A picture name unique across the whole import (bytes are written as sibling files; two different
// resources must never collide on one name). Collision counts up, exactly as noteFileName's does.
export function uniquePictureName(base, used) {
	let name = base, n = 2;
	while (used.has(name.toLowerCase())) { const dot = base.lastIndexOf('.'); name = (dot > 0 ? base.slice(0, dot) : base) + ' ' + (n++) + (dot > 0 ? base.slice(dot) : ''); }
	used.add(name.toLowerCase());
	return name;
}

// A tag another app kept for a note belongs in the note's own bytes, in the metadata block at its
// head, so the person still has it when the folder goes somewhere else. notes/frontmatter.mjs is
// the one reader and writer of that block; nothing here parses or prints one. A tag already in
// those bytes is left where it is: this is for the names that arrive beside the note, in an export's
// JSON, XML or CSV. When the module refuses the edit -- a block it cannot change without guessing at
// what is in it -- the note is imported exactly as it arrived and the names that could not be
// written are said on the note, never dropped in silence.
export function importTags(text, tags, warnings, name) {
	const source = String(text ?? ''), wanted = [], malformed = [];
	for (const tag of Array.isArray(tags) ? tags : []) {
		if (typeof tag !== 'string') continue;
		if (Array.isArray(warnings)) reportCharacterChange(tag, tag.trim(), warnings, 'tag name');
		if (!tag.trim()) continue;
		// A name carrying an unpaired surrogate is not text the module will write; it is named instead.
		(tag.isWellFormed() ? wanted : malformed).push(tag);
	}
	const say = (why, named) => { if (Array.isArray(warnings)) warnings.push({code: 'tags-unwritten', name: String(name ?? ''), message: why + ': ' + named.map(tag => tag.isWellFormed() ? tag : JSON.stringify(tag)).join(', ')}); };
	if (malformed.length) say('These tag names are not valid text, so they were not written into the note', malformed);
	if (!wanted.length) return source;
	try { return setTags(source, [...tagsOf(source), ...wanted]); }
	catch (error) {
		if (!(error instanceof RangeError)) throw error;
		say('Its metadata block could not be edited safely, so these tags were not written into the note', wanted);
		return source;
	}
}

function jsonValue(entry) {
	if (typeof entry?.text !== 'string') return {error: 'JSON is not valid UTF-8 text'};
	if (byteLength(entry) > IMPORT_JSON_MAX_BYTES) return {error: 'JSON exceeds the 25 MiB source bound'};
	try { return {value: JSON.parse(entry.text.replace(/^\uFEFF/, ''))}; }
	catch (_) { return {error: 'invalid JSON'}; }
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function jsonSource(value, name) {
	if (!object(value)) return '';
	if (Array.isArray(value.activeNotes) || Array.isArray(value.trashedNotes)) return 'simplenote';
	if (/^notes\.json$/i.test(baseOf(name)) && Number.isInteger(value.version) && object(value.notes)) return 'rapier';
	if (Array.isArray(value.items) && (!value.items.length || value.items.some(item => object(item) && typeof item.content_type === 'string'))) return 'standardnotes';
	if (typeof value.title === 'string' && (typeof value.textContent === 'string' || typeof value.textContentHtml === 'string' || Array.isArray(value.listContent) || Array.isArray(value.attachments) || typeof value.isPinned === 'boolean')) return 'keep';
	return '';
}

// Decoding retains the BOM; bytes remain authoritative even for text. A repeated call over this
// opened array keeps identities and never expands an archive a second time.
export async function openContainers(entries, limits = {}) {
	if (backupSetImports.has(entries) && limits.maxBytes === undefined && limits.maxEntries === undefined) return entries;
	const list = Array.isArray(entries) ? entries : [], out = [], picked = [];
	const maxBytes = Number.isSafeInteger(limits.maxBytes) && limits.maxBytes >= 0 ? Math.min(limits.maxBytes, IMPORT_MAX_BYTES) : IMPORT_MAX_BYTES;
	const maxEntries = Number.isSafeInteger(limits.maxEntries) && limits.maxEntries >= 0 ? Math.min(limits.maxEntries, IMPORT_MAX_ENTRIES) : IMPORT_MAX_ENTRIES;
	let total = 0, sequence = 0;
	function admit(raw, rootId, rootName, inputId) {
		const name = typeof raw?.name === 'string' ? raw.name.replace(/\\/g, '/') : String(raw?.name ?? '(unnamed input)');
		const characterWarnings = [...(raw?.characterWarnings || [])];
		const inputText = raw?.bytes === undefined && typeof raw?.text === 'string' ? keepImportCharacters(raw.text, characterWarnings, name) : raw?.text;
		const bytes = raw?.oversize ? undefined : bytesOf({...raw, text: inputText}), entry = {...raw, name, rootId, rootName, inputId, ...(bytes ? {bytes} : {}), expanded: true, characterWarnings};
		if (raw?.oversize) entry.unreadable = zipOversizeSkip(entry).why;
		if (raw?.bytes !== undefined && !(raw.bytes instanceof Uint8Array) && !(raw.bytes instanceof ArrayBuffer)) entry.unreadable ||= 'unsupported byte buffer';
		if (raw?.bytes === undefined && typeof raw?.text !== 'string') entry.unreadable ||= 'input has no text or bytes';
		if (!pathOK(name)) entry.unreadable = 'not a relative source path';
		if (++sequence > maxEntries || total + byteLength(entry) > maxBytes) entry.unreadable ||= 'import exceeds the admitted entry or byte bound';
		else total += byteLength(entry);
		if (!entry.unreadable && TEXT_EXT.test(name)) {
			try { entry.text = readImportText({bytes}, characterWarnings, name); }
			catch (_) { delete entry.text; entry.unreadable = 'no readable text'; }
		}
		out.push(entry);
	}
	for (let i = 0; i < list.length; i++) {
		const raw = list[i], name = typeof raw?.name === 'string' ? raw.name : '(unnamed input)';
		if (raw?.expanded && raw.inputId) { admit(raw, String(raw.rootId || ''), raw.rootName || name, raw.inputId); continue; }
		const bundle = /^(.*?\.textbundle)(?:[\\/]|$)/i.exec(name)?.[1];
		const container = CONTAINER_EXT.test(name) || /\.jex$/i.test(name) || Array.isArray(raw?.entries);
		const rootId = String(raw?.rootId ?? (container ? 'pick:' + i : bundle ? 'bundle:' + bundle : 'loose'));
		const rootName = raw?.rootName || (container ? name : bundle || 'picked files');
		picked.push({rootId, name, byteLength: Array.isArray(raw?.entries) ? raw.entries.reduce((sum, e) => sum + byteLength(e), 0) : byteLength(raw), kind: container ? 'container' : bundle ? 'folder member' : 'file'});
		if (Array.isArray(raw?.entries)) {
			if (!/\.textbundle\/?$/i.test(name)) { admit({...raw, unreadable: 'only textbundle folder entries are offered here'}, rootId, rootName, rootId + ':pick:' + i); continue; }
			if (!raw.entries.length) { admit({...raw, unreadable: 'empty textbundle'}, rootId, rootName, rootId + ':pick:' + i); continue; }
			for (let j = 0; j < raw.entries.length; j++) admit({...raw.entries[j], flavour: raw.entries[j]?.flavour ?? raw.flavour}, rootId, rootName, rootId + ':entry:' + j);
			continue;
		}
		if (CONTAINER_EXT.test(name)) {
			const start = out.length, priorTotal = total, priorSequence = sequence;
			try {
				let j = 0;
				const walk = walkZipEntries(bytesOf(raw), {name, wholeArchiveMarker: BACKUP_MANIFEST_FILE, maxBytes: Math.max(0, maxBytes - total), maxEntries: Math.max(0, maxEntries - sequence)});
				for (;;) {
					const step = await walk.next();
					if (step.done) {
						// Wrapper bytes and skipped members remain spent when the next picked file starts.
						total = priorTotal + step.value.inflatedBytes; sequence = priorSequence + step.value.entries;
						break;
					}
					const {archivePath, ...entry} = step.value, nested = archivePath.length > 1;
					const memberRoot = nested ? rootId + ':zip:' + JSON.stringify(archivePath.slice(1)) : rootId;
					if (entry.oversize || !entry.name.endsWith('/')) admit({...entry, ...(nested ? {archivePath} : {}), from: name, flavour: raw.flavour}, memberRoot, nested ? archivePath.join('!') : rootName, rootId + ':entry:' + j++);
				}
				if (!j) admit({...raw, unreadable: 'empty archive'}, rootId, rootName, rootId + ':pick:' + i);

			} catch (error) {
				// A later CRC refusal must not admit an earlier part of that same archive.
				out.length = start; total = priorTotal; sequence = priorSequence;
				admit({...raw, unreadable: archiveRefusal(error)}, rootId, rootName, rootId + ':pick:' + i);
			}
			continue;
		}
		admit(raw, rootId, rootName, rootId + ':pick:' + i);
	}
	out.picked = Array.isArray(entries?.picked) ? entries.picked.map(row => ({...row})) : picked;
	return out;
}

// Prefixes never decide JSON admission: the bounded full value and its shape do.
export function sourceOf(entry) {
	if (!entry || entry.unreadable || typeof entry.name !== 'string') return '';
	const name = entry.name, ext = extOf(name), text = typeof entry.text === 'string' ? entry.text : '';
	if (ext === 'enex') return 'evernote';
	if (ext === 'jex') return 'joplin';
	if (/^(?:html?|mht|mhtml)$/.test(ext)) return 'html';
	if (ext === 'znote' || ext === 'zoho') return 'zoho';
	if (ext === 'json') {
		const parsed = jsonValue(entry), source = jsonSource(parsed.value, name);
		// Known export and damaged-source grammars retain their own doors. A data file is
		// code, while package/application metadata remains an attachment to its source.
		return source || (!parsed.error && importCodeFile(entry) ? 'code' : '');
	}
	if (ext === 'txt' || ext === 'text') {
		if (/^\s*\uFEFF?\s*\{/.test(text)) { const found = jsonSource(jsonValue(entry).value, name); if (found) return found; }
		return 'markdown';
	}
	if (ext === 'md' || ext === 'markdown') {
		const normal = text.replace(/\r\n?/g, '\n');
		const id = /\nid: ([0-9a-f]{32})\n/i.exec(normal + '\n')?.[1];
		if (id && baseOf(name).replace(/\.[^.]+$/, '').toLowerCase() === id.toLowerCase()
			&& /\n(?:id|parent_id|type_): [^\n]*\n(?:[a-z_]+: [^\n]*\n)*$/.test(normal.replace(/\n*$/, '\n')) && /\ntype_: \d+\n/.test(normal + '\n')) return 'joplin';
		return /[0-9a-f]{32}$/i.test(baseOf(name).replace(/\.[^.]+$/, '')) ? 'notion' : 'markdown';
	}
	if (ext === 'csv' && /[0-9a-f]{32}/i.test(baseOf(name))) return 'notion';
	if (IMAGE_EXT.test(name)) return 'picture';
	return importCodeFile(entry) ? 'code' : '';
}

function importCodeFile(entry) {
	const name = entry.name;
	return isCodeFile(baseOf(name)) && !/(^|\/)(\.obsidian|\.trash|__MACOSX)(\/|$)/i.test(name)
		&& !(baseOf(name).toLowerCase() === 'info.json' && /\.text(?:bundle|pack)(?:\/|$)/i.test(name + '/' + (entry.rootName || '')));
}
function importCode(entries, {lastOrder = ''} = {}) {
	const notes = [];
	for (const entry of entries) {
		const bytes = bytesOf(entry), file = codeFileName(baseOf(entry.name), notes.map(note => note.file));
		if (!file) throw new Error('This source filename cannot be kept as code.');
		lastOrder = orderAfter(lastOrder);
		// Text is a display projection only: a decoder can never replace the authoritative bytes.
		let text; const warnings = [];
		try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
		catch (_) { text = new TextDecoder('utf-8', {ignoreBOM: true}).decode(bytes); warnings.push({code: 'code-text-unreadable', message: 'The code file was kept byte for byte. Its encoding is not UTF-8, so text editing and text history are unavailable; keep the original file.'}); }
		notes.push({file, sourceName: entry.name, rootId: entry.rootId, bytes, text, warnings,
			entry: {order: lastOrder, pinned: false, skill: false, archived: false, trashed: false, colour: ''}});
	}
	return {notes};
}

// A family runs once per root when cross-note metadata matters. Self-contained export payloads
// run separately, so an importer that reads one JSON cannot silently swallow a second JSON.
function simplenoteTwins(entries, classified) {
	const twins = new Map();
	for (const entry of entries) {
		if (classified.get(entry) !== 'simplenote' || !/(?:^|\/)source\/notes\.json$/i.test(entry.name)) continue;
		const source = jsonValue(entry).value, prefix = entry.name.replace(/source\/notes\.json$/i, '');
		for (const [key, directory] of [['activeNotes', ''], ['trashedNotes', 'trash/']]) {
			const names = new Map();
			for (const note of Array.isArray(source?.[key]) ? source[key] : []) {
				if (typeof note?.content !== 'string' || note.tags != null && (!Array.isArray(note.tags) || note.tags.some(tag => typeof tag !== 'string'))) continue;
				let text = note.content;
				if (note.tags) {
					const lines = []; let line = '';
					for (const tag of note.tags) {
						if (line.length + tag.length > 75) { lines.push(line); line = tag; }
						else line += ', ' + tag;
					}
					lines.push(line);
					text += '\n\nTags:\n  ' + lines.map(value => value.replace(/^, /, '')).join('\n  ');
				}
				// Native export uses sanitize-filename, its first usable line, then 40 UTF-16
				// units and duplicate counters. Exact path AND text prove a twin, never its
				// directory alone; a separate picked .txt keeps its own words.
				const title = text.split('\n').map(value => value.trim()
					.replace(/[<>:"/\\|?*\u0000-\u001f\u0080-\u009f]/g, '')
					.replace(/^\.+$|^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i, '')
					.replace(/[. ]+$/, '')).find(Boolean)?.slice(0, 40) || 'untitled';
				const count = names.get(title) || 0; names.set(title, count + 1);
				// A 40-unit cut can split an astral character. ZIP UTF-8 writes that lone
				// surrogate as U+FFFD, while the full body remains exact in JSON and TXT.
				const name = (prefix + directory + title + (count ? ' (' + count + ')' : '') + '.txt').toWellFormed();
				if (!twins.has(name)) twins.set(name, new Set());
				twins.get(name).add(text);
			}
		}
	}
	return entry => twins.get(entry.name)?.has(entry.text) === true;
}

export function sniff(entries) {
	const roots = new Map(), batches = [], unread = [], attachments = [];
	for (const entry of entries || []) {
		const rootId = String(entry.rootId || '');
		if (!roots.has(rootId)) roots.set(rootId, []);
		roots.get(rootId).push(entry);
	}
	for (const [rootId, root] of roots) {
		if (root.some(e => e.name === BACKUP_MANIFEST_FILE)) {
			// A self-asserted manifest cannot readmit a member refused by the common input door.
			const refused = root.find(e => e.unreadable);
			if (refused) for (const e of root) unread.push({...e, why: refused.unreadable});
			else {
				const setId = backupSetId(root), held = setId && batches.find(batch => batch.source === 'rapier' && batch.setId === setId);
				if (held) { held.entries.push(...root); held.primary.push(...root); }
				else batches.push({source: 'rapier', rootId, setId, entries: root.slice(), primary: root.slice()});
			}
			continue;
		}
		const list = root.filter(e => !e.oversize);
		for (const entry of root) if (entry.oversize) unread.push({...entry, why: entry.unreadable || zipOversizeSkip(entry).why});
		const classified = new Map(list.map(e => [e, sourceOf(e)]));
		if (list.some(e => classified.get(e) === 'rapier')) {
			const refused = list.find(e => e.unreadable);
			if (refused) for (const e of list) unread.push({...e, why: refused.unreadable});
			else batches.push({source: 'rapier', rootId, entries: list, primary: list});
			continue;
		}
		const shared = list.filter(e => classified.get(e) === 'picture' || (!classified.get(e) && !e.unreadable));
		const simpleTwin = simplenoteTwins(list, classified);
		const standard = list.filter(e => classified.get(e) === 'standardnotes').flatMap(e => {
			const items = jsonValue(e).value?.items;
			return Array.isArray(items) ? items : [];
		});
		const standardTwin = e => {
			const match = /(?:^|\/)Items\/([^/]+)\/[^/]*-([0-9a-f]{8})\.txt$/i.exec(e.name);
			if (!match || typeof e.text !== 'string') return false;
			return standard.some(item => item?.content_type === match[1] && item.uuid?.split('-')[0] === match[2] &&
				(item.content_type === 'Note' ? typeof item.content?.text === 'string' && item.content.text === e.text :
					JSON.stringify(jsonValue(e).value) === JSON.stringify(item.content)));
		};
		for (const e of list) {
			let source = classified.get(e);
			const twin = source === 'markdown' && (simpleTwin(e) || standardTwin(e));
			const htmlTwin = source === 'html' && list.some(j => classified.get(j) === 'keep' && j.name.replace(/\.json$/i, '') === e.name.replace(/\.html?$/i, ''));
			if (twin || htmlTwin) { unread.push({...e, why: 'duplicate text representation; the richer JSON in this root is authoritative'}); continue; }
			if (!source || source === 'picture') {
				if (e.unreadable) unread.push({...e, why: e.unreadable});
				else attachments.push(e);
				continue;
			}
			if (['keep', 'simplenote', 'standardnotes', 'evernote', 'html', 'zoho'].includes(source) || /\.jex$/i.test(e.name)) {
				batches.push({source, rootId, entries: [e, ...shared.filter(p => p !== e)], primary: [e], single: true});
				continue;
			}
			let batch = batches.find(b => b.source === source && b.rootId === rootId && !b.single);
			if (!batch) { batch = {source, rootId, entries: [], primary: []}; batches.push(batch); }
			batch.entries.push(e); batch.primary.push(e);
		}
		for (const batch of batches.filter(b => b.rootId === rootId && ['markdown', 'notion', 'joplin'].includes(b.source))) {
			for (const e of shared) if (!batch.entries.includes(e)) batch.entries.push(e);
		}
	}
	batches.sort((a, b) => IMPORT_SOURCES.indexOf(a.source) - IMPORT_SOURCES.indexOf(b.source));
	return {batches, unread, attachments};
}

function sectionNames(options) { return (options.sections || options.index?.sections || []).map(s => typeof s === 'string' ? s : s?.name).filter(Boolean); }
function lastKeyOf(notes, fallback) { return notes.reduce((last, note) => typeof note.entry?.order === 'string' && note.entry.order > last ? note.entry.order : last, fallback); }
function skippedRow(entry, why, attachment = false) { if (entry.oversize) return {...zipOversizeSkip(entry), inputId:entry.inputId, why}; return {rootId: entry.rootId, inputId: entry.inputId, name: entry.name, byteLength: byteLength(entry), why, ...(attachment ? {attachment: true, bytes: entry.bytes, retainedIn: 'source input'} : {})}; }

export async function importAny(entries, options = {}, importers = {}) {
	const now = importClock(options);
	const opened = await openContainers(entries, options), {batches, unread} = sniff(opened);
	const existing = (Array.isArray(options.existing) ? options.existing : Object.keys(options.index?.notes || {})).filter(n => typeof n === 'string');
	const attachmentSources = [];
	const warnings = [], notes = [], skipped = unread.map(e => skippedRow(e, e.why)), pictures = [], sections = [], sources = {}, unoffered = [], backups = [], backupFiles = [], sectionsAdded = [];
	// Recordings an importer lands come back beside its notes, named against one growing pool, so
	// two exports in a single pick cannot claim the same sibling file.
	const audio = [], audioPool = [...(Array.isArray(options.audioExisting) ? options.audioExisting : [])];
	const consumed = new Map(), refused = new Map(unread.map(e => [e.inputId, e.why]));
	const spelling = new Map(sectionNames(options).map(name => [name.toLowerCase(), name]));
	let lastOrder = options.lastOrder || '', backupIndex = options.index;
	let backupIndexComplete = !!options.index || !existing.length;
	function admitSection(raw) {
		const name = typeof raw === 'string' ? raw : raw?.name;
		if (!name) return;
		const key = name.toLowerCase();
		if (!spelling.has(key)) spelling.set(key, name);
		const canonical = spelling.get(key);
		if (!sections.includes(canonical)) sections.push(canonical);
	}
	function recordConsumed(inputId, note) { if (!consumed.has(inputId)) consumed.set(inputId, []); if (note) consumed.get(inputId).push(note); }
	for (const batch of batches) {
		const {source, rootId, primary} = batch;
		const fn = source === 'rapier' ? addBackup : source === 'code' ? importCode : typeof importers[source] === 'function' ? importers[source] : null;
		if (!fn) {
			if (!unoffered.includes(source)) unoffered.push(source);
			for (const e of primary) { const why = 'no importer for ' + source + ' in this build'; skipped.push(skippedRow(e, why)); refused.set(e.inputId, why); }
			continue;
		}
		let result;
		try {
			// JSON permits one opening BOM at admission; converter text is a projection, never a
			// mutation of the original input bytes or of a Markdown body.
			const input = ['keep', 'simplenote', 'standardnotes'].includes(source)
				// Unknown JSON beside a recognised export is an attachment, not another payload of
				// that family. It keeps its own receipt row, rather than being recovered repeatedly
				// once by each unrelated JSON importer in the same root.
				? batch.entries.filter(e => primary.includes(e) || extOf(e.name) !== 'json').map(e => primary.includes(e) && typeof e.text === 'string' ? {...e, text: e.text.replace(/^\uFEFF/, '')} : e) : batch.entries;
			result = await fn(input, {existing: source === 'rapier' ? [...existing, ...backupFiles.map(f => f.name)] : [], index: source === 'rapier' ? backupIndex : undefined,
				lastOrder, rootId, now, sections: sectionNames(options), flavour: options.flavour, subtle: options.subtle, audioExisting: audioPool});
		} catch (error) {
			for (const e of primary) { const why = 'the ' + source + ' importer failed: ' + message(error); skipped.push(skippedRow(e, why)); refused.set(e.inputId, why); }
			continue;
		}
		for (const warning of result?.warnings || []) warnings.push({...warning, rootId, source});
		const got = (Array.isArray(result?.notes) ? result.notes : []).map(n => ({...n, entry: {...n.entry}, text: typeof n.text === 'string' ? n.text : String(n.source ?? ''), rootId,
			sourceName: n.sourceName || n.sourcePath || (primary.length === 1 ? primary[0].name : n.file), ...(source === 'rapier' ? {exactBackup: true} : {})}));
		// Verified backup paths are unique; do not scan the complete library for every note.
		const backupInputs = source === 'rapier' ? new Map(primary.map(e => [e.name, e])) : null;
		for (const n of got) {
			const inputs = backupInputs ? (backupInputs.has(n.sourceName) ? [backupInputs.get(n.sourceName)] : []) : primary.filter(e => e.name === n.sourceName || (n.sourceInputId && e.inputId === n.sourceInputId));
			if (!inputs.length && primary.length === 1) inputs.push(primary[0]);
			n.sourceInputIds = inputs.map(e => e.inputId);
			n.warnings = [...(n.warnings || []), ...(source === 'code' ? [] : inputs.flatMap(e => e.characterWarnings || []))];
			for (const e of inputs) recordConsumed(e.inputId, n);
			if (n.entry.category) { admitSection(n.entry.category); n.entry.category = spelling.get(n.entry.category.toLowerCase()); }
			notes.push(n);
		}
		for (const row of result?.audio || []) { if (!row?.name || audioPool.some(n => n.toLowerCase() === String(row.name).toLowerCase())) continue; audio.push({...row, rootId}); audioPool.push(row.name); }
		sources[source] = (sources[source] || 0) + got.length;
		lastOrder = lastKeyOf(got, lastOrder);
		for (const raw of result?.sections || []) admitSection(raw);
		for (const row of result?.consumed || []) {
			const name = typeof row === 'string' ? row : row.name;
			for (const e of primary.filter(e => e.name === name)) for (const n of got) recordConsumed(e.inputId, n);
		}
		for (const row of result?.skipped || []) {
			const matching = batch.entries.filter(e => e.name === row.name);
			const canonical = matching.length === 1 ? matching[0] : null;
			const normalized = {...row, rootId, ...(canonical ? {inputId: canonical.inputId, byteLength: byteLength(canonical)} : {})};
			const attachment = row.attachment || (canonical && !primary.includes(canonical));
			if (attachment && canonical) Object.assign(normalized, {attachment: true, bytes: canonical.bytes, retainedIn: 'source input'});
			skipped.push(normalized);
			if (canonical && !attachment) refused.set(canonical.inputId, row.why || 'the importer refused this input');
		}
		for (const row of [...(result?.attachments || []), ...(result?.skipped || []).filter(row => row.attachment && row.bytes)]) {
			const name = row.sourceName || row.name, original = batch.entries.filter(e => e.name === name);
			attachmentSources.push({...row, retainUnlinked: true, sourceName: name, rootId, ...(original.length === 1 ? {inputId: original[0].inputId} : {})});
		}
		for (const p of result?.pictures || []) {
			const name = p.sourceName || p.name, candidates = batch.entries.filter(e => e.name === name);
			const original = candidates.length === 1 ? candidates[0] : null;
			pictures.push({...p, name, sourceName: name, rootId, ...(original ? {inputId: original.inputId, bytes: original.bytes} : {})});
		}
		if (source === 'rapier') {
			backups.push(...(result.backups || [])); backupFiles.push(...(result.files || [])); sectionsAdded.push(...(result.sectionsAdded || []));
			backupIndex = result.index;
			backupIndexComplete = backupIndexComplete && result.indexComplete !== false;
			const mappedFiles = new Map((result.fileMap || []).map(row => [row.sourcePath, row]));
			for (const e of primary) {
				const mapped = mappedFiles.get(e.name);
				if (mapped) recordConsumed(e.inputId, {file: mapped.file});
				else if (e.name === 'notes.json' || e.name === 'rapier-backup.json') recordConsumed(e.inputId, {file: 'notes.json'});
			}
		}
	}
	// A syntactically damaged JSON file has no trustworthy export shape. Keep its readable
	// source as one explicitly labelled note, once, rather than guessing a family or attaching
	// it to every other export. Valid unsupported JSON and deliberate bounds remain refusals.
	for (const e of opened) if (!e.unreadable && extOf(e.name) === 'json' && !consumed.has(e.inputId) && !refused.has(e.inputId)) {
		const parsed = jsonValue(e);
		if (!parsed.error || /bound|25 MiB/.test(parsed.error) || typeof e.text !== 'string') continue;
		const note = literalImportSource(e, [...existing, ...notes.map(n => n.file)], 'JSON structure is damaged; the export family could not be identified safely.', [...(e.characterWarnings || [])], 'json');
		note.sourceInputIds = [e.inputId]; note.rootId = e.rootId;
		lastOrder = orderAfter(lastOrder); note.entry.order = lastOrder;
		notes.push(note); recordConsumed(e.inputId, note); sources.markdown = (sources.markdown || 0) + 1;
	}
	// Original inputs win metadata about themselves; duplicate paths remain distinct candidates.
	// Provenance belongs to the note, so the recent-receipt window cannot make the same export
	// create duplicates later. Hash exact admitted inputs, their namespaces and the chosen grammar;
	// neither a title nor equality with today's edited body is proof of a previous import.
	if (notes.length && !backups.length) {
		const members = new Map();
		for (const row of opened) { if (!members.has(row.rootId)) members.set(row.rootId, []); members.get(row.rootId).push(row); }
		const roots = new Map(), copies = new Map();
		for (const [id, rows] of members) {
			const key = JSON.stringify([rows[0].rootName || '', (await Promise.all(rows.map(async row => JSON.stringify([row.name, row.flavour || '', row.unreadable || '', await sha256(bytesOf(row))])))).sort()]);
			const ordinal = copies.get(key) || 0; copies.set(key, ordinal + 1);
			roots.set(id, await sha256(enc.encode(JSON.stringify([key, ordinal]))));
		}
		const source = await sha256(enc.encode(JSON.stringify([options.flavour || '', [...roots.values()].sort()]))), items = new Map();
		for (const note of notes) {
			const key = JSON.stringify([source, roots.get(note.rootId), note.sourceName, note.sourceItem || '']), ordinal = items.get(key) || 0;
			items.set(key, ordinal + 1); note.entry.importSource = await sha256(enc.encode(JSON.stringify([key, ordinal])));
		}
		const prior = new Set(Object.values(options.index?.notes || {}).map(entry => entry.importSource));
		const repeated = notes.filter(note => prior.has(note.entry.importSource));
		if (repeated.length) {
			const complete = repeated.length === notes.length;
			const result = {notes: [], fileMap: [], warnings: [], skipped: complete ? [] : opened.picked.map(row => ({name: row.name, rootId: row.rootId,
				why: 'Part of this exact export is already in this folder. Nothing was imported; keep the export and review the earlier import before adding it again.'})),
				sections: [], sectionsAdded: [], pictures: [], audio: [], attachments: [], sources: {}, unoffered: [], picked: opened.picked, accounting: [], backups: [], backupFiles: [],
				alreadyImported: complete, repeatConflict: !complete, repeatedNotes: repeated.length};
			result.receipt = createImportReceipt(result, {stamp: options.stamp ?? null, id: options.id ?? null});
			return result;
		}
	}
	for (const e of opened) if (IMAGE_EXT.test(e.name) && !e.unreadable && !pictures.some(p => sameInput(p, e))) pictures.push({...e, sourceName: e.name});
	const uniquePictures = pictures.filter((p, i) => !p.inputId || pictures.findIndex(q => sameInput(p, q)) === i);
	const embeddedPicturePaths = new Set();
	const final = finalizeImport(notes, {existing, ascii: options.ascii === true});
	for (let i = 0; i < final.notes.length; i++) {
		let note = final.notes[i];
		if (note.exactBackup || isCodeFile(note.file)) continue;
		if (typeof options.pictureImporter === 'function') {
			try {
				const result = await options.pictureImporter(note.text, {rootId: note.rootId, sourceName: note.sourceName, pictures: uniquePictures, convert: options.convertPicture});
				const text = typeof result?.text === 'string' ? result.text : note.text;
				note = {...note, text, ...(text !== note.text ? {bytes: enc.encode(text)} : {}), warnings: [...(note.warnings || []), ...(result.warnings || [])], unresolvedPictures: result.unresolved || [], embeddedPictures: result.embedded || []};
				for (const embedded of result.embedded || []) embeddedPicturePaths.add(JSON.stringify([embedded.rootId || '', embedded.name]));
				for (const embedded of result.embedded || []) for (const p of uniquePictures.filter(p => p.rootId === embedded.rootId && p.name === embedded.name)) if (p.inputId) recordConsumed(p.inputId, note);
			} catch (error) { note = {...note, warnings: [...(note.warnings || []), {code: 'pictures-unconverted', message: 'Picture conversion failed; original references retained: ' + message(error)}]}; }
		} else {
			const unresolvedPictures = scanLinks(note.text).filter(link => link.image && (link.kind !== 'embed' || IMAGE_EXT.test(link.dest)) && !resolveAssetPath(note.sourceName, link.dest).outside).map(link => ({dest: link.dest, start: link.start, end: link.end, reason: 'picture embedding was not provided'}));
			if (unresolvedPictures.length) note = {...note, unresolvedPictures};
		}
		final.notes[i] = note;
	}
	const backupRoots = new Set(batches.filter(batch => batch.source === 'rapier').flatMap(batch => batch.entries.map(entry => entry.rootId)));
	const rawObjects = opened.filter(row => !backupRoots.has(row.rootId)).map(row => ({...row,
		retainUnlinked: !consumed.has(row.inputId) && (!sourceOf(row) || sourceOf(row) === 'picture')
	}));
	const attached = importAttachments(final.notes, [...rawObjects, ...uniquePictures.filter(p => !backupRoots.has(p.rootId)).map(p => ({...p, retainUnlinked: !embeddedPicturePaths.has(JSON.stringify([p.rootId || '', p.sourceName || p.name]))})), ...attachmentSources], {
		existing: [...(options.attachmentExisting || []), ...backupFiles.filter(row => row.name.startsWith('attachments/')).map(row => row.name.slice(12))], ascii: options.ascii === true
	});
	final.notes = attached.notes.map(note => {
		if (!note.unresolvedLinks?.length) return note;
		// The note-link pass ran before media relocation. A consumed source reference is no
		// longer missing; unchanged failures still have their live destination in the note.
		const links = scanLinks(note.text), copied = new Set((note.linkedAttachments || []).map(attachmentHref));
		const unresolvedLinks = note.unresolvedLinks.filter(row => links.some(link => link.dest === row.dest && (link.anchor || '') === (row.anchor || '') && !copied.has(link.dest)));
		return {...note, unresolvedLinks};
	});
	for (const row of attached.unread) skipped.push({name: row.object.sourceName, rootId: row.object.rootId, inputId: row.object.inputId, attachment: true, why: row.why + ' Keep the original source file.'});
	for (const row of attached.used) if (row.object.inputId) recordConsumed(row.object.inputId, {file: row.file});
	const mappedNotes = new Map(notes.map((note, i) => [note, final.notes[i]]));
	const accounting = opened.map(e => {
		const got = (consumed.get(e.inputId) || []).map(n => mappedNotes.get(n) || n);
		const files = [...new Set(got.map(n => n.file))];
		if (files.length || consumed.has(e.inputId)) return {rootId: e.rootId, inputId: e.inputId, name: e.name, byteLength: byteLength(e), status: 'imported', files};
		if (refused.has(e.inputId)) return {rootId: e.rootId, inputId: e.inputId, name: e.name, byteLength: byteLength(e), status: 'refused', why: refused.get(e.inputId)};
		let why = attached.unread.find(row => row.object.inputId === e.inputId)?.why || 'attachment was not copied; keep the source input';
		if (IMAGE_EXT.test(e.name)) why = 'picture bytes retained; no verified embedded use was produced';
		else if (sourceOf(e)) why = 'the export contained no imported note from this input';
		else if (extOf(e.name) === 'json') why = jsonValue(e).error || 'JSON is not a supported export shape';
		const attachment = !sourceOf(e);
		if (!skipped.some(s => s.inputId === e.inputId)) skipped.push(skippedRow(e, why, attachment || IMAGE_EXT.test(e.name)));
		return {rootId: e.rootId, inputId: e.inputId, name: e.name, byteLength: byteLength(e), status: attachment || IMAGE_EXT.test(e.name) ? 'attachment' : 'refused', why};
	});
	const copiedInputs = new Set(attached.used.map(row => row.object.inputId).filter(Boolean));
	const outcomes = new Map(accounting.map(row => [row.inputId, row])), inputRows = new Set(), reported = [];
	for (const row of skipped) {
		const outcome = outcomes.get(row.inputId);
		if (outcome?.status === 'imported') {
			if (copiedInputs.has(row.inputId)) continue; // Its bytes were kept; a converter's earlier resource refusal is no longer the outcome.
			for (const note of final.notes.filter(n => outcome.files.includes(n.file))) note.warnings = [...(note.warnings || []), {code: 'partial-source-import', sourceName: row.name, message: row.why}];
			continue;
		}
		if (row.inputId && inputRows.has(row.inputId)) continue;
		if (row.inputId) inputRows.add(row.inputId);
		reported.push(outcome?.status === 'attachment' ? {...row, why: outcome.why, attachment: true, bytes: opened.find(e => e.inputId === row.inputId)?.bytes, retainedIn: 'source input'} : row);
	}
	const result = finishImportCharacters({...final, warnings, skipped: reported, sections, sectionsAdded, pictures: uniquePictures, audio, attachments: attached.attachments, sources, unoffered, picked: opened.picked, accounting, backups, backupFiles});
	if (backups.length && backupIndex) { result.backupIndex = backupIndex; result.backupIndexComplete = backupIndexComplete; }
	result.receipt = createImportReceipt(result, {stamp: options.stamp ?? null, id: options.id ?? null});
	return result;
}
// Importers project content and metadata; this is the only allocation accepted by the write shell.
export function finalizeImport(notes, {existing = [], ascii = false} = {}) {
	const pool = [...existing], occupied = new Set(pool);
	const noteNames = new Set(pool.map(file => file.toLowerCase()));
	const codeNames = new Set(pool.map(file => String(file).normalize('NFC').toLowerCase()));
	const planned = (notes || []).map(note => {
		const sourceName = note.sourceName || note.sourcePath || note.file;
		const title = typeof note.title === 'string' && note.title ? '# ' + note.title : note.text;
		const code = isCodeFile(note.file);
		// The naming owner still chooses every spelling. Most batch members need no suffix;
		// only a collision needs the growing pool and the owner's existing numbering rule.
		let file = note.exactBackup ? note.file : code ? codeFileName(note.file, [], {ascii}) : noteFileName(title, [], {ascii});
		if (!note.exactBackup && file && (code ? codeNames.has(file.normalize('NFC').toLowerCase()) : noteNames.has(file.toLowerCase())))
			file = code ? codeFileName(note.file, pool, {ascii}) : noteFileName(title, pool, {ascii});
		if (!file) throw new Error('import filename cannot keep its code type: ' + note.file);
		if (occupied.has(file)) throw new Error('import would replace occupied file: ' + file);
		pool.push(file); occupied.add(file); noteNames.add(file.toLowerCase()); codeNames.add(file.normalize('NFC').toLowerCase());
		return {...note, entry: {...note.entry}, file, sourceName, rootId: String(note.rootId || '')};
	});
	const fileMap = planned.map(n => ({rootId: n.rootId, sourceName: n.sourceName, file: n.file, sourceAliases: [...(n.sourceAliases || [])]}));
	// Exact backups never use rewritten links; do not run and discard that quadratic work.
	const patches = importLinkPatches(planned.filter(n => !n.exactBackup && !isCodeFile(n.file)), fileMap); let nextPatch = 0;
	return {notes: planned.map(n => {
		if (n.exactBackup || isCodeFile(n.file)) return n;
		const p = patches[nextPatch++];
		return {...n, text: p.text, ...(p.changed.length ? {bytes: new TextEncoder().encode(p.text)} : {}), changedLinks: p.changed, unresolvedLinks: p.unresolved};
	}), fileMap};
}
