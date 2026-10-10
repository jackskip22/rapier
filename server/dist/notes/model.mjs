import {parseFrontMatter, stripFrontMatter, tagsOf, setTags} from './frontmatter.mjs';
import {stripInkMarkers, stripColorMarkers} from '../spec/md-marks.mjs';
// How many of a note's leading lines the metadata block covers, from the module's own reading of it.
// `pieces` carry their own endings, so this counts the same under LF, CRLF and CR alike.
function frontLineCount(pieces, raw, body) {
	if (body.length >= raw.length) return 0;
	const hidden = raw.length - body.length;
	let at = 0, n = 0;
	for (const piece of pieces) { if (at >= hidden) break; at += piece.length; n++; }
	return n;
}
// Pure Notes model. A note is ordinary Markdown, nothing Rapier-private. notes.json is a sidecar; the FOLDER is the truth. `id` is
// namespace:counter (admitIdentities; merge.mjs admitIndex agrees, notes-model). Order is one fractional key per note; sort (pinned ? 0 : 1,
// order, id). Categories, reminders, trash seven days: expired trash goes through delete-forever, never a silent purge.

export const NOTES_INDEX_FILE = 'notes.json';
export const NOTES_INDEX_VERSION = 1;

// A name/display limit counts code points. A projection may also retain its UTF-16
// ceiling (the frozen card contract and Android's widget admission). When the platform
// knows graphemes, retreat from a partial cluster; never normalise the words.
let characterSegmenter;
export function cutText(text, limit, maxUnits = Infinity) {
	if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('A text limit must be a non-negative safe integer.');
	text = String(text);
	if (text.length <= limit && text.length <= maxUnits) return text;
	let end = 0, count = 0;
	for (const point of text) { if (count++ === limit || end + point.length > maxUnits) break; end += point.length; }
	if (end < text.length && typeof Intl.Segmenter === 'function') {
		characterSegmenter ||= new Intl.Segmenter(undefined, {granularity: 'grapheme'});
		end = characterSegmenter.segment(text).containing(end).index;
	}
	return text.slice(0, end);
}

// File attachments are ordinary relative links into this sibling directory. The folder, not a
// sidecar attachment registry, owns their existence. notes.json journals their writes just like
// recordings; renaming/trashing a note never renames or collects its files.
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
	// A readable original name, a preserved extension and room for collision numbering under a
	// 255-byte filesystem leaf. Cut whole code points, never half of a character or a UTF-8 byte.
	const dot = base.lastIndexOf('.'), ext = dot > 0 && base.length - dot <= 24 ? base.slice(dot) : '';
	let stem = ext ? base.slice(0, -ext.length) : base;
	while (new TextEncoder().encode(stem + ext).length > 200) stem = Array.from(stem).slice(0, -1).join('');
	stem = stem.replace(/[ .]+$/, '') || 'File';
	const taken = new Set(existing.map(name => String(name).normalize('NFC').toLowerCase()));
	let name = stem + ext, n = 2;
	while (taken.has(name.normalize('NFC').toLowerCase())) name = stem + ' ' + n++ + ext;
	if (!isAttachmentName(name)) throw new Error('This file needs a portable attachment name.');
	return name;
}
export const NOTE_COLOURS = Object.freeze(['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown']);

// ---- Fractional order keys: base-62, lexicographic; midpoint(a, b) strictly between; '' is no bound ----
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
		// Adjacent at this digit: keep a's digit and go one deeper against an unbounded ceiling.
		out += DIGITS[ca];
		if (cb - ca === 1) { b = ''; continue; }
		// ca === cb: the shared prefix continues.
	}
}
// A first key, and keys past either end. Past the last a key counts up in its own digits (plus one, carried),
// before the first it counts down (borrowed), and it never ends in 0, so two neighbours always have room between
// them. Only a key at the end of its length's range (all z, or 0...01) grows, by as many digits as it has and at
// most eight: a run of n notes chained after the last or placed first costs about log n digits, not n / 6.
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
	// Only a key's own prefixes sort below a key of zeros; for that key the midpoint answers, as it always did.
	return /^0+$/.test(key) ? orderMidpoint('', key) : '0'.repeat(key.length) + 'z'.repeat(grow);
}
export function orderBefore(first) { return orderStep(first, false); }
export function orderAfter(last) { return last ? orderStep(last, true) : orderFirst(); }

// ---- The sidecar -------------------------------------------------------------------------------
export function emptyIndex() { return {version: NOTES_INDEX_VERSION, notes: {}, sections: [], collapsed: {skills: true, pinned: false, others: false, archive: true, trash: true}}; }

// Built-in sections, case-insensitive; the aliases are blocked too.
const BUILTIN_SECTION_NAMES = ['skills', 'pinned', 'other', 'others', 'archive', 'archived', 'trash', 'deleted'];
function isBuiltinSectionName(name) { return typeof name === 'string' && BUILTIN_SECTION_NAMES.includes(name.trim().toLowerCase()); }

// The note's own rule. Custom intervals project to calendar days; weekdays to a day mask.
const REMIND_REPEATS = ['daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom'];
const REMIND_MAX_DATE = 8_640_000_000_000_000, REMIND_MAX_STEP = 2_147_483_647;
export function cleanRemind(raw) {
	if (!raw || typeof raw !== 'object') return null;
	if (!Number.isSafeInteger(raw.at) || raw.at < 1 || raw.at > REMIND_MAX_DATE) return null;
	const repeat = raw.repeat;
	if (repeat !== undefined && !REMIND_REPEATS.includes(repeat)) return null;
	if (repeat === 'custom' && (!['days', 'weeks', 'months', 'years'].includes(raw.unit) || !Number.isSafeInteger(raw.every) || raw.every < 1 || raw.every > Math.floor(REMIND_MAX_STEP / (raw.unit === 'weeks' ? 7 : raw.unit === 'years' ? 12 : 1)))) return null;
	if (raw.snoozeMinutes !== undefined && (!Number.isSafeInteger(raw.snoozeMinutes) || raw.snoozeMinutes < 1 || raw.snoozeMinutes > REMIND_MAX_STEP)) return null;
	// Alphabetical keys agree with the sidecar merger's canonical reminder binding.
	return {at: raw.at, ...(repeat === 'custom' ? {every: raw.every} : {}), ...(repeat ? {repeat} : {}),
		...(raw.snoozeMinutes !== undefined ? {snoozeMinutes: raw.snoozeMinutes} : {}), ...(repeat === 'custom' ? {unit: raw.unit} : {})};
}
// Who an agent was and when, on a note it made (notes.write): index data, never a word of the note.
export function cleanAgent(raw) {
	if (!raw || typeof raw !== 'object' || typeof raw.by !== 'string' || !raw.by.trim() || raw.by.length > 64 || !Number.isSafeInteger(raw.at) || raw.at < 0) return null;
	return {by: raw.by.trim(), at: raw.at};
}
export function validNoteId(id) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id.slice(id.lastIndexOf(':') + 1))); }
function cleanEntry(raw) {
	if (!raw || typeof raw !== 'object') return null;
	// Written in this function's field order, then unknown fields in their order: a round trip is byte-identical and keeps other owners' data.
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
	// trashedAt ms, sparse; absent means never, or before the rule.
	if (Number.isInteger(raw.trashedAt) && raw.trashedAt >= 0) entry.trashedAt = raw.trashedAt;
	entry.colour = NOTE_COLOURS.includes(raw.colour) ? raw.colour : '';
	// Only the type is checked on read; sectionOf resolves.
	if (typeof raw.category === 'string') entry.category = raw.category;
	const remind = cleanRemind(raw.remind);
	if (remind) entry.remind = remind;
	if (Number.isInteger(raw.remindDone) && raw.remindDone >= 0) entry.remindDone = raw.remindDone;
	if (typeof raw.remindDoneFor === 'string') entry.remindDoneFor = raw.remindDoneFor;
	if (Number.isSafeInteger(raw.remindSnoozedUntil) && raw.remindSnoozedUntil >= 0 && raw.remindSnoozedUntil <= REMIND_MAX_DATE) entry.remindSnoozedUntil = raw.remindSnoozedUntil;
	if (typeof raw.remindAction === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(raw.remindAction)) entry.remindAction = raw.remindAction;
	if (Number.isFinite(raw.modified)) entry.modified = raw.modified;
	// `created` sorts Date created.
	if (Number.isFinite(raw.created)) entry.created = raw.created;
	const agent = cleanAgent(raw.agent);
	if (agent) entry.agent = agent;
	for (const key of Object.keys(raw)) if (!known.has(key)) Object.defineProperty(entry, key, {value: raw[key], enumerable: true, configurable: true, writable: true});
	return entry;
}
// Garbage, built-in or duplicate (case-insensitive) sections are dropped, never refusing the sidecar.
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
// Invalid falls to the default.
function cleanCollapsed(raw) {
	const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
	// Skills, Archived, Trash closed by default; Pinned and Other open.
	return {...c, skills: c.skills !== false, pinned: c.pinned === true, others: c.others === true, archive: c.archive !== false, trash: c.trash !== false};
}
// Read closed: no sidecar is day one; not a sidecar throws 'corrupt'; newer version throws 'newer', never downgraded.
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
// The folder keeps two kinds of text file side by side: Markdown, a note, and a code file (code, plain
// text or data, the text types the editor opens), kept as the exact bytes the person wrote. Every custody
// rule (save, history, Trash, backup, sync) holds for both; only a note's Markdown is ever read for links,
// media, tags or checklists, or merged with a conflict block.
const CODE_EXTENSIONS = new Set(('txt js mjs cjs ts tsx jsx json jsonc html htm xml xhtml vue svelte css scss sass less styl ' +
	'py rb go rs php cs fs fsx java kt swift m mm c h cpp cc cxx hpp hh zig sh bash zsh fish ps1 psm1 psd1 yml yaml toml ini ' +
	'cfg conf env properties sql lua r dart vb pl pm ex exs erl hrl clj cljs scala groovy nim graphql gql proto diff patch ' +
	'tex rst adoc asciidoc tf tfvars hcl sol gradle log csv tsv').split(' '));
export function isMarkdownNote(name) { return typeof name === 'string' && /^[^/\\]+\.md$/i.test(name) && name !== NOTES_INDEX_FILE; }
// The folder's own files are never code: its index, a backup's manifest and every dotfile.
export function isCodeFile(name) {
	const m = typeof name === 'string' && /^([^/\\.][^/\\]*)\.([A-Za-z0-9]+)$/.exec(name);
	return !!m && CODE_EXTENSIONS.has(m[2].toLowerCase()) && name !== NOTES_INDEX_FILE && name !== 'rapier-backup.json';
}
export function isNoteFile(name) { return isMarkdownNote(name) || isCodeFile(name); }
// A code file keeps its extension; a taken name numbers its stem ("script 2.py", "script kept.py").
export function codeFileName(wanted, existing = [], {ascii = false} = {}) {
	let name = null;
	try { name = attachmentFileName(wanted, existing, {ascii}); } catch (_) {}
	return isCodeFile(name) ? name : null;
}

// Files without an entry are appended in name order; entries without a file go.
export function reconcile(index, files) {
	const present = new Set(files.filter(isNoteFile));
	const out = {...index, notes: {}}, added = [], dropped = [];
	let last = '';
	// Sections and collapse memory survive a scan untouched.
	out.sections = cleanSections(index.sections);
	out.collapsed = cleanCollapsed(index.collapsed);
	for (const [file, entry] of Object.entries(index.notes)) {
		if (present.has(file)) {
			out.notes[file] = entry.order ? entry : {...entry};
			if (entry.order > last) last = entry.order;
			present.delete(file);
		} else dropped.push(file);
	}
	// Only arrivals need name order; existing notes keep the person's ranks without sorting them.
	for (const file of [...present].sort()) {
		last = orderAfter(last);
		out.notes[file] = {order: last, pinned: false, skill: false, archived: false, trashed: false, colour: ''};
		added.push(file);
	}
	// An entry that lost its order (a hand-edited sidecar) gets one after everything.
	for (const entry of Object.values(out.notes)) if (!entry.order) { last = orderAfter(last); entry.order = last; }
	return {index: out, added, dropped};
}

// ---- Sections and order: (pinned ? 0 : 1, order, name); a person's section id is its name ----
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
// Writes the moved rank, spacing tied neighbours only when they leave no gap; null when nothing changes.
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
		// Pinning or changing sections can bring equal ranks together. Keep the larger side of
		// their run and make room on the smaller side without changing any other section.
		let first = clamp - 1, last = clamp + 1;
		while (first > 0 && index.notes[files[first - 1]].order === before) first--;
		while (last < files.length && index.notes[files[last]].order === after) last++;
		if (clamp - first < last - clamp) last = clamp; else first = clamp;
		const changed = files.slice(first, last), keys = [];
		changed.splice(clamp - first, 0, file);
		// Stage balanced keys before touching the index, keeping long runs' keys short.
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

// Expiry is only eligibility. The folder owner and trash protocol must verify the recorded
// content before making a durable tombstone; absence or elapsed time is never deletion proof.
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

// ---- Sections: every function is pure; none mutates its index ----
export function admitSection(index, name) {
	const clean = typeof name === 'string' ? name.trim() : '';
	if (!clean || isBuiltinSectionName(clean)) return {index, name: '', added: false};
	const found = index.sections.find(s => s.name.toLowerCase() === clean.toLowerCase());
	if (found) return {index, name: found.name, added: false};
	return {index: {...index, sections: [...index.sections, {name: clean, collapsed: false}]}, name: clean, added: true};
}
// Identity is namespace:counter; a filename is not an identity. The narrow half of merge.mjs admitIndex (notes-model asserts agreement).
// The counter is read back from the folder. Mutates in place; returns what was admitted.
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

// Refuses what addSection would refuse (case-only rename allowed); `from` matches exactly.
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

// Deleting a section clears its notes' category, so a later section of that name takes none of them.
export function removeSection(index, name) {
	const at = index.sections.findIndex(s => s.name === name);
	if (at < 0) return index;
	const sections = index.sections.slice();
	sections.splice(at, 1);
	const notes = {...index.notes};
	for (const [file, entry] of Object.entries(notes)) if (entry.category === name) notes[file] = {...entry, category: ''};
	return {...index, sections, notes};
}

// Rewritten whole; no fractional key.
export function moveSection(index, name, before) {
	const at = index.sections.findIndex(s => s.name === name);
	if (at < 0) return index;
	const sections = index.sections.slice();
	const [moved] = sections.splice(at, 1);
	const to = before ? sections.findIndex(s => s.name === before) : -1;
	sections.splice(to < 0 ? sections.length : to, 0, moved);
	return {...index, sections};
}

// setCategory does not require the section to exist: a dangling category reads as Other.
export function setCategory(index, file, name) {
	if (!index.notes[file]) return index;
	const raw = typeof name === 'string' ? name : '';
	const category = index.sections.find(s => s.name.toLowerCase() === raw.trim().toLowerCase())?.name ?? raw;
	return {...index, notes: {...index.notes, [file]: {...index.notes[file], category}}};
}

// Tool-facing names map to the same fields and front matter the card controls own.
export const NOTE_CONTROL_FIELDS = Object.freeze(['pinned', 'colour', 'section', 'tags', 'archived', 'trashed', 'reminder']);
export function noteControlValues(index, file, text) {
	const entry = index.notes[file];
	if (!entry) return null;
	return {pinned: entry.pinned === true, colour: entry.colour || '', section: entry.category || '',
		tags: isMarkdownNote(file) ? tagsOf(text) : [], archived: entry.archived === true, trashed: entry.trashed === true,
		reminder: cleanRemind(entry.remind)};
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

// Skills (only when enabled: absent, not collapsed), Pinned, the person's sections, Other. Archive and Trash never.
export function jumpOrder(index, options) {
	const skillsOn = !!(options && options.skillsOn);
	const ids = [];
	if (skillsOn) ids.push('skills');
	ids.push('pinned');
	for (const s of (Array.isArray(index.sections) ? index.sections : [])) ids.push(s.name);
	ids.push('others');
	return ids;
}

// Own sections carry `collapsed`; built-ins at the root. Archive and Trash keep none.
export function setCollapsed(index, id, collapsed) {
	const flag = collapsed === true;
	if (id === 'skills' || id === 'pinned' || id === 'others' || id === 'archive' || id === 'trash') return {...index, collapsed: {...index.collapsed, [id]: flag}};
	const at = index.sections.findIndex(s => s.name === id);
	if (at < 0) return index;
	const sections = index.sections.slice();
	sections[at] = {...sections[at], collapsed: flag};
	return {...index, sections};
}

// ---- Reminders: cleaned through cleanEntry's reader; null removes ----
export function setRemind(index, file, remind) {
	if (!index.notes[file]) return index;
	const entry = {...index.notes[file]};
	const clean = remind === null ? null : cleanRemind(remind);
	if (remind !== null && !clean) throw new TypeError('Invalid reminder');
	const previous = cleanRemind(entry.remind);
	const sameCalendar = clean && previous && clean.at === previous.at && JSON.stringify(reminderStep(clean)) === JSON.stringify(reminderStep(previous));
	// A handled occurrence belongs to its exact schedule, never to a replacement.
	if (!sameCalendar) {
		delete entry.remindDone;
		delete entry.remindDoneFor;
		delete entry.remindSnoozedUntil;
		delete entry.remindAction;
	} else if (entry.remindDoneFor === JSON.stringify(previous)) entry.remindDoneFor = JSON.stringify(clean);
	if (clean) entry.remind = clean; else delete entry.remind;
	return {...index, notes: {...index.notes, [file]: entry}};
}

// Keep's quick choices in LOCAL time via Date's local setters, never UTC math.
const LATER_TODAY_HOURS = [8, 13, 18, 20];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function remindChoices(now, options) {
	const morning = options && Number.isInteger(options.morning) ? options.morning : 8;
	const choices = [];
	// The next of the four Keep hours still at least an hour off; none left today omits the choice.
	for (const hour of LATER_TODAY_HOURS) {
		const at = new Date(now); at.setHours(hour, 0, 0, 0);
		if (at.getTime() >= now + 60 * 60 * 1000) { choices.push({id: 'later', label: 'Later today', at: at.getTime()}); break; }
	}
	const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(morning, 0, 0, 0);
	choices.push({id: 'tomorrow', label: 'Tomorrow morning', at: tomorrow.getTime()});
	const week = new Date(now); week.setDate(week.getDate() + 7); week.setHours(morning, 0, 0, 0);
	choices.push({id: 'week', label: 'Next ' + WEEKDAY_LONG[week.getDay()], at: week.getTime()});
	return choices;
}

// DST-safe day count via Date.UTC on the same Y/M/D.
function localDayNumber(date) { return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000); }
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 12-hour clock, am/pm, no leading zero on the hour, minutes always two digits: "4:00 pm", "9:05 am".
function clockWords(date) {
	const hour = date.getHours() % 12 || 12;
	return hour + ':' + String(date.getMinutes()).padStart(2, '0') + ' ' + (date.getHours() < 12 ? 'am' : 'pm');
}
// Via nextOccurrence, so a repeat shows its next slot. "(missed)" only for a passed non-repeating reminder.
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

// Clamp against the ANCHOR's day (31 Jan -> 28 Feb -> 31 Mar); Date normalises the month.
function monthDayOccurrence(anchor, year, month) {
	const lastDay = new Date(year, month + 1, 0).getDate();
	const day = Math.min(anchor.getDate(), lastDay);
	return new Date(year, month, day, anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds()).getTime();
}
// Rebuild from the anchor so a spring gap changes only that occurrence, never later hours.
// Date advances through a missing hour and chooses the earlier instant of a repeated hour.
// The sole mapping from product repeat rules to calendar increments. Native receives these
// numeric projections, never 'daily'/'weekly'/... rules or a finite occurrence horizon.
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
	// Invalid Date is beyond the supported date range. It must terminate the search,
	// including a very old daily anchor; never enumerate every elapsed occurrence.
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
		// Rows carry the note's id: a renamed note does not ring again. No id, no table until the next commit.
		rows.push({file, ...(typeof entry.id === 'string' ? {id: entry.id} : {}), title: String(title(file) || file).slice(0, 512), at: remind.at,
			...reminderStep(remind), done: remindDoneAt(entry), snoozeMinutes: remind.snoozeMinutes ?? 10, snoozedUntil: remindSnoozedAt(entry)});
	}
	return rows.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}
// Repeats are strictly after now so the reached slot is never scheduled twice; one-offs keep
// their own instant even when missed. Due/acknowledgement use currentOccurrence instead.
export function nextOccurrence(remind, now) {
	remind = cleanRemind(remind);
	if (!remind) return null;
	if (!remind.repeat) return remind.at;
	const at = repeatStep(remind, firstOccurrenceAfter(remind, now));
	return Number.isFinite(at) ? at : null;
}

// The latest occurrence at or before now; "due" and "handled" measure against it.
function currentOccurrence(remind, now) {
	remind = cleanRemind(remind);
	if (!remind || repeatStep(remind, 0) > now) return null;
	if (!remind.repeat) return remind.at;
	return repeatStep(remind, firstOccurrenceAfter(remind, now) - 1);
}
// A binding to another definition cannot suppress this schedule.
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
// Due while past remindDone: a one-off's `at` never moves.
export function dueReminders(index, now) {
	const out = [];
	for (const [file, entry] of Object.entries(index.notes)) {
		if (!entry.remind || entry.trashed) continue;
		const at = dueOccurrence(entry, now);
		if (at != null && at > remindDoneAt(entry)) out.push(file);
	}
	return out;
}
// Acknowledges the CURRENT occurrence (several missed repeats in one). `remind` stays. Unchanged index when nothing is due.
export function acknowledgeRemind(index, file, now) {
	const entry = index.notes[file];
	if (!entry || !entry.remind) return index;
	const at = dueOccurrence(entry, now);
	if (at == null || at <= remindDoneAt(entry)) return index;
	return {...index, notes: {...index.notes, [file]: {...entry, remindDone: at, remindDoneFor: JSON.stringify(cleanRemind(entry.remind)), remindSnoozedUntil: 0}}};
}

// Next visible reminder includes an outstanding snooze and excludes retired one-offs.
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
// Resolve the card's exact rule under the same lease as its metadata write. A stale card
// cannot remove or acknowledge a replacement reminder, even if its file name is reused.
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

// Receipts are replayed in their native order inside one folder-owner transaction. The
// last committed token skips the prefix after a crash between that commit and native ack.
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

// ---- The card, projected from the bytes. The title is a level-one heading (ATX or ===) and nothing else; a plain first line is body. One owner:
// toggleCheck finds the line the card drew; noteHead is the card's title. A picture line may carry its md-layout comment.
const PICTURE_LINE = /^(?:!\[(?:\\.|[^\]\\])*\](?:\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])(?:[ \t]*<!--md-layout:v1[ \t][^>\r\n]*-->)?\s*)+$/;
// A recording line is an attachment, never the title; no `lead` (the card draws its own row). Pattern kept here: audio.mjs imports this file.
const RECORDING_LINE = /^\[(?:\\.|[^\]\\])*\]\(\s*<?(?:audio|attachments)\/[^()<>]*>?\s*(?:"[^"]*"|'[^']*')?\s*\)$/;
function cardInkWords(line) {
	if (!line.includes('<!--')) return line;
	const words = stripInkMarkers(line);
	return words === line ? line : stripColorMarkers(words);
}
export function cardHead(lines, rawLines = lines) {
	let lead = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = cardInkWords(lines[i].trim());
		if (!line) continue;
		// Leading pictures head the card; the title is the first words after them.
		if (PICTURE_LINE.test(line)) { if (lead < 0) lead = i; continue; }
		if (RECORDING_LINE.test(line)) continue;
		// `at`: where the Title field stands when there is no title.
		// Inline formatting can contain literal heading-shaped words; only the raw prefix
		// establishes a heading. The displayed title still leaves its markers behind.
		const raw = rawLines[i].trim(), atx = /^#\s+(.*?)(?:\s+#+)?\s*$/.exec(raw); // a closing run of #s is not the title; C# is
		const setext = !atx && /^ {0,3}=+\s*$/.test(rawLines[i + 1] || '') && !/^(?:#|>|[-*+]\s|\d+[.)]\s|\|)/.test(raw);
		const word = atx ? cardInkWords(atx[1]).replace(/[*_`~]/g, '').trim() : setext ? line.replace(/[*_`~]/g, '').trim() : '';
		if (word) return {title: cutText(word, 80, 80), start: i + (setext ? 2 : 1), lead, at: i};
		return {title: '', start: i, lead, at: i};
	}
	return {title: '', start: lines.length, lead, at: -1};
}
// The Title field asks this, never a second reading.
export function noteHead(raws) {
	const lines = [], rawLines = [], owner = [];
	let at = -1;
	for (let b = 0; b < raws.length; b++) {
		const source = cardSource(raws[b]), own = source.visible;
		for (let i = 0; i < own.length; i++) { lines.push(own[i]); rawLines.push(source.lines[i]); owner.push(b); }
		lines.push(''); rawLines.push(''); owner.push(b); // blocks stand a blank line apart, as the file has them
		const head = cardHead(lines, rawLines);
		if (head.at >= 0) return {title: head.title ? owner[head.at] : -1, at: at >= 0 ? at : owner[head.at]};
		// No words yet: this block is the pictures the note opens with, or it holds nothing a card reads.
		if (at < 0 && !own.some(line => line.trim())) at = b;
	}
	return {title: -1, at: at >= 0 ? at : raws.length};
}
// A card is a conservative projection, not a parser: opaque source cannot nominate a checkbox; a conflict marker is advisory.
// `pieces` keep endings; `visible` blanks opaque lines.
export function cardSource(text) {
	const raw = String(text || ''), pieces = raw.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
	const lines = pieces.map(line => line.replace(/(?:\r\n|\r|\n)$/, ''));
	// Where the note's own words begin: the metadata reader's, not a second guess at a fence
	// (notes/frontmatter.mjs is the one reader of a block, and the block stays in the note's bytes,
	// so every projection that reads "the first line" steps over it -- the card's title and the
	// file's name alike).
	const body = parseFrontMatter(raw).body, frontEnd = frontLineCount(pieces, raw, body);
	// A conflict marker is a marker only where the note's own words are: one quoted inside the
	// metadata block is a value someone wrote, and must not put a card into review.
	const needsReview = body.includes('<!-- note-conflict:v1 ');
	// Container fences and raw HTML need the editor's grammar, not a card's quick projection.
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
		// Ink is inline formatting, not an opaque comment line. Keep its words in the card's
		// projection; `lines` still holds the exact markers for the shared preview renderer.
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
	// Leading pictures are body; the title's lines are never body.
	for (let i = lead >= 0 ? lead : start; i < lines.length && body.length < bodyLines; i++) {
		if (lead >= 0 && title && i >= at && i < start) continue;
		const line = lines[i].trim();
		if (!line) continue;
		// An item with no words is an item. This test, notes.js's card sentinel and toggleCheck must stay identical.
		const raw = rawLines[i].trim(), box = checkable && /^[-*]\s+\[( |x|X)\](?:\s+(.*))?$/.exec(raw);
		if (box) { checks.push({done: box[1] !== ' ', text: cutText(cardInkWords(box[2] || ''), 120, 120), ...(taskDepth ? {depth: /^  [-*]\s/.test(lines[i]) ? 1 : 0} : {})}); continue; }
		if (/^!\[/.test(raw)) { body.push('\u{1F5BC}'); continue; }
		body.push(cutText(cardInkWords(raw.replace(/^#{1,6}\s+/, '').replace(/^[-*>]\s+/, '')).replace(/[*_`~]/g, ''), 280, 280));
	}
	// `start` is where toggleCheck counts from.
	return {file, title: title || (body.length || checks.length ? '' : file.replace(/\.md$/i, '')), body, checks, empty: !title && !body.length && !checks.length, needsReview, start, lead};
}

// Only the tick changes (CR-only EOLs too); null when no such box or not tickable.
export function toggleCheck(text, n) {
	const {pieces, lines, visible, checkable} = cardSource(text);
	if (!checkable) return null;
	const {start} = cardHead(visible, lines);
	let seen = 0;
	for (let i = start; i < pieces.length; i++) {
		if (!visible[i]) continue;
		// Identical to projectCard and notes.js's sentinel.
		// Only the raw task prefix locates the writable byte: removing inline ink can expose
		// checkbox-shaped prose, and its offset must never be used against the original file.
		const m = /^(\s*[-*]\s+\[)( |x|X)(\](?:\s.*)?)$/.exec(lines[i]);
		if (!m || seen++ !== n) continue;
		pieces[i] = pieces[i].slice(0, m[1].length) + (m[2] === ' ' ? 'x' : ' ') + pieces[i].slice(m[1].length + 1);
		return pieces.join('');
	}
	return null;
}

// The first words a note opens with, as the person wrote them: after the front matter and any leading pictures, its first line with
// the Markdown marks taken off (heading, list, quote, link and picture syntax, escapes). A picture's alt only when there are no
// other words; `[image-…]: data:` lines are not words. The file's name is made from these (noteFileName), and so is what the note is
// called in a link (noteTitle); the one is made safe for a folder, the other is not.
function noteWords(text) {
	const lines = stripFrontMatter(String(text || '')).split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l && !/^\[(?:\\.|[^\]\\])+\]:[ \t]*<?data:/i.test(l));
	const first = lines.find(l => !PICTURE_LINE.test(l)) || lines[0] || '';
	return first.replace(/^#{1,6}\s+/, '').replace(/^(?:[-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s*)?/, '').replace(/^>\s+/, '').replace(/<!--md-layout:v1[ \t][^>\r\n]*-->/g, ' ')
		.replace(/!\[((?:\\.|[^\]\\])*)\](?:\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])/g, (m, alt) => alt.replace(/\.[a-z0-9]{2,5}$/i, '')).replace(/\[((?:\\.|[^\]\\])*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
		.replace(/\\([!-\/:-@\[-`{-~])/g, '$1');
}
// What a note is called where its name is written as words (a link's text): its first words as they stand, the card's own reading of
// them (ink and emphasis marks off, cut at 80), with every character kept that the file's name has to leave out. Empty for a note with none.
export function noteTitle(text) { return cutText(cardInkWords(noteWords(text)).replace(/[*_`~]/g, '').trim(), 80, 80); }
// {ascii: true} folds accents and drops other letters for folders that refuse non-ASCII.
export function noteFileName(text, existing = [], {ascii = false} = {}) {
	// Keep \p{M}: Indic and Thai vowels are marks. The ASCII fold is the only place marks come off.
	let base = noteWords(text).replace(/[^\p{L}\p{M}\p{N} _-]+/gu, '');
	if (ascii) base = base.normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^A-Za-z0-9 _-]+/g, '');
	// Keep the existing 48 UTF-16-unit bound, but never leave half an astral letter.
	base = base.trim().replace(/\s+/g, ' ');
	let end = Math.min(base.length, 48);
	if (end > 0 && end < base.length && /[\uD800-\uDBFF]/.test(base[end - 1]) && /[\uDC00-\uDFFF]/.test(base[end])) end--;
	// Trim after the cut: a trailing space in a file name.
	base = base.slice(0, end).replace(/\s+$/, '') || 'note';
	// These Windows device stems are not files even with an .md extension. The note's
	// words stay untouched; the same shared allocator still owns every collision.
	if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base += ' note';
	const taken = new Set(existing.map(f => f.toLowerCase()));
	let name = base + '.md', n = 2;
	while (taken.has(name.toLowerCase())) name = base + ' ' + (n++) + '.md';
	return name;
}
