import {parseFrontMatter, stripFrontMatter, tagsOf, setTags} from './frontmatter.mjs';
import {stripInkMarkers} from '../spec/md-marks.mjs';
import {markdownParser} from '../spec/md-assets.mjs';
function frontLineCount(pieces, raw, body) {
	if (body.length >= raw.length) return 0;
	const hidden = raw.length - body.length;
	let at = 0, n = 0;
	for (const piece of pieces) { if (at >= hidden) break; at += piece.length; n++; }
	return n;
}

export const NOTES_INDEX_FILE = 'notes.json';
export const NOTES_INDEX_VERSION = 1;

let characterSegmenter;
export function graphemes(text) { return (characterSegmenter ||= new Intl.Segmenter(undefined, {granularity: 'grapheme'})).segment(text); }
export function cutText(text, limit, maxUnits = Infinity) {
	if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('A text limit must be a non-negative safe integer.');
	text = String(text);
	if (text.length <= limit && text.length <= maxUnits) return text;
	let end = 0, count = 0;
	for (const point of text) { if (count++ === limit || end + point.length > maxUnits) break; end += point.length; }
	if (end < text.length && typeof Intl.Segmenter === 'function') end = graphemes(text).containing(end).index;
	return text.slice(0, end);
}

export const NOTES_ATTACHMENT_DIR = 'attachments';
export function isAttachmentName(name) {
	return typeof name === 'string' && !!name && name.isWellFormed() && !name.startsWith('.')
		&& !/[\/\\<>:"|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)
		&& !/[ .]$/.test(name) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
export function attachmentFileName(wanted, existing = [], {ascii = false} = {}) {
	let base = String(wanted || 'File').toWellFormed().normalize('NFC')
		.replace(/[\/\\<>:"|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '_')
		.replace(/^\.+/, '').replace(/[ .]+$/, '');
	if (ascii) base = base.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7e]/g, '_');
	if (!base) base = 'File';
	if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = 'File ' + base;
	const dot = base.lastIndexOf('.'), ext = dot > 0 && base.length - dot <= 24 ? base.slice(dot) : '';
	let stem = ext ? base.slice(0, -ext.length) : base;
	while (new TextEncoder().encode(stem + ext).length > 200) stem = stem.slice(0, graphemes(stem).containing(stem.length - 1).index);
	stem = stem.replace(/[ .]+$/, '') || 'File';
	const taken = new Set(existing.map(name => String(name).normalize('NFC').toLowerCase()));
	let name = stem + ext, n = 2;
	while (taken.has(name.normalize('NFC').toLowerCase())) name = stem + ' ' + n++ + ext;
	if (!isAttachmentName(name)) throw new Error('This file needs a portable attachment name.');
	return name;
}
export const NOTE_COLOURS = Object.freeze(['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown']);

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const D = DIGITS.length;
export function orderMidpoint(a = '', b = '') {
	if (b && a >= b) throw new Error('orderMidpoint: a must be below b');
	let out = '';
	for (let i = 0; ; i++) {
		const ca = i < a.length ? DIGITS.indexOf(a[i]) : 0;
		const cb = i < b.length ? DIGITS.indexOf(b[i]) : D;
		if (ca < 0 || (i < b.length && cb < 0)) throw new Error('orderMidpoint: not a key');
		if (cb - ca > 1) return out + DIGITS[Math.floor((ca + cb) / 2)];
		out += DIGITS[ca];
		if (cb - ca === 1) { b = ''; continue; }
	}
}
export function orderFirst() { return 'V'; }
function orderStep(key, up) {
	const digits = [...key].map(c => DIGITS.indexOf(c)), edge = up ? D - 1 : 0;
	if (!digits.length || digits.includes(-1)) throw new Error('orderStep: not a key');
	for (;;) {
		let i = digits.length - 1;
		while (i >= 0 && digits[i] === edge) digits[i--] = D - 1 - edge;
		if (i < 0) break;
		digits[i] += up ? 1 : -1;
		if (digits.at(-1) !== 0) return digits.map(d => DIGITS[d]).join('');
	}
	const grow = Math.min(key.length, 8);
	if (up) return key + '0'.repeat(grow - 1) + '1';
	return /^0+$/.test(key) ? orderMidpoint('', key) : '0'.repeat(key.length) + 'z'.repeat(grow);
}
export function orderBefore(first) { return orderStep(first, false); }
export function orderAfter(last) { return last ? orderStep(last, true) : orderFirst(); }

export function emptyIndex() { return {version: NOTES_INDEX_VERSION, notes: {}, sections: [], collapsed: {skills: true, pinned: false, others: false, archive: true, trash: true}}; }

const BUILTIN_SECTION_NAMES = ['skills', 'pinned', 'other', 'others', 'archive', 'archived', 'trash', 'deleted'];
export function isBuiltinSectionName(name) { return typeof name === 'string' && BUILTIN_SECTION_NAMES.includes(name.trim().toLowerCase()); }

const REMIND_REPEATS = ['daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom'];
const REMIND_MAX_DATE = 8_640_000_000_000_000, REMIND_MAX_STEP = 2_147_483_647;
export function cleanRemind(raw) {
	if (!raw || typeof raw !== 'object') return null;
	if (!Number.isSafeInteger(raw.at) || raw.at < 1 || raw.at > REMIND_MAX_DATE) return null;
	const repeat = raw.repeat;
	if (repeat !== undefined && !REMIND_REPEATS.includes(repeat)) return null;
	if (repeat === 'custom' && (!['days', 'weeks', 'months', 'years'].includes(raw.unit) || !Number.isSafeInteger(raw.every) || raw.every < 1 || raw.every > Math.floor(REMIND_MAX_STEP / (raw.unit === 'weeks' ? 7 : raw.unit === 'years' ? 12 : 1)))) return null;
	if (raw.snoozeMinutes !== undefined && (!Number.isSafeInteger(raw.snoozeMinutes) || raw.snoozeMinutes < 1 || raw.snoozeMinutes > REMIND_MAX_STEP)) return null;
	return {at: raw.at, ...(repeat === 'custom' ? {every: raw.every} : {}), ...(repeat ? {repeat} : {}),
		...(raw.snoozeMinutes !== undefined ? {snoozeMinutes: raw.snoozeMinutes} : {}), ...(repeat === 'custom' ? {unit: raw.unit} : {})};
}
export function cleanAgent(raw) {
	if (!raw || typeof raw !== 'object' || typeof raw.by !== 'string' || !raw.by.trim() || raw.by.length > 64 || !Number.isSafeInteger(raw.at) || raw.at < 0) return null;
	return {by: raw.by.trim(), at: raw.at};
}
export function validNoteId(id) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id.slice(id.lastIndexOf(':') + 1))); }
function cleanEntry(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const entry = {};
	const known = new Set(['id', 'revision', 'order', 'pinned', 'skill', 'archived', 'trashed', 'trashedAt', 'colour', 'category', 'remind', 'remindDone', 'remindDoneFor', 'remindSnoozedUntil', 'remindAction', 'modified', 'created', 'agent']);
	if (raw.id !== undefined && !validNoteId(raw.id)) throw Object.assign(new Error('invalid note identity'), {code: 'corrupt'});
	if (raw.revision !== undefined && (typeof raw.revision !== 'string' || !raw.revision)) throw Object.assign(new Error('invalid note revision'), {code: 'corrupt'});
	if (raw.id !== undefined) entry.id = raw.id;
	if (raw.revision !== undefined) entry.revision = raw.revision;
	entry.order = typeof raw.order === 'string' && /^[0-9A-Za-z]+$/.test(raw.order) ? raw.order : '';
	entry.pinned = raw.pinned === true;
	entry.skill = raw.skill === true;
	entry.archived = raw.archived === true;
	entry.trashed = raw.trashed === true;
	if (Number.isInteger(raw.trashedAt) && raw.trashedAt >= 0) entry.trashedAt = raw.trashedAt;
	entry.colour = NOTE_COLOURS.includes(raw.colour) ? raw.colour : '';
	if (typeof raw.category === 'string') entry.category = raw.category;
	const remind = cleanRemind(raw.remind);
	if (remind) entry.remind = remind;
	if (Number.isInteger(raw.remindDone) && raw.remindDone >= 0) entry.remindDone = raw.remindDone;
	if (typeof raw.remindDoneFor === 'string') entry.remindDoneFor = raw.remindDoneFor;
	if (Number.isSafeInteger(raw.remindSnoozedUntil) && raw.remindSnoozedUntil >= 0 && raw.remindSnoozedUntil <= REMIND_MAX_DATE) entry.remindSnoozedUntil = raw.remindSnoozedUntil;
	if (typeof raw.remindAction === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(raw.remindAction)) entry.remindAction = raw.remindAction;
	if (Number.isFinite(raw.modified)) entry.modified = raw.modified;
	if (Number.isFinite(raw.created)) entry.created = raw.created;
	const agent = cleanAgent(raw.agent);
	if (agent) entry.agent = agent;
	for (const key of Object.keys(raw)) if (!known.has(key)) Object.defineProperty(entry, key, {value: raw[key], enumerable: true, configurable: true, writable: true});
	return entry;
}
function cleanSection(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const name = typeof raw.name === 'string' ? raw.name.trim() : '';
	if (!name || isBuiltinSectionName(name)) return null;
	return {...raw, name, collapsed: raw.collapsed === true};
}
function cleanSections(raw) {
	if (!Array.isArray(raw)) return [];
	const out = [], seen = new Set();
	for (const item of raw) {
		const clean = cleanSection(item);
		if (!clean || seen.has(clean.name.toLowerCase())) continue;
		seen.add(clean.name.toLowerCase());
		out.push(clean);
	}
	return out;
}
function cleanCollapsed(raw) {
	const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
	return {...c, skills: c.skills !== false, pinned: c.pinned === true, others: c.others === true, archive: c.archive !== false, trash: c.trash !== false};
}
export function parseIndex(text) {
	if (text == null || String(text).trim() === '') return emptyIndex();
	let raw;
	try { raw = JSON.parse(text); } catch (_) { throw Object.assign(new Error('the notes index is not readable JSON'), {code: 'corrupt'}); }
	if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.notes || typeof raw.notes !== 'object' || Array.isArray(raw.notes)) throw Object.assign(new Error('the notes index does not have the shape of one'), {code: 'corrupt'});
	const version = raw.version;
	if (!Number.isSafeInteger(version) || version < 1) throw Object.assign(new Error('the notes index names no readable version'), {code: 'corrupt'});
	if (version > NOTES_INDEX_VERSION) throw Object.assign(new Error('the notes index was written by a newer Rapier'), {code: 'newer', version});
	const index = {...raw, ...emptyIndex()};
	if (raw.tombstones !== undefined && (!raw.tombstones || typeof raw.tombstones !== 'object' || Array.isArray(raw.tombstones))) throw Object.assign(new Error('invalid note tombstones'), {code: 'corrupt'});
	if (raw.conflicts !== undefined && !Array.isArray(raw.conflicts)) throw Object.assign(new Error('invalid note conflicts'), {code: 'corrupt'});
	for (const [file, entry] of Object.entries(raw.notes)) {
		if (!isNoteFile(file)) continue;
		const clean = cleanEntry(entry);
		if (clean) index.notes[file] = clean;
	}
	index.sections = cleanSections(raw.sections);
	index.collapsed = cleanCollapsed(raw.collapsed);
	return index;
}
export function serializeIndex(index) { return JSON.stringify({...index, version: NOTES_INDEX_VERSION}, null, 1) + '\n'; }
const CODE_EXTENSIONS = new Set(('txt js mjs cjs ts tsx jsx json jsonc html htm xml xhtml vue svelte css scss sass less styl ' +
	'py rb go rs php cs fs fsx java kt swift m mm c h cpp cc cxx hpp hh zig sh bash zsh fish ps1 psm1 psd1 yml yaml toml ini ' +
	'cfg conf env properties sql lua r dart vb pl pm ex exs erl hrl clj cljs scala groovy nim graphql gql proto diff patch ' +
	'tex rst adoc asciidoc tf tfvars hcl sol gradle log csv tsv').split(' '));
export function isMarkdownNote(name) { return typeof name === 'string' && /^[^/\\]+\.md$/i.test(name) && name !== NOTES_INDEX_FILE; }
export function isCodeFile(name) {
	const m = typeof name === 'string' && /^([^/\\.][^/\\]*)\.([A-Za-z0-9]+)$/.exec(name);
	return !!m && CODE_EXTENSIONS.has(m[2].toLowerCase()) && name !== NOTES_INDEX_FILE && name !== 'rapier-backup.json';
}
export function isNoteFile(name) { return isMarkdownNote(name) || isCodeFile(name); }
export function codeFileName(wanted, existing = [], {ascii = false} = {}) {
	let name = null;
	try { name = attachmentFileName(wanted, existing, {ascii}); } catch (_) {}
	return isCodeFile(name) ? name : null;
}

const arrivalCollator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});
export function reconcile(index, files) {
	const present = new Set(files.filter(isNoteFile));
	const out = {...index, notes: {}}, added = [], dropped = [];
	let last = '';
	out.sections = cleanSections(index.sections);
	out.collapsed = cleanCollapsed(index.collapsed);
	for (const [file, entry] of Object.entries(index.notes)) {
		if (present.has(file)) {
			out.notes[file] = entry.order ? entry : {...entry};
			if (entry.order > last) last = entry.order;
			present.delete(file);
		} else dropped.push(file);
	}
	for (const file of [...present].sort((a, b) => arrivalCollator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0))) {
		last = orderAfter(last);
		out.notes[file] = {order: last, pinned: false, skill: false, archived: false, trashed: false, colour: ''};
		added.push(file);
	}
	for (const entry of Object.values(out.notes)) if (!entry.order) { last = orderAfter(last); entry.order = last; }
	return {index: out, added, dropped};
}

export function sectionOf(entry, sections = []) {
	if (entry.trashed) return 'trash';
	if (entry.archived) return 'archive';
	if (entry.skill) return 'skills';
	if (entry.pinned) return 'pinned';
	if (typeof entry.category === 'string' && entry.category && Array.isArray(sections) && sections.some(s => s && s.name === entry.category)) return entry.category;
	return 'others';
}
export function sortedSection(index, section) {
	return Object.entries(index.notes)
		.filter(([, e]) => sectionOf(e, index.sections) === section)
		.sort((a, b) => (a[1].order < b[1].order ? -1 : a[1].order > b[1].order ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([file]) => file);
}
export function moveTo(index, file, at) {
	const entry = index.notes[file];
	if (!entry) return null;
	const files = sortedSection(index, sectionOf(entry, index.sections)), from = files.indexOf(file);
	files.splice(from, 1);
	const clamp = Math.max(0, Math.min(at, files.length));
	if (from === clamp) return null;
	const before = clamp > 0 ? index.notes[files[clamp - 1]].order : '';
	const after = clamp < files.length ? index.notes[files[clamp]].order : '';
	if (before && before === after) {
		let first = clamp - 1, last = clamp + 1;
		while (first > 0 && index.notes[files[first - 1]].order === before) first--;
		while (last < files.length && index.notes[files[last]].order === after) last++;
		if (clamp - first < last - clamp) last = clamp; else first = clamp;
		const changed = files.slice(first, last), keys = [];
		changed.splice(clamp - first, 0, file);
		const space = (start, end, low, high) => {
			if (start >= end) return;
			const mid = Math.floor((start + end) / 2), key = orderMidpoint(low, high);
			keys[mid] = key;
			space(start, mid, low, key); space(mid + 1, end, key, high);
		};
		space(0, changed.length, first > 0 ? index.notes[files[first - 1]].order : '', last < files.length ? index.notes[files[last]].order : '');
		changed.forEach((name, i) => { index.notes[name].order = keys[i]; });
		return entry.order;
	}
	const key = !before ? (after ? orderBefore(after) : orderFirst()) : !after ? orderAfter(before) : orderMidpoint(before, after);
	entry.order = key;
	return key;
}

export function trashEvidence(entry) {
	return typeof entry?.trashDigest === 'string' && /^[0-9a-f]{64}$/.test(entry.trashDigest) && typeof entry.trashRevision === 'string' && entry.trashRevision
		? {digest: entry.trashDigest, revision: entry.trashRevision} : null;
}
export function expiredTrash(index, now, days = 7) {
	if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(days) || days < 0) throw new Error('trash expiry needs a valid time');
	const cutoff = now - days * 86400000;
	const out = [];
	for (const [file, entry] of Object.entries(index.notes)) if (entry.trashed && Number.isInteger(entry.trashedAt) && entry.trashedAt <= cutoff) out.push(file);
	return out;
}

export function admitSection(index, name) {
	const clean = typeof name === 'string' ? name.trim() : '';
	if (!clean || isBuiltinSectionName(clean)) return {index, name: '', added: false};
	const found = index.sections.find(s => s.name.toLowerCase() === clean.toLowerCase());
	if (found) return {index, name: found.name, added: false};
	return {index: {...index, sections: [...index.sections, {name: clean, collapsed: false}]}, name: clean, added: true};
}
export function admitIdentities(index, namespace) {
	if (typeof namespace !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(namespace)) throw Object.assign(new Error('a note identity needs a namespace'), {code: 'identity'});
	let next = index.noteCounters?.[namespace] ?? 1;
	if (!Number.isSafeInteger(next) || next < 1) throw Object.assign(new Error('note identity counter is not readable'), {code: 'corrupt'});
	const files = Object.keys(index.notes).filter(file => !index.notes[file].id);
	if (!files.length) return [];
	for (const entry of [...Object.values(index.notes), ...Object.keys(index.tombstones || {}).map(id => ({id}))]) {
		const id = entry && typeof entry.id === 'string' ? entry.id : '';
		if (!id.startsWith(namespace + ':')) continue;
		const counter = Number(id.slice(namespace.length + 1));
		if (Number.isSafeInteger(counter) && counter >= next) next = counter + 1;
	}
	const assigned = [];
	for (const file of files.sort()) {
		if (!Number.isSafeInteger(next) || next === Number.MAX_SAFE_INTEGER) throw Object.assign(new Error('note identity counter exhausted'), {code: 'identity'});
		const id = namespace + ':' + next++;
		index.notes[file].id = id;
		assigned.push({file, id});
	}
	if (assigned.length) index.noteCounters = {...index.noteCounters, [namespace]: next};
	return assigned;
}

export function addSection(index, name) { return admitSection(index, name).index; }

export function renameSection(index, from, to) {
	const at = index.sections.findIndex(s => s.name === from);
	if (at < 0) return index;
	const clean = typeof to === 'string' ? to.trim() : '';
	if (!clean) return index;
	if (clean !== from) {
		const key = clean.toLowerCase();
		if (isBuiltinSectionName(clean) || index.sections.some((s, i) => i !== at && s.name.toLowerCase() === key)) return index;
	}
	const sections = index.sections.slice();
	sections[at] = {...sections[at], name: clean};
	const notes = {...index.notes};
	for (const [file, entry] of Object.entries(notes)) if (entry.category === from) notes[file] = {...entry, category: clean};
	return {...index, sections, notes};
}

export function removeSection(index, name) {
	const at = index.sections.findIndex(s => s.name === name);
	if (at < 0) return index;
	const sections = index.sections.slice();
	sections.splice(at, 1);
	const notes = {...index.notes};
	for (const [file, entry] of Object.entries(notes)) if (entry.category === name) notes[file] = {...entry, category: ''};
	return {...index, sections, notes};
}

export function moveSection(index, name, before) {
	const at = index.sections.findIndex(s => s.name === name);
	if (at < 0) return index;
	const sections = index.sections.slice();
	const [moved] = sections.splice(at, 1);
	const to = before ? sections.findIndex(s => s.name === before) : -1;
	sections.splice(to < 0 ? sections.length : to, 0, moved);
	return {...index, sections};
}

export function setCategory(index, file, name) {
	if (!index.notes[file]) return index;
	const raw = typeof name === 'string' ? name : '';
	const category = index.sections.find(s => s.name.toLowerCase() === raw.trim().toLowerCase())?.name ?? raw;
	return {...index, notes: {...index.notes, [file]: {...index.notes[file], category}}};
}

export const NOTE_CONTROL_FIELDS = Object.freeze(['pinned', 'colour', 'section', 'tags', 'archived', 'trashed', 'reminder']);
export function noteControlValues(index, file, text) {
	const entry = index.notes[file];
	if (!entry) return null;
	return {pinned: entry.pinned === true, colour: entry.colour || '', section: entry.category || '',
		tags: isMarkdownNote(file) ? tagsOf(text) : [], archived: entry.archived === true, trashed: entry.trashed === true,
		reminder: cleanRemind(entry.remind)};
}
export const NOTE_CONTROL_GROUPS = Object.freeze({
	pinned: Object.freeze(['pinned']), colour: Object.freeze(['colour']), section: Object.freeze(['category']),
	archiveTrash: Object.freeze(['archived', 'trashed', 'trashedAt', 'trashDigest', 'trashRevision']),
	reminder: Object.freeze(['remind', 'remindDone', 'remindDoneFor', 'remindSnoozedUntil', 'remindAction'])
});
export function noteControlGroups(entry) {
	return Object.fromEntries(Object.entries(NOTE_CONTROL_GROUPS).map(([group, keys]) => [group,
		Object.fromEntries(keys.filter(key => Object.hasOwn(entry, key)).map(key => [key, entry[key]]))]));
}
function controlGroupValue(group, entry) {
	if (group === 'pinned') return entry.pinned === true;
	if (group === 'colour') return entry.colour || '';
	if (group === 'section') return entry.category || '';
	return NOTE_CONTROL_GROUPS[group].map(key => ['archived', 'trashed'].includes(key) ? entry[key] === true : entry[key] ?? null);
}
export function stampNoteControls(before, after, generation, touched = []) {
	const versions = {...before?.controlVersions};
	if (before) for (const group of Object.keys(NOTE_CONTROL_GROUPS)) {
		if (touched.includes(group) || JSON.stringify(controlGroupValue(group, before)) !== JSON.stringify(controlGroupValue(group, after))) versions[group] = generation;
	}
	if (Object.keys(versions).length) after.controlVersions = versions; else delete after.controlVersions;
	return after;
}
export function noteControlsSnapshot(index, file, text) {
	const entry = index.notes[file];
	return entry ? {id: entry.id, writer: index.folderDeviceId, values: noteControlValues(index, file, text), groups: noteControlGroups(entry), versions: {...entry.controlVersions}} : null;
}
export function setNoteControls(index, file, fields, {text, app = false} = {}) {
	const fail = code => { throw Object.assign(new Error(code), {code}); };
	if (!isNoteFile(file) || !Object.hasOwn(index.notes, file)) fail('notes_target_missing');
	if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).some(key => !NOTE_CONTROL_FIELDS.includes(key))) fail('notes_fields_invalid');
	for (const name of ['pinned', 'archived', 'trashed']) if (Object.hasOwn(fields, name) && typeof fields[name] !== 'boolean') fail('notes_fields_invalid');
	if (Object.hasOwn(fields, 'reminder') && !app) fail('notes_reminder_app_only');
	if (fields.archived === true && fields.trashed === true) fail('notes_archive_trash_conflict');
	let next = {...index, notes: {...index.notes, [file]: {...index.notes[file]}}}, entry = next.notes[file];
	if (Object.hasOwn(fields, 'pinned')) entry.pinned = fields.pinned;
	if (Object.hasOwn(fields, 'colour')) { if (!NOTE_COLOURS.includes(fields.colour)) fail('notes_colour_invalid'); entry.colour = fields.colour; }
	if (Object.hasOwn(fields, 'section')) {
		if (typeof fields.section !== 'string' || [...fields.section].length > 48 || !fields.section.isWellFormed()) fail('notes_section_invalid');
		const wanted = fields.section.trim();
		if (wanted) {
			const admitted = admitSection(next, wanted);
			if (!admitted.name) fail('notes_section_invalid');
			next = admitted.index; entry.category = admitted.name;
		} else entry.category = '';
	}
	if (Object.hasOwn(fields, 'archived')) entry.archived = fields.archived;
	if (Object.hasOwn(fields, 'trashed')) entry.trashed = fields.trashed;
	if (fields.trashed === true) entry.archived = false;
	else if (fields.archived === true) entry.trashed = false;
	if (!entry.trashed) { delete entry.trashedAt; delete entry.trashDigest; delete entry.trashRevision; }
	if (Object.hasOwn(fields, 'reminder')) {
		if (fields.reminder !== null && !cleanRemind(fields.reminder)) fail('notes_reminder_invalid');
		next = setRemind(next, file, fields.reminder);
	}
	if (Object.hasOwn(fields, 'tags')) {
		if (!isMarkdownNote(file)) fail('notes_tags_require_markdown');
		try { text = setTags(text, fields.tags); } catch (_) { fail('notes_tags_invalid'); }
	}
	return {index: next, text};
}

export function setCollapsed(index, id, collapsed) {
	const flag = collapsed === true;
	if (id === 'skills' || id === 'pinned' || id === 'others' || id === 'archive' || id === 'trash') return {...index, collapsed: {...index.collapsed, [id]: flag}};
	const at = index.sections.findIndex(s => s.name === id);
	if (at < 0) return index;
	const sections = index.sections.slice();
	sections[at] = {...sections[at], collapsed: flag};
	return {...index, sections};
}

export function setRemind(index, file, remind) {
	if (!index.notes[file]) return index;
	const entry = {...index.notes[file]};
	const clean = remind === null ? null : cleanRemind(remind);
	if (remind !== null && !clean) throw new TypeError('Invalid reminder');
	const previous = cleanRemind(entry.remind);
	const sameCalendar = clean && previous && clean.at === previous.at && JSON.stringify(reminderStep(clean)) === JSON.stringify(reminderStep(previous));
	if (!sameCalendar) {
		delete entry.remindDone;
		delete entry.remindDoneFor;
		delete entry.remindSnoozedUntil;
		delete entry.remindAction;
	} else if (entry.remindDoneFor === JSON.stringify(previous)) entry.remindDoneFor = JSON.stringify(clean);
	if (clean) entry.remind = clean; else delete entry.remind;
	return {...index, notes: {...index.notes, [file]: entry}};
}

const LATER_TODAY_HOURS = [8, 13, 18, 20];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function remindChoices(now, options) {
	const morning = options && Number.isInteger(options.morning) ? options.morning : 8;
	const choices = [];
	for (const hour of LATER_TODAY_HOURS) {
		const at = new Date(now); at.setHours(hour, 0, 0, 0);
		if (at.getTime() >= now + 60 * 60 * 1000) { choices.push({id: 'later', label: 'Later today', at: at.getTime()}); break; }
	}
	const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(morning, 0, 0, 0);
	choices.push({id: 'tomorrow', label: 'Tomorrow morning', at: tomorrow.getTime()});
	const week = new Date(now); week.setDate(week.getDate() + 7); week.setHours(morning, 0, 0, 0);
	choices.push({id: 'week', label: 'Next ' + WEEKDAY_LONG[week.getDay()], at: week.getTime()});
	const monday = new Date(now); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7)); monday.setHours(morning, 0, 0, 0);
	if (!choices.some(choice => choice.at === monday.getTime())) choices.splice(choices.length - 1, 0, {id: 'monday', label: 'Monday morning', at: monday.getTime()});
	return choices;
}

const DAY_WORD = '(today|tonight|tomorrow|(?:next\\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)';
const TIME_WORD = '(?:(\\d{1,2})(?::([0-5]\\d))?\\s*([ap])\\.?m\\.?|([01]?\\d|2[0-3]):([0-5]\\d)|(noon|midday))';
const SAID_TIMES = [
	new RegExp('\\b' + DAY_WORD + '\\s+(?:at\\s+)?' + TIME_WORD + '(?![\\w:])', 'i'),
	new RegExp('\\b(?:at\\s+)?' + TIME_WORD + '\\s+' + DAY_WORD + '\\b', 'i'),
	new RegExp('\\bat\\s+' + TIME_WORD + '(?![\\w:])', 'i'),
];
export function remindFromWords(text, now) {
	for (const [n, re] of SAID_TIMES.entries()) {
		const m = re.exec(String(text || ''));
		if (!m) continue;
		const day = (n === 0 ? m[1] : n === 1 ? m[7] : '')?.toLowerCase().replace(/\s+/g, ' ') || '', t = n === 0 ? m.slice(2) : m.slice(1);
		const twelve = t[0] != null && Number(t[0]) >= 1 && Number(t[0]) <= 12;
		if (t[0] != null && !twelve) continue;
		const hour = t[5] ? 12 : t[0] != null ? Number(t[0]) % 12 + (t[2].toLowerCase() === 'p' ? 12 : 0) : Number(t[3]);
		const at = new Date(now); at.setHours(hour, Number(t[1] ?? t[4] ?? 0), 0, 0);
		const weekday = WEEKDAY_LONG.findIndex(name => day.endsWith(name.toLowerCase()));
		if (day === 'tomorrow') at.setDate(at.getDate() + 1);
		else if (weekday >= 0) at.setDate(at.getDate() + (((weekday - at.getDay() + 7) % 7) || (day.startsWith('next') || at.getTime() <= now ? 7 : 0)));
		else if (!day && at.getTime() <= now) at.setDate(at.getDate() + 1);
		if (at.getTime() <= now) return null;
		const offset = localDayNumber(at) - localDayNumber(new Date(now));
		return {at: at.getTime(), words: m[0].trim(), label: (offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : WEEKDAY_LONG[at.getDay()]) + ', ' + clockWords(at)};
	}
	return null;
}

function localDayNumber(date) { return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000); }
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function clockWords(date) {
	const hour = date.getHours() % 12 || 12;
	return hour + ':' + String(date.getMinutes()).padStart(2, '0') + ' ' + (date.getHours() < 12 ? 'am' : 'pm');
}
export function remindWords(remind, now) {
	if (!remind) return '';
	const at = nextOccurrence(remind, now);
	if (at == null) return '';
	const occ = new Date(at), current = new Date(now);
	const offset = localDayNumber(occ) - localDayNumber(current);
	let date;
	if (offset === 0) date = 'Today';
	else if (offset === 1) date = 'Tomorrow';
	else if (offset >= 2 && offset <= 6) date = WEEKDAY_SHORT[occ.getDay()];
	else date = occ.getDate() + ' ' + MONTH_SHORT[occ.getMonth()] + (occ.getFullYear() !== current.getFullYear() ? ' ' + occ.getFullYear() : '');
	let words = date + ' ' + clockWords(occ);
	if (remind.repeat) words += ', ' + remind.repeat;
	if (at < now) words += ' (missed)';
	return words;
}

function monthDayOccurrence(anchor, year, month) {
	const lastDay = new Date(year, month + 1, 0).getDate();
	const day = Math.min(anchor.getDate(), lastDay);
	return new Date(year, month, day, anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds()).getTime();
}
const REMIND_STEPS = {daily: {days: 1, months: 0}, weekly: {days: 7, months: 0}, monthly: {days: 0, months: 1}, yearly: {days: 0, months: 12}};
function reminderStep(remind) {
	if (remind.repeat === 'custom') return ['months', 'years'].includes(remind.unit)
		? {days: 0, months: remind.every * (remind.unit === 'years' ? 12 : 1), weekdays: 0}
		: {days: remind.every * (remind.unit === 'weeks' ? 7 : 1), months: 0, weekdays: 0};
	if (remind.repeat === 'weekdays') return {days: 0, months: 0, weekdays: 62};
	return {...(REMIND_STEPS[remind.repeat] || {days: 0, months: 0}), weekdays: 0};
}
function repeatStep(remind, n) {
	const anchor = new Date(remind.at), step = reminderStep(remind);
	if (step.weekdays) {
		const offsets = Array.from({length: 7}, (_, i) => i).filter(i => step.weekdays & (1 << ((anchor.getDay() + i) % 7)));
		const d = new Date(anchor); d.setDate(d.getDate() + Math.floor(n / offsets.length) * 7 + offsets[n % offsets.length]);
		return d.getTime();
	}
	if (n === 0 || !remind.repeat) return remind.at;
	if (step.days) { const d = new Date(anchor); d.setDate(d.getDate() + n * step.days); return d.getTime(); }
	return monthDayOccurrence(anchor, anchor.getFullYear(), anchor.getMonth() + n * step.months);
}
function firstOccurrenceAfter(remind, now) {
	if (repeatStep(remind, 0) > now) return 0;
	let low = 0, high = 1;
	while (repeatStep(remind, high) <= now) high *= 2;
	while (high - low > 1) {
		const mid = low + Math.floor((high - low) / 2);
		if (repeatStep(remind, mid) <= now) low = mid; else high = mid;
	}
	return high;
}
export function nativeReminderRows(index, title = file => file.replace(/\.md$/i, '')) {
	const rows = [];
	for (const [file, entry] of Object.entries(index.notes)) {
		const remind = cleanRemind(entry.remind);
		if (!remind || entry.trashed) continue;
		rows.push({file, ...(typeof entry.id === 'string' ? {id: entry.id} : {}), title: String(title(file) || file).slice(0, 512), at: remind.at,
			...reminderStep(remind), done: remindDoneAt(entry), snoozeMinutes: remind.snoozeMinutes ?? 10, snoozedUntil: remindSnoozedAt(entry)});
	}
	return rows.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}
export function nextOccurrence(remind, now) {
	remind = cleanRemind(remind);
	if (!remind) return null;
	if (!remind.repeat) return remind.at;
	const at = repeatStep(remind, firstOccurrenceAfter(remind, now));
	return Number.isFinite(at) ? at : null;
}

function currentOccurrence(remind, now) {
	remind = cleanRemind(remind);
	if (!remind || repeatStep(remind, 0) > now) return null;
	if (!remind.repeat) return remind.at;
	return repeatStep(remind, firstOccurrenceAfter(remind, now) - 1);
}
function remindDoneAt(entry) {
	return entry.remindDoneFor === JSON.stringify(cleanRemind(entry.remind)) ? (entry.remindDone || 0) : 0;
}
function remindSnoozedAt(entry) {
	return entry.remindDoneFor === JSON.stringify(cleanRemind(entry.remind)) ? (entry.remindSnoozedUntil || 0) : 0;
}
function dueOccurrence(entry, now) {
	const snoozed = remindSnoozedAt(entry);
	if (snoozed > remindDoneAt(entry)) return snoozed <= now ? snoozed : null;
	return currentOccurrence(entry.remind, now);
}
export function dueReminders(index, now) {
	const out = [];
	for (const [file, entry] of Object.entries(index.notes)) {
		if (!entry.remind || entry.trashed) continue;
		const at = dueOccurrence(entry, now);
		if (at != null && at > remindDoneAt(entry)) out.push(file);
	}
	return out;
}
export function acknowledgeRemind(index, file, now) {
	const entry = index.notes[file];
	if (!entry || !entry.remind) return index;
	const at = dueOccurrence(entry, now);
	if (at == null || at <= remindDoneAt(entry)) return index;
	return {...index, notes: {...index.notes, [file]: {...entry, remindDone: at, remindDoneFor: JSON.stringify(cleanRemind(entry.remind)), remindSnoozedUntil: 0}}};
}

export function nextReminderAt(entry, now) {
	const remind = cleanRemind(entry?.remind);
	if (!remind || entry.trashed) return null;
	const done = remindDoneAt(entry), snoozed = remindSnoozedAt(entry);
	if (snoozed > done) return snoozed;
	const due = currentOccurrence(remind, now);
	if (due !== null && due > done) return due;
	const next = nextOccurrence(remind, Math.max(now, done));
	return next !== null && next > done ? next : null;
}
export function reminderCardWords(entry, now) {
	const remind = cleanRemind(entry?.remind);
	if (!remind || entry.trashed) return '';
	const snoozed = remindSnoozedAt(entry);
	if (snoozed > remindDoneAt(entry)) return remindWords({at: snoozed}, now);
	return nextReminderAt(entry, now) === null ? '' : remindWords(remind, now);
}
export function changeReminders(index, targets, change, now) {
	if (!Array.isArray(targets) || !targets.length || !Number.isSafeInteger(now) || now < 0 || now > REMIND_MAX_DATE)
		throw new TypeError('Invalid reminder change');
	let next = index;
	const seen = new Set();
	for (const target of targets) {
		if (!validNoteId(target?.id) || seen.has(target.id)) throw new TypeError('Invalid reminder target');
		seen.add(target.id);
		const files = Object.keys(index.notes).filter(file => index.notes[file].id === target.id);
		const file = files[0], entry = index.notes[file];
		if (files.length !== 1 || entry.trashed || JSON.stringify(cleanRemind(entry.remind)) !== target.remind)
			throw Object.assign(new Error('The reminder changed; the saved rule was kept.'), {code: 'changed'});
		const remind = cleanRemind(entry.remind);
		if (change?.kind === 'set') next = setRemind(next, file, change.remind);
		else if (change?.kind === 'remove') next = setRemind(next, file, null);
		else if (change?.kind === 'repeat') {
			if (!remind) throw new TypeError('A time reminder is required');
			const repeat = change.toggle && remind.repeat === change.repeat ? undefined : change.repeat;
			next = setRemind(next, file, {at: remind.at, snoozeMinutes: remind.snoozeMinutes, ...(repeat ? {repeat} : {}),
				...(repeat === 'custom' ? {every: change.every, unit: change.unit} : {})});
		} else if (change?.kind === 'snooze-interval') {
			if (!remind) throw new TypeError('Missing reminder');
			next = setRemind(next, file, {...remind, snoozeMinutes: change.minutes});
		} else if (change?.kind === 'done' || change?.kind === 'snooze') {
			if (!remind) throw new TypeError('Missing reminder');
			const occurrence = nextReminderAt(entry, now);
			if (occurrence === null) continue;
			const until = change.kind === 'snooze' ? Math.max(now, occurrence) + (remind.snoozeMinutes ?? 10) * 60000 : 0;
			if (!Number.isSafeInteger(until) || until > REMIND_MAX_DATE) throw new TypeError('Invalid snooze');
			next = {...next, notes: {...next.notes, [file]: {...entry, remindDone: occurrence,
				remindDoneFor: JSON.stringify(remind), remindSnoozedUntil: until}}};
		} else throw new TypeError('Invalid reminder change');
	}
	return next;
}

export function applyReminderActions(index, actions) {
	if (!Array.isArray(actions) || actions.length > 64) throw new TypeError('Invalid reminder actions');
	const grouped = new Map(), tokens = new Set();
	for (const action of actions) {
		const before = action?.before;
		if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(action?.token) || tokens.has(action.token) || !validNoteId(before?.id)
			|| !Number.isSafeInteger(before.delivered) || before.delivered <= before.done || before.delivered > REMIND_MAX_DATE
			|| !Number.isSafeInteger(action.snoozedUntil) || action.snoozedUntil < 0 || action.snoozedUntil > REMIND_MAX_DATE
			|| action.snoozedUntil !== 0 && action.snoozedUntil <= before.delivered) throw new TypeError('Invalid reminder action');
		tokens.add(action.token);
		const list = grouped.get(before.id) || []; list.push(action); grouped.set(before.id, list);
	}
	let next = index;
	for (const [id, pending] of grouped) {
		const files = Object.keys(next.notes).filter(file => next.notes[file].id === id);
		if (files.length !== 1) continue;
		const file = files[0]; let entry = next.notes[file];
		const acknowledged = pending.findIndex(action => action.token === entry.remindAction);
		for (const action of pending.slice(acknowledged + 1)) {
			if (entry.trashed) break;
			const row = nativeReminderRows({notes: {[file]: entry}})[0], before = action.before;
			if (!row || ['at', 'days', 'months', 'weekdays', 'done', 'snoozedUntil'].some(key => row[key] !== before[key])) continue;
			entry = {...entry, remindDone: before.delivered, remindDoneFor: JSON.stringify(cleanRemind(entry.remind)),
				remindSnoozedUntil: action.snoozedUntil, remindAction: action.token};
		}
		if (entry !== next.notes[file]) next = {...next, notes: {...next.notes, [file]: entry}};
	}
	return next;
}

const PICTURE_LINE = /^(?:!\[(?:\\.|[^\]\\])*\](?:\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])(?:[ \t]*<!--md-layout:v1[ \t][^>\r\n]*-->)?\s*)+$/;
const RECORDING_LINE = /^\[(?:\\.|[^\]\\])*\]\(\s*<?(?:audio|attachments)\/[^()<>]*>?\s*(?:"[^"]*"|'[^']*')?\s*\)$/;
function cardInkWords(line) {
	return line.includes('<!--') ? stripInkMarkers(line) : line;
}
const TITLE_ENTITIES = {nbsp: ' ', lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&'};
export function titleWords(text) {
	return text.replace(/\\([\\`*_{}\[\]()#+\-.!~|<>&])|[*_`~]|&(nbsp|lt|gt|quot|#39|amp);/g, (_, kept, entity) => kept || (entity ? TITLE_ENTITIES[entity] : '')).trim();
}
export function cardHead(lines, rawLines = lines) {
	let lead = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = cardInkWords(lines[i].trim());
		if (!line) continue;
		if (PICTURE_LINE.test(line)) { if (lead < 0) lead = i; continue; }
		if (RECORDING_LINE.test(line)) continue;
		const raw = rawLines[i].trim(), atx = /^#\s+(.*?)(?:\s+#+)?\s*$/.exec(raw);
		const setext = !atx && /^ {0,3}=+\s*$/.test(rawLines[i + 1] || '') && !/^(?:#|>|[-*+]\s|\d+[.)]\s|\|)/.test(raw);
		const word = atx ? titleWords(cardInkWords(atx[1])) : setext ? titleWords(line) : '';
		if (word) return {title: cutText(word, 80, 80), start: i + (setext ? 2 : 1), lead, at: i};
		return {title: '', start: i, lead, at: i};
	}
	return {title: '', start: lines.length, lead, at: -1};
}
export function noteHead(raws) {
	const lines = [], rawLines = [], owner = [];
	let at = -1;
	for (let b = 0; b < raws.length; b++) {
		const source = cardSource(raws[b]), own = source.visible;
		for (let i = 0; i < own.length; i++) { lines.push(own[i]); rawLines.push(source.lines[i]); owner.push(b); }
		lines.push(''); rawLines.push(''); owner.push(b);
		const head = cardHead(lines, rawLines);
		if (head.at >= 0) return {title: head.title ? owner[head.at] : -1, at: at >= 0 ? at : owner[head.at]};
		if (at < 0 && !own.some(line => line.trim())) at = b;
	}
	return {title: -1, at: at >= 0 ? at : raws.length};
}
export function cardSource(text) {
	const raw = String(text || ''), pieces = raw.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
	const lines = pieces.map(line => line.replace(/(?:\r\n|\r|\n)$/, ''));
	const body = parseFrontMatter(raw).body, frontEnd = frontLineCount(pieces, raw, body);
	const needsReview = body.includes('<!-- note-conflict:v1 ');
	const checkable = !needsReview && !lines.slice(frontEnd).some(line => /^(?: {0,3}(?:[-+*]|\d+[.)])[ \t]+|[ \t]*>).*?(?:`{3,}|~{3,})/.test(line) || /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:[ \t/>]|$)/.test(line));
	let fence = '', comment = false, tag = '';
	const visible = lines.map((line, i) => {
		if (i < frontEnd) return '';
		let value = line.trimStart();
		const mark = /^(`{3,}|~{3,})(.*)$/.exec(value);
		if (fence) {
			if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) fence = '';
			return '';
		}
		if (comment) { if (value.includes('-->')) comment = false; return ''; }
		if (tag) { if (new RegExp('</' + tag + '\\s*>', 'i').test(value)) tag = ''; return ''; }
		if (/^(?: {4}|\t)/.test(line)) return '';
		if (mark) { fence = mark[1]; return ''; }
		const shown = cardInkWords(line);
		if (shown !== line) value = shown.trimStart();
		if (value.includes('<!--') && !PICTURE_LINE.test(value)) { comment = !value.slice(value.indexOf('<!--') + 4).includes('-->'); return ''; }
		const html = /^<(pre|script|style|textarea)(?:\s|>)/i.exec(value);
		if (html) { if (!new RegExp('</' + html[1] + '\\s*>', 'i').test(value)) tag = html[1]; return ''; }
		return shown;
	});
	return {pieces, lines, visible, needsReview, checkable};
}
export function projectCard(file, text, {bodyLines = 6, taskDepth = false} = {}) {
	const {visible: lines, lines: rawLines, needsReview, checkable} = cardSource(text);
	const {title, start, lead, at} = cardHead(lines, rawLines);
	const body = [], checks = [];
	for (let i = lead >= 0 ? lead : start; i < lines.length && body.length < bodyLines; i++) {
		if (lead >= 0 && title && i >= at && i < start) continue;
		const line = lines[i].trim();
		if (!line) continue;
		const raw = rawLines[i].trim(), box = checkable && /^[-*]\s+\[( |x|X)\](?:\s+(.*))?$/.exec(raw);
		if (box) { checks.push({done: box[1] !== ' ', text: cutText(cardInkWords(box[2] || ''), 120, 120), ...(taskDepth ? {depth: /^  [-*]\s/.test(lines[i]) ? 1 : 0} : {})}); continue; }
		if (/^!\[/.test(raw)) { body.push('\u{1F5BC}'); continue; }
		body.push(cutText(cardInkWords(raw.replace(/^#{1,6}\s+/, '').replace(/^[-*>]\s+/, '')).replace(/[*_`~]/g, ''), 280, 280));
	}
	return {file, title: linkCardLines(lines)?.title || title || (body.length || checks.length ? '' : file.replace(/\.md$/i, '')), body, checks, empty: !title && !body.length && !checks.length, needsReview, start, lead};
}

export function linkCard(text) {
	return linkCardLines(cardSource(text).visible);
}
function linkCardLines(visible) {
	const lines = visible.map(line => line.trim()).filter(Boolean);
	const m = lines.length === 1 && /^(?:#\s+)?<?(https?:\/\/[^\s<>]+?)>?$/i.exec(lines[0]);
	let one = null;
	if (!m && lines.length === 1 && lines[0].startsWith('[')) {
		try {
			const tokens = markdownParser().parseInline(lines[0], {})[0]?.children || [];
			if (tokens[0]?.type === 'link_open' && tokens.at(-1)?.type === 'link_close' && tokens.filter(token => token.type === 'link_open').length === 1 && !tokens.some(token => token.type === 'image'))
				one = {dest: tokens[0].attrGet('href'), text: tokens.filter(token => token.type === 'text' || token.type === 'code_inline').map(token => token.content).join('')};
		} catch (_) {}
	}
	if (!m && !one) return null;
	let url = null; try { url = new URL(m ? m[1] : one.dest); } catch (_) {}
	if (url && !['http:', 'https:'].includes(url.protocol)) return null;
	if (!url) return null;
	const host = url.hostname.replace(/^www\./, '');
	if (one?.text && one.text !== one.dest) return {title: one.text, host};
	const parts = url.pathname.split('/').filter(Boolean).slice(-3).map(part => { try { part = decodeURIComponent(part); } catch (_) {} return /^\d+$/.test(part) ? '#' + part : part; });
	return parts.length ? {title: parts.join(' \u00b7 '), host} : {title: host, host: ''};
}

export function toggleCheck(text, n) {
	const {pieces, lines, visible, checkable} = cardSource(text);
	if (!checkable) return null;
	const {start} = cardHead(visible, lines);
	let seen = 0;
	for (let i = start; i < pieces.length; i++) {
		if (!visible[i]) continue;
		const m = /^(\s*[-*]\s+\[)( |x|X)(\](?:\s.*)?)$/.exec(lines[i]);
		if (!m || seen++ !== n) continue;
		pieces[i] = pieces[i].slice(0, m[1].length) + (m[2] === ' ' ? 'x' : ' ') + pieces[i].slice(m[1].length + 1);
		return pieces.join('');
	}
	return null;
}

function noteWords(text) {
	const lines = stripFrontMatter(String(text || '')).split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l && !/^\[(?:\\.|[^\]\\])+\]:[ \t]*<?data:/i.test(l));
	const first = lines.find(l => !PICTURE_LINE.test(l)) || lines[0] || '';
	return first.replace(/^#{1,6}\s+/, '').replace(/^(?:[-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s*)?/, '').replace(/^>\s+/, '').replace(/<!--md-layout:v1[ \t][^>\r\n]*-->/g, ' ')
		.replace(/!\[((?:\\.|[^\]\\])*)\](?:\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])/g, (m, alt) => alt.replace(/\.[a-z0-9]{2,5}$/i, '')).replace(/\[((?:\\.|[^\]\\])*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
		.replace(/\\([!-\/:-@\[-`{-~])/g, '$1');
}
export function noteTitle(text) { return cutText(cardInkWords(noteWords(text)).replace(/[*_`~]/g, '').trim(), 80, 80); }
export function noteFileName(text, existing = [], {ascii = false, taken: live = null, suffixes = null} = {}) {
	let base = noteWords(text).replace(/[^\p{L}\p{M}\p{N} _-]+/gu, '');
	if (ascii) base = base.normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^A-Za-z0-9 _-]+/g, '');
	base = cutText(base.trim().replace(/\s+/g, ' '), 48, 48).replace(/\s+$/, '') || 'note';
	if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base += ' note';
	const taken = live || new Set(existing.map(f => f.toLowerCase())), key = base.toLowerCase();
	let n = suffixes?.get(key) || 2, name = n > 2 ? base + ' ' + (n++) + '.md' : base + '.md';
	while (taken.has(name.toLowerCase())) name = base + ' ' + (n++) + '.md';
	suffixes?.set(key, n);
	return name;
}
