// notes/sync.mjs -- the engine that cannot lose a note. Pure: no DOM, no fs, no fetch. The
// transport is injected; WebCrypto through globalThis.crypto.subtle. The shell mints a device id
// once per install and hands it in; this file never writes one into a note.
//
// Laws (docs/intent.md R85b, docs/notes-architecture.md "The network law", docs/notes-merge.md,
// docs/Rapier-Sync-architecture.md §5.1 and §6.3-6.4, docs/sync-engine.md):
//   - Identity is A8's (docs/notes-merge.md): a stable `namespace:counter` id, assigned once by
//     `admitIndex` (notes/merge.mjs) before a note is ever published. This file never mints or
//     derives an id from content or a filename -- a local note without one is a caller error and
//     is refused, fail closed, not guessed.
//   - Immutable objects and immutable head generations. A note version lives at objects/<sha-256 of the sealed
//     bytes>; each device appends heads/<device>/<generation>-<sealed digest>. Each encrypted
//     head names its exact predecessor. There is no mutable alias, timestamp winner, or remote
//     deletion. A fork of one install identity refuses automatic sync; both branches stay kept.
//   - plan() is a pure (async only for hashing) function of local + heads + capabilities: it reads
//     no object bytes, only hashes and sidecars already inline in a head. execute() alone holds the
//     vault key, so a genuine two-sided conflict is resolved there, once the words can be read.
//   - The merge is notes/merge.mjs: `mergeText` keeps a text conflict IN PLACE as its own
//     `<!-- note-conflict:v1 -->` block, never as a second file; `mergeIndex` merges sidecar fields
//     the same way A8 already merges a local index. Nothing here re-derives those rules.
//   - Absence is not deletion. A note missing from every other head is untouched locally. A
//     tombstone with retention is the only way a note leaves a device by way of the network.
//   - A replacement local state is built beside the current one and swapped only after hashes and
//     counts verify. A download that stops half way leaves the old state whole (KEEPLAW-002).
//   - Uploads are idempotent by hash. A duplicated PUT is a no-op. A timeout after a committed PUT
//     is discovered on the next listing, never re-uploaded as a new version.

import {admitPersonal, mergePersonal, personalAsset} from './personal.mjs';
import {noteFileName, isNoteFile, isCodeFile, codeFileName, emptyIndex} from './model.mjs';
import {mergeText, mergeIndex, assignNoteFilenames, inspectTextConflicts, mapTextConflictVariants} from './merge.mjs';
import {seal, open} from './vault.mjs';
import {recordingsOf} from './audio.mjs';
import {attachmentsOf} from './attachments.mjs';
import {planFolderRename} from './folder.mjs';
import {runTrash} from './trash.mjs';
import {manifestName, parseManifest, recordVersion} from './history.mjs';
import {buildLinkIndex, resolveLinkIndex, renameLinks} from './links.mjs';
import {planSyncMedia, rewriteSyncMedia} from './sync-media.mjs';
import {storedFileDigest} from './integrity.mjs';
import {assetDigest, assetBytes, assetSize, captureAsset} from './sync-assets.mjs';
import {SYNC_STATE_FILE, readSyncStateBytes, syncStateWrite, updateSyncState} from './sync-state.mjs';

export const HEAD_VERSION = 1;
export const OBJECT_PREFIX = 'objects/';
export const HEAD_PREFIX = 'heads/';
export const OBJECT_AAD = 'object';

const te = new TextEncoder();
const td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const subtle = () => globalThis.crypto.subtle;
// A8's own id shape (notes/model.mjs `cleanEntry`, notes/merge.mjs `ixID`): neither exports it, so
// this is a third copy rather than a new cross-file coupling -- the same choice those two made.
const NOTE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*$/;
function refuse(code, message) { throw Object.assign(new Error(message), {code}); }
function validId(id) { return typeof id === 'string' && NOTE_ID_RE.test(id); }

export async function sha256Hex(bytes) {
	const hash = new Uint8Array(await subtle().digest('SHA-256', bytes instanceof Uint8Array ? bytes : te.encode(String(bytes))));
	let hex = '';
	for (let i = 0; i < hash.length; i++) hex += hash[i].toString(16).padStart(2, '0');
	return hex;
}
export function canonicalText(text) { return String(text ?? ''); } // Byte fidelity, including CRLF and BOM.
export async function contentHash(text) { return sha256Hex(te.encode(canonicalText(text))); }
export function objectKey(hash) { return OBJECT_PREFIX + hash; }
// A generation is written in twelve digits, so discovery lists a device's heads from the last it saw. A vault
// published before wrote it unpadded: still read, sealed as written, and listed after every padded one.
const GENERATION_DIGITS = 12;
export const headGeneration = generation => String(generation).padStart(GENERATION_DIGITS, '0');
export function headKey(deviceId, generation, hash) {
	if (!DEVICE_RE.test(deviceId) || !Number.isSafeInteger(generation) || generation < 1 || generation >= 10 ** GENERATION_DIGITS || !HASH_RE.test(hash)) refuse('corrupt', 'invalid head address');
	return `${HEAD_PREFIX}${deviceId}/${headGeneration(generation)}-${hash}`;
}
const HASH_RE = /^[a-f0-9]{64}$/;
const MEDIA_OP_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}:[a-f0-9-]{36}$/;
const DEVICE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const HEAD_RE = /^heads\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/([0-9]{12}|[1-9][0-9]{0,10})-([a-f0-9]{64})$/;
const safeFile = file => isNoteFile(file) && !/[\0-\x1f\x7f]/.test(file);
// Provenance a person reads (docs/sync-design.md §1.2): the shelf's writer (notes/personal.mjs `by`) and a coarse label
// for the device ("Android phone", "Windows, Edge"), sealed in the head beside its device id. Display alone: a head
// holding one this engine does not admit is read without it, never refused for it.
const WRITER_RE = /^[a-f0-9]{32}$/;
export const headLabel = value => typeof value === 'string' && value.length > 0 && value.length <= 64 && value.trim() === value && !/[\0-\x1f\x7f]/.test(value) ? value : null;
const safeAsset = file => typeof file === 'string' && /^(?:audio|attachments)\/[^/\\\x00-\x1f\x7f]+$/.test(file) && !file.split('/')[1].startsWith('.');
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const headAAD = head => `${HEAD_PREFIX}${head.device}/${head.written ?? headGeneration(head.generation)}`;
const portableIndex = index => ({version: 1, notes: {}, sections: index?.sections || [], collapsed: index?.collapsed || {}});
function parseHeadKey(key) {
	const m = typeof key === 'string' && HEAD_RE.exec(key);
	if (!m || !(Number(m[2]) >= 1)) refuse('corrupt', 'invalid immutable head address');
	return {device: m[1], generation: Number(m[2]), hash: m[3], written: m[2]};
}
export async function snapshotToken(snapshot) {
	const assets = {};
	for (const [name, value] of Object.entries(snapshot.assets || {})) assets[name] = value.skipped ? {size: value.size, skipped: true} : {content: await assetDigest(value), size: assetSize(value)};
	// Owner bookkeeping moves while upload intents/checkpoints land; the person's content does not.
	const {ownerNotice, ...index} = snapshot.index || {};
	return sha256Hex(te.encode(JSON.stringify(sortObject({deviceId: snapshot.deviceId, assets,
		files: snapshot.files, index, personal: snapshot.personal?.records || {}, forgotten: snapshot.forgotten || [], head: snapshot.head || null, pending: snapshot.pending || null}))));
}

export function mintDeviceId() {
	const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
	let hex = '';
	for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
	return hex;
}

function copyEntry(entry) {
	if (!entry || typeof entry !== 'object') return {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: '', labels: []};
	return {...entry, labels: Array.isArray(entry.labels) ? entry.labels.slice() : []};
}
function defaultEntry() { return {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: '', labels: []}; }

export function emptyHead(deviceId) {
	return {v: HEAD_VERSION, device: deviceId, generation: 0, previous: null, seen: [], notes: {}, tombstones: {}, assets: {}, assetTombstones: {}, assetRevivals: [], metadata: portableIndex(null)};
}
export function encodeHead(head) {
	const notes = {};
	for (const id of Object.keys(head.notes || {}).sort()) notes[id] = head.notes[id];
	const tombstones = {};
	for (const id of Object.keys(head.tombstones || {}).sort()) tombstones[id] = head.tombstones[id];
	return te.encode(JSON.stringify({v: HEAD_VERSION, device: head.device, generation: head.generation ?? 0, previous: head.previous ?? null, seen: head.seen || [], notes, tombstones, assets: sortObject(head.assets || {}), assetTombstones: sortObject(head.assetTombstones || {}), assetRevivals: head.assetRevivals || [], ancestry: sortObject(head.ancestry || {}), metadata: head.metadata || portableIndex(null), personal: admitPersonal(head.personal || {}),
		...(head.writer ? {writer: head.writer} : {}), ...(head.label ? {label: head.label} : {})}));
}
function inspectHeadJSON(value, depth = 0) {
	if (depth > 64) refuse('corrupt', 'head metadata nesting exceeds this reader’s budget; kept data was not truncated');
	if (!value || typeof value !== 'object') return;
	for (const key of Object.keys(value)) {
		if (['__proto__', 'prototype', 'constructor'].includes(key)) refuse('corrupt', 'head metadata contains an unsafe field');
		inspectHeadJSON(value[key], depth + 1);
	}
}
export function decodeHead(bytes) {
	let raw;
	try { raw = JSON.parse(td.decode(bytes)); } catch { refuse('corrupt', 'the head is not readable UTF-8 JSON'); }
	inspectHeadJSON(raw);
	if (!record(raw) || raw.v !== HEAD_VERSION || !DEVICE_RE.test(raw.device) ||
		!Number.isSafeInteger(raw.generation) || raw.generation < 0 ||
		!(raw.previous === null || typeof raw.previous === 'string') || !record(raw.notes) || !record(raw.tombstones))
		refuse('corrupt', 'the head has an invalid envelope');
	if (raw.generation <= 1 ? raw.previous !== null : !raw.previous) refuse('corrupt', 'the head has no exact predecessor');
	if (raw.previous) {
		const prev = parseHeadKey(raw.previous);
		if (prev.device !== raw.device || prev.generation !== raw.generation - 1) refuse('corrupt', 'the head predecessor is not the preceding generation');
	}
	if (!Array.isArray(raw.seen) || new Set(raw.seen).size !== raw.seen.length) refuse('corrupt', 'the head has an invalid observed frontier');
	for (const key of raw.seen) { const seen = parseHeadKey(key); if (seen.device === raw.device && seen.generation >= raw.generation) refuse('corrupt', 'the head observes its own future'); }

	const names = new Set();
	for (const [kind, rows] of [['note', raw.notes], ['tombstone', raw.tombstones]]) for (const [id, r] of Object.entries(rows)) {
		if (!validId(id) || !record(r) || !safeFile(r.file) || !(HASH_RE.test(r.object) || kind === 'tombstone' && r.object === null) || !HASH_RE.test(r.content) ||
			!Array.isArray(r.parents) || r.parents.some(p => !HASH_RE.test(p) || p === r.object)) refuse('corrupt', 'the head has an invalid ' + kind + ' record');
		if (kind === 'note') {
			if (r.revivals !== undefined && (!Array.isArray(r.revivals) || r.revivals.some(op => !validId(op)) || new Set(r.revivals).size !== r.revivals.length)) refuse('corrupt', 'the note has invalid revival proofs');
			if (!record(r.sidecar) || r.sidecar.id !== id || (r.conflicts !== undefined && !Array.isArray(r.conflicts))) refuse('corrupt', 'the head sidecar has an invalid identity or conflict ledger');
			const name = r.file.normalize('NFC').toLowerCase();
			if (names.has(name)) refuse('corrupt', 'the head has colliding filenames');
			names.add(name);
		} else if (!Number.isFinite(r.at) || r.at < 0) refuse('corrupt', 'the tombstone has no explicit deletion time');
		if (kind === 'tombstone' && r.observed !== undefined) { if (!Array.isArray(r.observed)) refuse('corrupt', 'a deletion has no readable observed frontier'); for (const key of r.observed) parseHeadKey(key); }
		if (kind === 'tombstone' && r.deletions !== undefined) {
			if (!Array.isArray(r.deletions) || !r.deletions.length) refuse('corrupt', 'the deletion set is empty');
			for (const t of r.deletions) if (!record(t) || !safeFile(t.file) || t.priorFile !== undefined && !safeFile(t.priorFile) ||
				!(t.object === null || HASH_RE.test(t.object)) || !HASH_RE.test(t.content) || !Array.isArray(t.parents) || t.parents.some(p => !HASH_RE.test(p)) ||
				!Number.isSafeInteger(t.at) || t.at < 0 || t.baseEntry !== undefined && (!record(t.baseEntry) || t.baseEntry.id !== id) || t.opId !== undefined && (!validId(t.opId) || !DEVICE_RE.test(t.device))) refuse('corrupt', 'a deletion has no exact identity and content proof');
			for (const t of r.deletions) if (t.observed !== undefined) { if (!Array.isArray(t.observed)) refuse('corrupt', 'a deletion has no readable observed frontier'); for (const key of t.observed) parseHeadKey(key); }
		}
		if (kind === 'tombstone' && Object.hasOwn(raw.notes, id)) refuse('corrupt', 'a head cannot both keep and forget the same identity');
	}
	if (!record(raw.assets)) refuse('corrupt', 'the head has no readable media map');
	for (const [file, r] of Object.entries(raw.assets)) {
		if (!safeAsset(file) || !record(r) || !safeAsset(r.source) || !HASH_RE.test(r.object) || !HASH_RE.test(r.content) || !Array.isArray(r.parents) || r.parents.some(p => !HASH_RE.test(p))) refuse('corrupt', 'the head has an invalid media record');
	}
	if (!Array.isArray(raw.assetRevivals) || raw.assetRevivals.some(op => !MEDIA_OP_RE.test(op)) || new Set(raw.assetRevivals).size !== raw.assetRevivals.length) refuse('corrupt', 'the head has invalid media revival proofs');
	if (!record(raw.assetTombstones)) refuse('corrupt', 'the head has no readable media deletion map');
	for (const [opId, r] of Object.entries(raw.assetTombstones)) if (!record(r) || r.opId !== opId || !MEDIA_OP_RE.test(opId) || !safeAsset(r.file) || !safeAsset(r.source) || !HASH_RE.test(r.content) || !DEVICE_RE.test(r.device) || !Number.isSafeInteger(r.at) || r.at < 0) refuse('corrupt', 'the head has an invalid media deletion');
	if (!record(raw.ancestry)) refuse('corrupt', 'the head has no authenticated causal graph');
	for (const [object, parents] of Object.entries(raw.ancestry)) if (!HASH_RE.test(object) || !Array.isArray(parents) || parents.some(parent => !HASH_RE.test(parent) || parent === object)) refuse('corrupt', 'the head has an invalid causal graph');
	if (!record(raw.metadata) || !Array.isArray(raw.metadata.sections) || !record(raw.metadata.collapsed)) refuse('corrupt', 'the head has no readable portable metadata');
	raw.personal = admitPersonal(raw.personal || {});
	// A head written before provenance, or with a label this engine does not admit, is read without it.
	if (raw.writer !== undefined && !(typeof raw.writer === 'string' && WRITER_RE.test(raw.writer))) delete raw.writer;
	if (raw.label !== undefined && headLabel(raw.label) === null) delete raw.label;
	return raw;
}

function parentGraph(heads, extra = []) {
	const parents = new Map();
	const add = (object, list) => {
		if (!object) return;
		if (!parents.has(object)) parents.set(object, new Set());
		for (const p of Array.isArray(list) ? list : []) if (p) parents.get(object).add(p);
	};
	const visited = new Set();
	for (const tip of heads) for (const [object, list] of Object.entries(tip?.ancestry || tip?._parents || {})) add(object, list);
	for (const tip of heads) for (let head = tip; head && !visited.has(head); head = head._previousHead) {
		visited.add(head);
		for (const rec of Object.values(head.notes || {})) add(rec.object, rec.parents);
		for (const rec of Object.values(head.tombstones || {})) add(rec.object, rec.parents);
	}
	for (const rec of extra) add(rec && rec.object, rec && rec.parents);
	return parents;
}
function ancestorsOf(object, parents) {
	const seen = new Set();
	const q = [object];
	while (q.length) {
		const x = q.pop();
		if (!x || seen.has(x)) continue;
		seen.add(x);
		for (const p of parents.get(x) || []) q.push(p);
	}
	return seen;
}
function commonAncestor(a, b, parents) {
	if (!a || !b) return null;
	if (a === b) return a;
	const aUp = ancestorsOf(a, parents);
	const bUp = ancestorsOf(b, parents);
	if (aUp.has(b)) return b;
	if (bUp.has(a)) return a;
	for (const x of aUp) if (x !== a && bUp.has(x)) return x;
	return null;
}
function isAncestor(older, newer, parents) {
	if (!older || !newer || older === newer) return older === newer;
	return ancestorsOf(newer, parents).has(older);
}
function tipsOf(hashes, parents) {
	const unique = [...new Set(hashes.filter(Boolean))];
	const covered = new Set();
	for (const h of unique) for (const a of ancestorsOf(h, parents)) if (a !== h) covered.add(a);
	return unique.filter(h => !covered.has(h));
}

function sortObject(value) {
	if (Array.isArray(value)) return value.map(sortObject);
	if (value && typeof value === 'object') {
		const out = {};
		for (const k of Object.keys(value).sort()) out[k] = sortObject(value[k]);
		return out;
	}
	return value;
}

// A generic collision name, never "(other device)": two DIFFERENT ids landing on one preferred
// filename are two different notes (A8 identity), not one note seen twice, so the ordinary
// duplicate-name suffix model.mjs already writes for every other new note is the honest one.
function claimFile(preferred, taken, seedText) {
	if (safeFile(preferred) && ![...taken].some(name => name.normalize('NFC').toLowerCase() === preferred.normalize('NFC').toLowerCase())) return preferred;
	return (isCodeFile(preferred) && codeFileName(preferred, [...taken])) || noteFileName(seedText || (preferred || 'note').replace(/\.md$/i, ''), [...taken]);
}
// A code file is bytes (docs/sync-design.md §2.2): sync never reads a link or a recording in it, never
// rewrites it, and never folds two versions into one conflict block. Its words pass through as they are.
const noteText = (file, text, rewrite) => isCodeFile(file) ? text : rewrite(text);

// A single-note index lets the sidecar fold reuse A8's whole-index field/rename rules (mergeIndex)
// exactly, rather than a second hand-written field-by-field merge. sections/collapsed/tombstones
// are never part of this: only the one id in question is.
function noteIndex(fe) { return fe ? {version: 1, notes: {[fe.file]: fe.entry}} : null; }
function mergeSidecar(base, ours, theirs, oursId, theirsId, options = {}) {
	const result = mergeIndex(noteIndex(base), noteIndex(ours), noteIndex(theirs), {oursId, theirsId, ...options});
	const file = Object.keys(result.index.notes)[0];
	return {file, entry: result.index.notes[file], conflicts: result.conflicts};
}
// mergeText already returns clean text with the conflict, if any, folded IN PLACE; this only tags
// the record with where it lives so a whole-vault conflict ledger can say which note it is about.
async function textConflictDigest(conflict, id) {
	return {kind: conflict.kind, path: ['notes', id, 'text'], blockHash: await contentHash(conflict.block),
		variants: await Promise.all(conflict.variants.map(async v => ({device: v.device, content: await contentHash(v.text)})))};
}
async function mergeContent(id, baseText, oursText, theirsText, oursId, theirsId) {
	if (oursText === theirsText) return {text: oursText, clean: true, conflicts: []};
	const result = mergeText(baseText ?? null, oursText, theirsText, {oursId, theirsId});
	const conflicts = await Promise.all(result.conflicts.filter(c => typeof c.block === 'string').map(c => textConflictDigest(c, id)));
	return {text: result.text, clean: result.clean, conflicts};
}

function localNotes(local) {
	const files = local.files || {};
	const index = local.index || emptyIndex();
	const out = [];
	for (const file of Object.keys(files).sort()) {
		if (!isNoteFile(file)) continue;
		const rec = files[file];
		const text = typeof rec === 'string' ? rec : rec.text;
		if (!safeFile(file) || typeof text !== 'string') refuse('bytes', 'a local note must have a safe filename and exact text');
		out.push({file, text, entry: copyEntry(index.notes[file])});
	}
	return out;
}

// Every local note that reaches here must already carry A8's id: admission (admitIndex) is the
// caller's job, before a note is ever handed to plan(). Fail closed rather than mint one -- a note
// without an id names a house law the caller skipped, not a case this engine should paper over.
async function hashedLocals(local, historyParents) {
	const rows = localNotes(local);
	const ourHead = local.head && local.head.device === local.deviceId ? local.head : emptyHead(local.deviceId);
	const out = [], seen = new Set();
	for (const row of rows) {
		const id = row.entry && row.entry.id;
		if (!validId(id) || seen.has(id)) refuse('identity', 'local notes need unique admitted identities');
		seen.add(id);
		const content = await contentHash(row.text);
		const known = ourHead.notes[id];
		const parents = known?.object ? (known.content === content ? (known.parents || []) : [known.object]) : [];
		const cached = local.byContent?.[content];
		const adopted = cached && !parents.some(p => isAncestor(cached, p, historyParents)) ? cached : null;
		out.push({
			id, file: row.file, text: row.text, content, entry: {...row.entry, id},
			object: known && known.content === content ? known.object : adopted,
			revivals: known?.revivals || [], key: ourHead._key || null,
			changedFromHead: !!known && (row.file !== known.file || content !== known.content || !same(deletionMetadata(row.entry), deletionMetadata(known.sidecar)) || known.sidecar.trashed === true && row.entry.trashed !== true), parents,
		});
	}
	return {rows: out, ourHead};
}

// A malformed remote id (never written by this engine) names nothing: dropped, not acted on --
// the fail-closed twin of hashedLocals' refusal for a local note missing one.
function collectById(localRows, heads) {
	const byId = new Map();
	const touch = (id, rec) => {
		if (!validId(id)) return;
		if (!byId.has(id)) byId.set(id, {versions: [], tombstones: []});
		const slot = byId.get(id);
		if (rec.tombstone) slot.tombstones.push(rec);
		else slot.versions.push(rec);
	};
	for (const row of localRows) touch(row.id, {source: 'local', ...row});
	for (const head of heads) {
		for (const [id, rec] of Object.entries(head.notes || {})) {
			touch(id, {source: 'head', device: head.device, key: head._key || null, id, file: rec.file, object: rec.object, content: rec.content, entry: rec.sidecar || rec.entry || {}, parents: rec.parents || [], conflicts: rec.conflicts || [], revivals: rec.revivals || []});
		}
		for (const [id, rec] of Object.entries(head.tombstones || {})) {
			for (const t of rec.deletions || [rec]) touch(id, {source: 'head', ...t, device: t.device || head.device, id, tombstone: true});
		}
	}
	return byId;
}

// A tombstone of object X wins only when every remaining live version is X itself or an ancestor
// of X (the person still has the deleted bytes, or older bytes later deleted). A concurrent or
// later edit is not an ancestor of the tombstone, so the edit stands -- "delete on one, edit on
// the other: the edit wins".
function deletionMetadata(entry) {
	return Object.fromEntries(Object.entries(entry || {}).filter(([key]) => !['revision', 'trashed', 'archived', 'trashedAt', 'trashDigest', 'trashRevision', 'modified', 'created'].includes(key)));
}
function tombstoneWins(localRow, tombstones, liveVersions, parents) {
	if (!tombstones.length) return false;
	const lives = [...(localRow ? [localRow] : []), ...(liveVersions || [])].filter(v => v && (v.object || v.content));
	if (!lives.length) return true;
	for (const live of lives) {
		if (live.source === 'local' && live.changedFromHead) return false;
		let covered = false;
		for (const t of tombstones) {
			const observed = live.key && (t.observed || []).includes(live.key);
			if (!observed && live.file !== t.file && live.file !== t.priorFile || (live.revivals || []).includes(t.opId)) continue;
			if (!observed && t.baseEntry && live.entry && !same(deletionMetadata(t.baseEntry), deletionMetadata(live.entry))) continue;
			if (live.object && [t.object, ...(t.parents || [])].some(object => object && (object === live.object || isAncestor(live.object, object, parents)))) { covered = true; break; }
			if (t.content && live.content && t.content === live.content) { covered = true; break; }
		}
		if (!covered) return false;
	}
	return true;
}

function headPayload(head) { return sortObject({notes: head.notes, tombstones: head.tombstones, assets: head.assets || {}, assetTombstones: head.assetTombstones || {}, assetRevivals: head.assetRevivals || [], metadata: head.metadata, personal: head.personal || {}, writer: head.writer ?? null, label: head.label ?? null}); }
function same(left, right) { return JSON.stringify(sortObject(left)) === JSON.stringify(sortObject(right)); }
function uniqueConflicts(rows, active = null) {
	const unique = [...new Map(rows.map(c => [JSON.stringify(sortObject(c)), c])).values()];
	const keys = c => c.blockHash && c.path?.[2] === 'text' ? new Set(c.variants.map(v => v.device + ':' + v.content)) : null;
	const sets = unique.map(keys);
	// A larger exact variant union supersedes the smaller ledger descriptor. The words remain
	// in the live block and immutable history; keeping every expanding digest list is quadratic.
	return unique.filter((c, i) => !active || active.has(c.blockHash) || !sets[i] || !unique.some((other, j) => j !== i && active.has(other.blockHash) && sets[j]?.size > sets[i].size &&
		same(c.path, other.path) && [...sets[i]].every(key => sets[j].has(key))));
}

export async function plan(local, heads, capabilities) {
	const deviceId = local.deviceId;
	if (!DEVICE_RE.test(deviceId)) refuse('identity', 'a stable install identity is required');
	if (local.pending) refuse('pending', 'finish the durable pending publication before planning another sync');
	const expected = await snapshotToken(local);
	const allHeads = (Array.isArray(heads) ? heads.slice() : []).sort((a, b) => (a.device < b.device ? -1 : a.device > b.device ? 1 : 0));
	const published = allHeads.find(h => h && h.device === deviceId);
	if (local.head?._key && published?._key !== local.head._key) refuse('rollback', 'this install checkpoint and its published head differ; keep both copies and reconnect the restored copy with a fresh install identity');
	const assets = await planSyncMedia(local, allHeads, capabilities);
	const rewrittenFiles = Object.fromEntries(Object.entries(local.files || {}).map(([file, value]) => [file, {text: noteText(file, typeof value === 'string' ? value : value.text, text => rewriteSyncMedia(text, assets.mappings.local))}]));
	const localForHash = {...local, files: rewrittenFiles, head: local.head?.device === deviceId ? local.head : published || local.head || emptyHead(deviceId)};
	const {rows: locals, ourHead} = await hashedLocals(localForHash, parentGraph([localForHash.head, ...allHeads]));
	if (!local.head && published && locals.some(row => {
		const known = published.notes[row.id];
		return known && (known.content !== row.content || !same(known.sidecar, row.entry));
	})) refuse('rollback', 'the restored copy has no checkpoint proving these changes; keep both copies and reconnect with a fresh install identity');
	const others = allHeads.filter(h => h && h.device !== deviceId);
	// Reuse discovery's already-read predecessor chain, not a second persisted base/cache.
	// A peer's unchanged generation is no new field edit, even after our own publication.
	const observed = new Set(local.observed || []), peerBases = new Map();
	for (const tip of allHeads) {
		let base = tip;
		while (base && !observed.has(base._key)) base = base._previousHead;
		peerBases.set(tip.device, base || null);
	}
	const graphHeads = [ourHead, ...others];
	const parents = parentGraph(graphHeads, locals);
	const byId = collectById(locals, graphHeads);
	for (const row of locals) if (!byId.has(row.id)) byId.set(row.id, {versions: [{source: 'local', ...row}], tombstones: []});

	const forgotten = Array.isArray(local.forgotten) ? local.forgotten : [];
	for (const f of forgotten) {
		if (!validId(f.id)) continue;
		if (!byId.has(f.id)) byId.set(f.id, {versions: [], tombstones: []});
		const known = ourHead.notes[f.id] || ourHead.tombstones[f.id];
		byId.get(f.id).tombstones.push({source: 'local', tombstone: true, ...f, content: f.content || (known?.object === f.object ? known.content : null)});
	}

	// Absence alone never deletes. Only completed operations from Trash's own durable ledger
	// publish intent; an unsynced last edit still covers its previously published ancestors.
	for (const [id, rows] of Object.entries(local.index?.tombstones || {})) for (const row of rows) {
		if (row.pending || row.revivedAt !== undefined || !Number.isSafeInteger(row.deletedAt)) continue;
		if (!validId(id) || !HASH_RE.test(row.digest)) refuse('corrupt', 'a completed note deletion has no exact proof');
		if (!byId.has(id)) byId.set(id, {versions: [], tombstones: []});
		if (byId.get(id).tombstones.some(t => t.opId === row.opId)) continue;
		const known = ourHead.notes[id] || ourHead.tombstones[id];
		byId.get(id).tombstones.push({source: 'local', tombstone: true, id, file: row.file,
			opId: row.opId, device: row.device || deviceId, at: row.at ?? row.deletedAt,
			// Only the authenticated checkpoint captured when deletion was issued can
			// attest that an older peer name/metadata was already observed, never a new listing.
			...(row.checkpoint && row.checkpoint === ourHead._key ? {observed: [...new Set([ourHead._key, ...(ourHead.seen || [])])].sort()} : {}),
			priorFile: known?.file || row.file, ...(known?.sidecar ? {baseEntry: known.sidecar} : {}), content: row.digest, object: known?.content === row.digest ? known.object : null,
			parents: known?.object && known.content !== row.digest ? [known.object] : known?.parents || []});
	}

	const uploads = [], downloads = [], localWrites = [], localTrash = [], merges = [], renames = [], deletionConflicts = [];
	const revivalById = new Map();
	const tombstonesOut = {}, notesOut = {};

	const knownObjectFor = (content, row) => {
		if (row && row.object) return row.object;
		const cached = local.byContent?.[content];
		if (cached && !(row?.parents || []).some(p => isAncestor(cached, p, parents))) return cached;
		if (ourHead.notes[row && row.id] && ourHead.notes[row.id].content === content) return ourHead.notes[row.id].object;
		return null;
	};
	const publish = (row, extra = {}) => {
		const object = row.object || extra.object || knownObjectFor(row.content, row);
		const rec = {file: row.file, object: object || null, content: row.content, sidecar: copyEntry(row.entry), parents: row.parents || extra.parents || [], ...((extra.conflicts || []).length ? {conflicts: extra.conflicts} : {})};
		notesOut[row.id] = rec;
		const alreadyPublished = !!(object && ourHead.notes[row.id] && ourHead.notes[row.id].object === object && ourHead.notes[row.id].content === row.content);
		if (row.text != null && !alreadyPublished && extra.adopted !== true) {
			uploads.push({id: row.id, file: row.file, content: row.content, text: row.text, object: object || null, parents: rec.parents, ancestors: [...new Set(rec.parents.flatMap(p => [...ancestorsOf(p, parents)]))], sidecar: rec.sidecar});
		}
	};

	const ids = [...byId.keys()].sort();
	for (const id of ids) {
		const slot = byId.get(id);
		const localRow = slot.versions.find(v => v.source === 'local') || null;
		const remoteVersions = slot.versions.filter(v => v.source === 'head' && (v.device !== deviceId || !localRow));
		const tombs = slot.tombstones;
		const revivals = new Set(slot.versions.flatMap(v => v.revivals || []));
		// A local Restore of Trash is intent even when the original bytes are unchanged.
		if (localRow && (ourHead.tombstones[id] || ourHead.notes[id]?.sidecar.trashed === true && localRow.entry.trashed !== true)) {
			for (const t of tombs) if (t.opId) revivals.add(t.opId);
		}
		if (localRow) localRow.revivals = [...revivals].sort();
		revivalById.set(id, [...revivals].sort());
		const activeTombs = tombs.filter(t => !t.opId || !revivals.has(t.opId));

		if (activeTombs.length && tombstoneWins(localRow, activeTombs, remoteVersions, parents)) {
			const t = activeTombs.slice().sort((a, b) => String(a.file || '').localeCompare(String(b.file || '')))[0];
			if (localRow) localTrash.push({id, file: localRow.file, content: localRow.content, at: t.at || 0});
			const clean = row => ({file: row.file, ...(row.observed ? {observed: row.observed} : {}), priorFile: row.priorFile || row.file, ...(row.baseEntry ? {baseEntry: row.baseEntry} : {}), at: row.at || 0, object: row.object || null, content: row.content, parents: row.parents || [], ...(row.opId ? {opId: row.opId, device: row.device} : {})});
			tombstonesOut[id] = {...clean(t), deletions: [...new Map(activeTombs.map(row => [JSON.stringify(clean(row)), clean(row)])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row)};
			continue;
		}
		if (activeTombs.length && (localRow || remoteVersions.length)) {
			deletionConflicts.push({kind: 'delete-edit', path: ['notes', id], deletions: activeTombs.map(t => ({opId: t.opId || null, device: t.device, at: t.at, content: t.content}))});
			for (const t of activeTombs) if (t.opId) revivals.add(t.opId);
			revivalById.set(id, [...revivals].sort());
		}
		if (!localRow && !remoteVersions.length) continue;

		if (!localRow && remoteVersions.length) {
			const contentSet = new Set(remoteVersions.map(v => v.content).filter(Boolean));
			const tipHashes = tipsOf(remoteVersions.map(v => v.object).filter(Boolean), parents).sort();
			if (contentSet.size <= 1 || tipHashes.length <= 1) {
				const v = remoteVersions.find(r => r.object === tipHashes[0]) || remoteVersions[0];
				const file = v.file;
				const carried = (v.conflicts || []).length ? {conflicts: v.conflicts} : {};
				downloads.push({id, device: v.device, key: objectKey(v.object), hash: v.object, file, sidecar: copyEntry(v.entry), content: v.content, parents: v.parents || [], ...carried});
				notesOut[id] = {file, object: v.object, content: v.content, sidecar: copyEntry(v.entry), parents: v.parents || [], ...carried};
			} else {
				const tipRows = tipHashes.map(hash => remoteVersions.find(r => r.object === hash)).filter(Boolean);
				const file = tipRows[0].file;
				merges.push({id, file, oursText: null, oursDevice: null, oursEntry: null, oursObject: null, base: null,
					tips: tipRows.map(v => ({object: v.object, device: v.device, file: v.file, entry: v.entry, content: v.content, parents: v.parents || []}))});
				notesOut[id] = {file, object: null, content: null, sidecar: copyEntry(tipRows[0].entry), parents: []};
			}
			continue;
		}

		if (localRow && !remoteVersions.length) {
			const had = local.index && local.index.notes[localRow.file] && local.index.notes[localRow.file].id === localRow.id;
			if (!had) localWrites.push({file: localRow.file, sidecar: {...copyEntry(localRow.entry), id: localRow.id}});
			publish(localRow);
			continue;
		}

		// localRow && remoteVersions.length: one note, known on both sides.
		const remoteTips = tipsOf(remoteVersions.map(v => v.object).filter(Boolean), parents);
		const ourTip = localRow.object || null;
		const ourBase = localRow.object || (ourHead.notes[id] && ourHead.notes[id].object) || null;
		const locallyEdited = !!(ourHead.notes[id] && ourHead.notes[id].content !== localRow.content);
		// Bytes, never the object hash, decide sameness: a fresh nonce seals identical text to a
		// different object every time (vault.mjs), so two devices agreeing on words rarely agree on
		// an object hash. Astra's audit (§9.2) is the opposite claim -- equal bytes are not IDENTITY
		// -- and does not apply here: this is one id already, by construction.
		// Departed heads can keep older bytes indefinitely. Only causal tips compete
		// with the current source; an already-covered ancestor is not another edit.
		const remoteTipRows = remoteVersions.filter(v => remoteTips.includes(v.object));
		const sameContent = remoteTipRows.length > 0 && remoteTipRows.every(v => v.content === localRow.content);

		if (sameContent) {
			// Equal bytes may be a deliberate return to an ancestor, not adoption of that old
			// version. A causal child must never reuse any of its own ancestor addresses.
			const object = [ourTip, ...remoteTipRows.map(v => v.object)].find(hash => hash && !localRow.parents.some(p => isAncestor(hash, p, parents))) || null;
			publish({...localRow, object}, {adopted: !ourTip && !!object, object});
			continue;
		}

		const remoteNewer = !!(ourBase && remoteTips.length === 1 && remoteTips.every(t => t !== ourBase && isAncestor(ourBase, t, parents))) && !locallyEdited;
		const weAreNewer = !!(ourBase && remoteTips.length && remoteTips.every(t => t === ourBase || isAncestor(t, ourBase, parents))) && (locallyEdited || !!(ourTip && !remoteTips.every(t => t === ourTip)));

		if (remoteNewer) {
			const tip = remoteTips.slice().sort()[0];
			const theirs = remoteVersions.find(v => v.object === tip) || remoteVersions[0];
			const sidecar = {...copyEntry(theirs.entry), id};
			const carried = (theirs.conflicts || []).length ? {conflicts: theirs.conflicts} : {};
			downloads.push({id, device: theirs.device, key: objectKey(theirs.object), hash: theirs.object, file: localRow.file, sidecar, content: theirs.content, parents: theirs.parents || [], ...carried});
			notesOut[id] = {file: localRow.file, object: theirs.object, content: theirs.content, sidecar, parents: theirs.parents || [], ...carried};
			continue;
		}
		if (weAreNewer) {
			const had = local.index && local.index.notes[localRow.file] && local.index.notes[localRow.file].id === localRow.id;
			if (!had) localWrites.push({file: localRow.file, sidecar: {...copyEntry(localRow.entry), id: localRow.id}});
			publish(localRow);
			continue;
		}

		// Genuine divergence: text and/or sidecar differ on both sides with no fast-forward. Only
		// execute() holds the vault key that can read a remote tip's words, so the actual fold
		// (mergeText, mergeIndex) happens there; this records WHAT needs it, deterministically.
		const tipRows = tipsOf(remoteVersions.map(v => v.object).filter(Boolean), parents).map(hash => remoteVersions.find(v => v.object === hash)).filter(Boolean);
		merges.push({
			id, file: localRow.file, oursText: localRow.text, oursDevice: deviceId,
			oursEntry: copyEntry(localRow.entry), oursObject: ourTip,
			base: commonAncestor(ourBase, tipRows[0]?.object, parents),
			tips: tipRows.map(v => ({object: v.object, device: v.device, file: v.file, entry: v.entry, content: v.content, parents: v.parents || []})),
		});
		notesOut[id] = {file: localRow.file, object: ourTip, content: localRow.content, sidecar: copyEntry(localRow.entry), parents: localRow.parents || []};
	}

	const deferredIds = new Set(), deferredFiles = new Set();
	for (const [file, value] of Object.entries(local.files || {})) {
		const text = typeof value === 'string' ? value : value.text;
		if (isCodeFile(file)) continue;
		if ([...recordingsOf(text).map(row => 'audio/' + row.name), ...attachmentsOf(text).map(row => 'attachments/' + row.name)].some(name => assets.skipped.includes(name))) {
			deferredIds.add(local.index.notes[file]?.id); deferredFiles.add(file);
		}
	}
	// A linked note stays local too: publishing it alone would strand another device with a
	// missing dependency. Absence is not deletion; existing remote copies remain untouched.
	for (const id of deferredIds) delete notesOut[id];

	// Metadata has its own changes. A content fast-forward must not choose a whole sidecar,
	// and a text merge must never pretend the current sidecar is its common ancestor.
	const downloadsById = new Map(downloads.map(row => [row.id, row]));
	const mergesById = new Map(merges.map(row => [row.id, row]));
	const requestedFile = (id, row, ledger = []) => [...(row.conflicts || []), ...ledger]
		.find(conflict => conflict.kind === 'filename-collision' && conflict.noteID === id && conflict.assigned === row.file)?.requested || row.file;
	for (const [id, rec] of Object.entries(notesOut)) {
		const versions = byId.get(id).versions;
		const localRow = versions.find(v => v.source === 'local');
		const allPeers = versions.filter(v => v.source === 'head' && (v.device !== deviceId || !localRow));
		// A first-seen note has no local observation base. Its authenticated remote
		// frontier still distinguishes an already-observed rename from a concurrent one.
		const observedPeers = localRow ? null : new Set(allHeads.filter(head => head.notes[id]).flatMap(head => head.seen));
		const peers = localRow ? allPeers : allPeers.filter(peer => !observedPeers.has(peer.key));
		const seed = localRow || peers.find(v => v.object === rec.object) || peers[0];
		// A collision suffix is the allocator's decision, not a second authored rename.
		// Compare the recorded requested names, then allocate the merged identities once.
		let entry = copyEntry(seed.entry), chosenFile = requestedFile(id, seed, seed === localRow ? local.index?.conflicts : []);
		let conflicts = [...(local.index?.conflicts || []).filter(c => c.path?.[0] === 'notes' && c.path[1] === id), ...(ourHead.notes[id]?.conflicts || []), ...allPeers.flatMap(v => v.conflicts || [])];
		for (const peer of peers) {
			if (peer === seed) continue;
			const prior = peerBases.get(peer.device), seen = allHeads.find(head => head.device === peer.device)?._seenHead;
			// A peer can first arrive after editing our published state. Its authenticated
			// seen frontier supplies that base even when we never saw its earlier head.
			const base = (seen && (!prior || seen.seen.includes(prior._key)) ? seen : prior)?.notes[id];
			const step = mergeSidecar(base ? {file: requestedFile(id, base), entry: base.sidecar} : null,
				{file: chosenFile, entry}, {file: requestedFile(id, peer), entry: peer.entry}, localRow ? deviceId : seed.device, peer.device,
				{changedNoteIDs: {ours: !base || seed.content !== base.content ? [id] : [], theirs: !base || peer.content !== base.content ? [id] : []},
					mergedRevisions: {[id]: 'sha256:' + (rec.content || seed.content)}});
			entry = step.entry; chosenFile = step.file; conflicts.push(...step.conflicts);
		}
		if (deletionConflicts.some(c => c.path[1] === id)) {
			entry = {...entry, trashed: false, archived: false}; delete entry.trashedAt; delete entry.trashDigest; delete entry.trashRevision;
		}
		rec.file = chosenFile;
		if (revivalById.get(id)?.length) rec.revivals = revivalById.get(id);
		rec.sidecar = entry;
		conflicts = uniqueConflicts(conflicts);
		if (conflicts.length) rec.conflicts = conflicts;
	}
	// Allocate once across identities, never against this device's temporary path ownership.
	const reserved = Object.keys(local.files || {}).filter(file => !locals.some(row => row.file === file && notesOut[row.id]));
	for (const named of assignNoteFilenames(Object.entries(notesOut).map(([id, rec]) => ({file: rec.file, entry: {...rec.sidecar, id}})), reserved)) {
		const id = named.entry.id, rec = notesOut[id], localRow = locals.find(row => row.id === id), entry = rec.sidecar;
		rec.file = named.file;
		const conflicts = [...(rec.conflicts || [])];
		if (named.file !== named.requested) conflicts.push({kind: 'filename-collision', path: ['notes', id, 'file'], noteID: id, requested: named.requested, assigned: named.file});
		if (conflicts.length) rec.conflicts = uniqueConflicts(conflicts);
		if (localRow && rec.file !== localRow.file) renames.push({id, file: localRow.file, wanted: rec.file, content: await contentHash(typeof local.files[localRow.file] === 'string' ? local.files[localRow.file] : local.files[localRow.file].text)});
		const download = downloadsById.get(id), merge = mergesById.get(id);
		if (download) { download.file = rec.file; download.sidecar = entry; if (conflicts.length) download.conflicts = conflicts; }
		if (merge) { merge.file = rec.file; merge.sidecar = entry; merge.conflicts = conflicts; }
		else {
			if (localRow && !same(entry, localRow.entry)) localWrites.push({file: rec.file, sidecar: entry});
			if (!download && conflicts.length) merges.push({id, file: rec.file, sidecarOnly: true, conflicts});
		}
	}

	// Normalize each proved old filename before folding text, including both sides of a
	// rename conflict. Names occupied by another identity are ambiguous and stay literal.
	const aliases = new Map(), addAliases = rows => {
		for (const [id, row] of rows) {
			if (!aliases.has(row.file)) aliases.set(row.file, new Set()); aliases.get(row.file).add(id);
		}
	};
	for (const [id, slot] of byId) addAliases(slot.versions.map(row => [id, row]));
	for (const head of [...graphHeads, ...peerBases.values()].filter(Boolean)) addAliases(Object.entries(head.notes));
	const occupiedNames = new Map(Object.entries(notesOut).map(([id, rec]) => [rec.file, id])), linkRenames = [];
	for (const [file, owners] of aliases) {
		if (owners.size !== 1) continue;
		const id = [...owners][0], wanted = notesOut[id]?.file;
		if (wanted && file !== wanted && (!occupiedNames.has(file) || occupiedNames.get(file) === id)) linkRenames.push({file, wanted});
	}
	// The same name can mean different notes on two branches. Resolve each source in
	// its own authenticated namespace before merging; the final allocator cannot tell
	// which identity a peer's pre-collision link used to name after those bytes are folded.
	const linksFor = entries => entries.filter(([id]) => notesOut[id])
		.map(([id, row]) => ({file: row.file, wanted: notesOut[id].file}));
	const linkContexts = {local: linksFor(locals.map(row => [row.id, row])), heads: {}, objects: {}};
	for (const head of [...graphHeads, ...peerBases.values(), ...allHeads.map(head => head._seenHead)].filter(Boolean)) {
		const mapping = linksFor(Object.entries(head.notes));
		for (const rec of Object.values(head.notes)) if (rec.object) (linkContexts.objects[rec.object] ||= []).push(mapping);
	}
	for (const head of allHeads) linkContexts.heads[head.device] = linksFor(Object.entries(head.notes));

	let metadata = portableIndex(local.index);
	const rootConflicts = [...deletionConflicts, ...(assets.conflicts || [])];
	for (const other of others) {
		const result = mergeIndex(peerBases.get(other.device)?.metadata || null, metadata, other.metadata || portableIndex(null), {oursId: deviceId, theirsId: other.device});
		metadata = portableIndex(result.index); rootConflicts.push(...result.conflicts);
	}
	const previous = published?._key || ourHead._key || null;
	const generation = (published?.generation || ourHead.generation || 0) + 1;
	const head = {v: HEAD_VERSION, device: deviceId, generation, previous, seen: allHeads.map(head => head._key).filter(Boolean).sort(), notes: notesOut, tombstones: tombstonesOut, assets: assets.output, assetTombstones: assets.tombstones, assetRevivals: assets.assetRevivals, metadata};
	if (typeof local.writer === 'string' && WRITER_RE.test(local.writer)) head.writer = local.writer;
	if (headLabel(local.label)) head.label = local.label;
	head.personal = mergePersonal(ourHead.personal, ...allHeads.map(head => head.personal), local.personal?.records);
	// The shelf is shared between collections; an encrypted address belongs to one vault.
	// Only this collection's authenticated heads can carry an address into its next head.
	const personalObjects = new Set([ourHead, ...allHeads].flatMap(head => Object.values(head.personal || {}).filter(row => row.value?.object).map(row => row.value.content + ':' + row.value.object)));
	for (const [key, row] of Object.entries(head.personal)) if (personalAsset(key) && row.value?.object && !personalObjects.has(row.value.content + ':' + row.value.object)) row.value.object = null;

	const omit = list => { for (let i = list.length - 1; i >= 0; i--) if (deferredIds.has(list[i].id) || deferredFiles.has(list[i].file)) list.splice(i, 1); };
	for (const list of [uploads, downloads, merges, localWrites, localTrash, renames]) omit(list);
	head.ancestry = Object.fromEntries([...parents].map(([object, list]) => [object, [...list]]));
	return {
		expected, skipped: assets.skipped, renames, linkRenames, linkContexts, assetRemoves: assets.removes, verified: heads.verified || local.verified || null, rootConflicts, assetUploads: assets.uploads, assetDownloads: assets.downloads, assetCopies: assets.copies, assetAliases: assets.aliases, assetMappings: assets.mappings, observed: allHeads.map(h => h._key).filter(Boolean),
		// Every device of the vault as its newest head names it (this one as it publishes now): the sheet reads a device
		// by its label, and a shelf's writer by the device that carries it.
		devices: [head, ...others].map(h => ({device: h.device, writer: h.writer ?? null, label: h.label ?? null})),
		uploads: uploads.map(sortObject).sort((a, b) => (a.id || '').localeCompare(b.id || '') || a.file.localeCompare(b.file)),
		downloads: downloads.map(sortObject).sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file)),
		localWrites: localWrites.map(sortObject).sort((a, b) => a.file.localeCompare(b.file)),
		localTrash: localTrash.map(sortObject).sort((a, b) => a.file.localeCompare(b.file)),
		merges: merges.map(sortObject).sort((a, b) => a.id.localeCompare(b.id)),
		conflicts: merges.filter(m => (m.tips || []).length).map(m => ({id: m.id, file: m.file, kind: 'pending-merge', tips: m.tips.map(t => ({object: t.object, device: t.device}))})),
		head,
		capabilities: {
			supportsConditionalWrite: !!(capabilities && capabilities.supportsConditionalWrite),
			supportsETag: capabilities && capabilities.supportsETag !== false,
		},
	};
}

async function sealUpload(item, vdk, store) {
	const verifyCached = async (object, sealed) => {
		if (await sha256Hex(sealed) !== object || await sha256Hex(await open(vdk, OBJECT_AAD, sealed)) !== item.content)
			refuse('cache', 'cached ciphertext does not match the exact local note; discard only that cache and retry');
		return {object, sealed};
	};
	if (item.object && store?.getSealed) {
		const cached = await store.getSealed(item.object);
		if (cached) return verifyCached(item.object, cached);
	}
	if (item.content && store?.getByContent) {
		const excluded = item.ancestors || item.parents || [], known = await store.getByContent(item.content, excluded);
		if (known && !excluded.includes(known) && store.getSealed) {
			const cached = await store.getSealed(known);
			if (cached) return verifyCached(known, cached);
		}
	}
	const sealed = await seal(vdk, OBJECT_AAD, item.bytes ? await assetBytes(item.bytes) : te.encode(item.text));
	const object = await sha256Hex(sealed);
	return {object, sealed};
}

export const UPLOAD_CONCURRENCY = 4;
async function parallelUploads(items, run) {
	let at = 0, failed;
	await Promise.all(Array.from({length: Math.min(UPLOAD_CONCURRENCY, items.length)}, async () => {
		while (!failed && at < items.length) {
			const item = items[at++];
			try { await run(item); } catch (error) { failed ||= error; }
		}
	}));
	if (failed) throw failed;
}

export async function execute(inputPlan, transport, store, options = {}) {
	const plan = structuredClone(inputPlan); // Retry never mutates the caller's plan.
	const vdk = options.vdk;
	if (!vdk) throw Object.assign(new Error('execute needs the vault key'), {code: 'vdk'});
	const snapshot = await store.snapshot();
	if (await snapshotToken(snapshot) !== plan.expected) refuse('changed', 'the folder changed after planning; nothing was replaced');
	const rebound = new Map();
	function rewriteLinks(text, context = []) {
		const renames = [...new Map([...(plan.linkRenames || []), ...context].map(row => [row.file, row])).values()].filter(row => row.file !== row.wanted);
		if (!renames?.length) return text;
		const names = new Set([...Object.values(plan.head.notes).map(note => note.file), ...renames.map(row => row.file), 'sync-note.md']);
		const rewrite = source => {
			const texts = new Map([['sync-note.md', source]]), links = buildLinkIndex(texts);
			links.files = names; resolveLinkIndex(links);
			const changes = renames.flatMap(row => renameLinks(links, texts, row.file, row.wanted)[0]?.changed || []);
			let out = source;
			// Rename all references simultaneously: A→B, B→A must not rewrite A twice.
			for (const row of changes.sort((a, b) => b.start - a.start)) out = out.slice(0, row.start) + row.now + out.slice(row.end);
			return out;
		};
		return rewrite(mapTextConflictVariants(text, rewrite));
	}
	async function rewriteKnown(text, mapping, id, ledger, context = []) {
		const rewritten = rewriteLinks(rewriteSyncMedia(text, mapping), context);
		if (rewritten === text) return text;
		for (const block of inspectTextConflicts(text, {nested: true})) {
			const old = await textConflictDigest(block, id);
			if (!(ledger || []).some(c => c.blockHash === old.blockHash && same(c.path, old.path) && same(c.variants, old.variants))) continue;
			const changed = rewriteLinks(rewriteSyncMedia(block.block, mapping), context), next = inspectTextConflicts(changed)[0];
			if (next) rebound.set(old.blockHash, await textConflictDigest(next, id));
		}
		return rewritten;
	}
	const personal = {records: plan.head.personal || {}, blobs: {}};
	for (const [key, row] of Object.entries(personal.records)) if (personalAsset(key) && row.value) {
		const ref = row.value;
		let value = snapshot.personal?.blobs?.[ref.content], plain = value && te.encode(JSON.stringify(value));
		if (plain && await sha256Hex(plain) !== ref.content) refuse('content', 'a personal asset changed before sync');
		if (!ref.object) {
			if (!plain) refuse('incomplete', 'a personal font or brush is missing');
			const {sealed, object} = await sealUpload({bytes: plain, content: ref.content}, vdk, store);
			await putVerified(transport, objectKey(object), sealed);
			if (store.rememberObject) await store.rememberObject(ref.content, object, sealed);
			ref.object = object;
		} else if (!plain) {
			const got = await transport.get(objectKey(ref.object));
			if (!got || await sha256Hex(got.bytes) !== ref.object) refuse('ciphertext', 'a personal asset did not match its encrypted address');
			plain = await open(vdk, OBJECT_AAD, got.bytes);
			if (plain.length > 4 * 1024 * 1024 || await sha256Hex(plain) !== ref.content) refuse('content', 'a personal asset did not match its content');
			try { value = JSON.parse(td.decode(plain)); } catch { refuse('content', 'a personal asset is not readable'); }
		}
		personal.blobs[ref.content] = value;
	}

	const downloaded = new Map();
	const objectCache = new Map();
	const sealedUploads = [];
	const assets = structuredClone(snapshot.assets || {});
	for (const row of plan.assetRemoves || []) delete assets[row.file];
	for (const copy of plan.assetCopies || []) assets[copy.file] = copy.bytes;
	for (const item of plan.assetUploads || []) {
		const {sealed: bytes, object: hash} = await sealUpload(item, vdk, store);
		plan.head.assets[item.file].object = hash;
		if (store.rememberObject) await store.rememberObject(item.content, hash, bytes);
		await putVerified(transport, objectKey(hash), bytes);
	}
	for (const item of plan.assetDownloads || []) {
		const got = await transport.get(objectKey(item.object));
		if (!got) refuse('incomplete', 'a kept media object is missing');
		if (await sha256Hex(got.bytes) !== item.object) refuse('ciphertext', 'media ciphertext does not match its address');
		const bytes = await open(vdk, OBJECT_AAD, got.bytes);
		if (await sha256Hex(bytes) !== item.content) refuse('content', 'media plaintext does not match its declared digest');
		assets[item.file] = bytes;
	}

	await parallelUploads(plan.uploads || [], async item => {
		const {object, sealed} = await sealUpload(item, vdk, store);
		item.object = object;
		item.key = objectKey(object);
		if (plan.head && plan.head.notes[item.id]) {
			plan.head.notes[item.id].object = object;
			plan.head.notes[item.id].content = item.content;
		}
		if (store.rememberObject) await store.rememberObject(item.content, object, sealed);
		await putVerified(transport, item.key, sealed);
		sealedUploads.push(object);
	});

	for (const d of plan.downloads || []) {
		const got = await transport.get(d.key);
		if (!got) throw Object.assign(new Error('download missing ' + d.key), {code: 'incomplete'});
		if (await sha256Hex(got.bytes) !== (d.hash || d.key.slice(OBJECT_PREFIX.length))) refuse('ciphertext', 'the ciphertext does not match its address');
		const plain = await open(vdk, OBJECT_AAD, got.bytes);
		const text = td.decode(plain);
		downloaded.set(d.id, {text, sidecar: d.sidecar, file: d.file, id: d.id, sealed: got.bytes});
		if (d.hash) objectCache.set(d.hash, text);
		if (store.rememberObject) await store.rememberObject(d.content || await contentHash(text), d.hash, got.bytes);
	}

	// Only here, not in plan(): fetch (or reuse an already-fetched) object's plaintext by hash. A
	// genuine merge needs words plan() never had the key to read.
	async function fetchText(hash) {
		if (!hash) return null;
		if (objectCache.has(hash)) return objectCache.get(hash);
		const got = await transport.get(objectKey(hash));
		if (!got) refuse('incomplete', 'a referenced merge ancestor or tip is missing');
		if (await sha256Hex(got.bytes) !== hash) refuse('ciphertext', 'the merge ciphertext does not match its address');
		const plain = await open(vdk, OBJECT_AAD, got.bytes);
		const text = td.decode(plain);
		objectCache.set(hash, text);
		if (store.rememberObject) await store.rememberObject(await contentHash(text), hash, got.bytes);
		return text;
	}

	const files = {};
	for (const [name, rec] of Object.entries(snapshot.files || {})) files[name] = {text: await noteText(name, typeof rec === 'string' ? rec : rec.text, text => rewriteKnown(text, plan.assetMappings?.local, snapshot.index.notes[name]?.id, snapshot.index.conflicts, plan.linkContexts.local))};
	const index = structuredClone(snapshot.index || emptyIndex());
	const trashedAt = {};
	const resolvedConflicts = [...(plan.rootConflicts || [])];
	index.sections = plan.head.metadata.sections; index.collapsed = plan.head.metadata.collapsed;

	const moved = (plan.renames || []).map(rename => ({...rename, body: files[rename.file], entry: index.notes[rename.file]}));
	for (const rename of moved) { delete files[rename.file]; delete index.notes[rename.file]; }
	for (const rename of moved) { files[rename.wanted] = rename.body; index.notes[rename.wanted] = rename.entry; }

	for (const w of plan.localWrites || []) {
		if (w.text != null) files[w.file] = {text: w.text};
		if (w.sidecar) {
			if (!index.notes[w.file]) index.notes[w.file] = defaultEntry();
			index.notes[w.file] = {...index.notes[w.file], ...w.sidecar};
		}
	}
	for (const d of plan.downloads || []) {
		const got = downloaded.get(d.id);
		if (!got) continue;
		files[d.file] = {text: await noteText(d.file, got.text, text => rewriteKnown(text, plan.assetMappings?.heads[d.device], d.id, d.conflicts, plan.linkContexts.heads[d.device]))};
		index.notes[d.file] = {...defaultEntry(), ...(d.sidecar || {}), ...(d.id ? {id: d.id} : {})};
		// A note downloaded already resolved elsewhere carries its ledger entries forward so a
		// fast-forwarding device sees the same "needs a look" the resolving device recorded.
		if (d.conflicts && d.conflicts.length) resolvedConflicts.push(...d.conflicts);
	}
	for (const t of plan.localTrash || []) { delete files[t.file]; delete index.notes[t.file]; }

	for (const m of plan.merges || []) {
		if (m.sidecarOnly) { resolvedConflicts.push(...(m.conflicts || [])); continue; }
		const tips = m.tips || [];
		if (!tips.length) continue;
		const code = isCodeFile(m.file), versions = [];
		let baseText = null;
		if (m.base && !code) {
			const original = await fetchText(m.base), contexts = plan.linkContexts.objects[m.base] || [[]];
			const normalized = [...new Set(contexts.map(context => rewriteLinks(original, context)))];
			// Equal source objects can outlive a filename namespace. Only an agreed exact
			// interpretation is a proved base; an ambiguous one must keep both branches.
			if (normalized.length === 1) baseText = normalized[0];
		}
		// Keep direct parents only: the local tip (or the base of an unsealed local edit)
		// and each peer tip. Verified history supplies the rest of the ancestry.
		let accText = m.oursText == null ? null : await noteText(m.file, m.oursText, text => rewriteKnown(text, plan.assetMappings?.local, m.id, m.conflicts, plan.linkContexts.local)), accDevice = m.oursDevice;
		const accEntry = m.sidecar;
		let accParents = [m.oursObject || m.base].filter(Boolean);
		let accBase = baseText;
		let theseConflicts = [...(m.conflicts || [])];
		if (code && accText != null) versions.push({text: accText, modified: m.oursEntry?.modified});
		for (const tip of tips) {
			const originalTip = await fetchText(tip.object);
			const tipText = await noteText(m.file, originalTip, text => rewriteKnown(text, plan.assetMappings?.heads[tip.device], m.id, m.conflicts, plan.linkContexts.heads[tip.device]));
			if (tip.content && await contentHash(originalTip) !== tip.content) refuse('content', 'the merge tip does not match its declared plaintext digest');
			if (tipText == null) throw Object.assign(new Error('merge object missing ' + tip.object), {code: 'incomplete'});
			if (code) { accParents = versions.length ? [...new Set([...accParents, tip.object])] : [tip.object]; versions.push({text: tipText, modified: tip.entry?.modified}); continue; }
			if (accText == null) { accText = tipText; accDevice = tip.device; accParents = [tip.object]; continue; }
			const textResult = await mergeContent(m.id, accBase, accText, tipText, accDevice, tip.device);
			theseConflicts.push(...textResult.conflicts);
			accText = textResult.text;
			accParents = [...new Set([...accParents, tip.object])];
			accBase = null; // no known common ancestor between an already-folded result and the next tip
		}
		// Two versions of a code file are never folded into one. The one saved last (its sidecar's time; then the
		// greater content digest) keeps the name on every device; each other version is kept whole beside it (below).
		const kept = [];
		if (code) {
			for (const {text, modified} of versions) {
				const content = await contentHash(text), at = Number.isFinite(modified) ? modified : -Infinity, same = kept.find(row => row.content === content);
				if (same) same.at = Math.max(same.at, at); else kept.push({text, content, at});
			}
			kept.sort((a, b) => b.at - a.at || (a.content < b.content ? 1 : a.content > b.content ? -1 : 0));
			accText = kept.shift().text;
		}
		theseConflicts = uniqueConflicts(theseConflicts);
		resolvedConflicts.push(...theseConflicts);
		const finalFile = claimFile(m.file, new Set(Object.keys(files).filter(f => f !== m.file)), (m.file || 'note').replace(/\.md$/i, ''));
		files[finalFile] = {text: accText};
		index.notes[finalFile] = {...(index.notes[finalFile] || defaultEntry()), ...accEntry, id: m.id};
		const {sealed: sealedNew, object: objectHash} = await sealUpload({text: accText, content: await contentHash(accText), ancestors: accParents}, vdk, store);
		if (plan.head) {
			plan.head.notes[m.id] = {...plan.head.notes[m.id], file: finalFile, object: objectHash, content: await contentHash(accText), sidecar: copyEntry({...accEntry, id: m.id}), parents: accParents, ...(theseConflicts.length ? {conflicts: theseConflicts} : {})};
		}
		if (store.rememberObject) await store.rememberObject(await contentHash(accText), objectHash, sealedNew);
		await putVerified(transport, objectKey(objectHash), sealedNew);
		// The clash said by name: "script kept.py", a code file of its own. Its identity is derived from the
		// clash alone, so every device that resolves the same clash keeps the same one file, once; one the
		// person already deleted is not brought back.
		for (const row of kept) {
			const id = 'kept-' + (await sha256Hex(te.encode(m.id + '\n' + row.content))).slice(0, 24) + ':1';
			if (plan.head.notes[id] || plan.head.tombstones[id] || Object.values(index.notes).some(entry => entry.id === id)) continue;
			const ext = finalFile.slice(finalFile.lastIndexOf('.')), file = claimFile(finalFile.slice(0, -ext.length) + ' kept' + ext, new Set(Object.keys(files)));
			const sidecar = {...defaultEntry(), id, keptFrom: {file: finalFile, id: m.id, digest: row.content}};
			files[file] = {text: row.text}; index.notes[file] = sidecar;
			const {sealed, object} = await sealUpload({text: row.text, content: row.content, ancestors: []}, vdk, store);
			plan.head.notes[id] = {file, object, content: row.content, sidecar: copyEntry(sidecar), parents: []};
			if (store.rememberObject) await store.rememberObject(row.content, object, sealed);
			await putVerified(transport, objectKey(object), sealed);
		}
	}

	const expectedDownloads = (plan.downloads || []).length;
	if (downloaded.size !== expectedDownloads) throw Object.assign(new Error('download count'), {code: 'incomplete'});
	for (const d of plan.downloads || []) {
		const got = downloaded.get(d.id);
		if (!got) throw Object.assign(new Error('unverified ' + d.file), {code: 'incomplete'});
		if (d.content) {
			const actual = await contentHash(got.text);
			if (actual !== d.content) throw Object.assign(new Error('content hash ' + d.file), {code: 'incomplete'});
		}
	}



	// Relinking creates a causal text version, even for a remote fast-forward. Its original
	// sealed object remains the parent; no link may silently inherit the other branch's bytes.
	for (const [id, rec] of Object.entries(plan.head.notes)) {
		const text = files[rec.file]?.text;
		if (text === undefined) continue;
		const content = await contentHash(text);
		if (content === rec.content) continue;
		const {sealed, object} = await sealUpload({text, content, ancestors: [rec.object]}, vdk, store);
		if (store.rememberObject) await store.rememberObject(content, object, sealed);
		await putVerified(transport, objectKey(object), sealed);
		rec.parents = [rec.object]; rec.object = object; rec.content = content;
		if (store.rememberObject) await store.rememberObject(content, object, sealed);
	}

	const forgotten = (snapshot.forgotten || []).filter(f => !(plan.head && plan.head.tombstones && plan.head.tombstones[f.id]));
	if (plan.head && plan.head.notes) {
		for (const [nid, rec] of Object.entries(plan.head.notes)) {
			if (rec && rec.file && files[rec.file]) {
				if (!index.notes[rec.file]) index.notes[rec.file] = defaultEntry();
				const revision = 'sha256:' + rec.content;
				index.notes[rec.file] = {...index.notes[rec.file], id: nid, revision};
				rec.sidecar = {...rec.sidecar, revision};
			}
		}
	}
	const activeConflicts = new Set(), markdown = Object.entries(files).filter(([file]) => !isCodeFile(file)).map(([, value]) => value);
	for (const value of markdown) for (const block of inspectTextConflicts(value.text, {nested: true})) activeConflicts.add(await contentHash(block.block));
	// A link rewrite changes the exact custody bytes, not why or where the conflict
	// was recorded. The envelope parser cannot recover no-ancestor provenance.
	const rebind = conflict => {
		const next = rebound.get(conflict.blockHash);
		return next ? {...conflict, blockHash: next.blockHash, variants: next.variants} : conflict;
	};
	if (resolvedConflicts.length || rebound.size) {
		index.conflicts = uniqueConflicts([...(index.conflicts || []), ...resolvedConflicts].map(rebind), activeConflicts);
	}
	for (const rec of Object.values(plan.head.notes)) if (rec.conflicts) rec.conflicts = uniqueConflicts(rec.conflicts.map(rebind), activeConflicts);
	for (const value of markdown) for (const recording of recordingsOf(value.text)) {
		if (!Object.hasOwn(assets, 'audio/' + recording.name) && !Object.values(plan.head.assetTombstones || {}).some(t => t.file === 'audio/' + recording.name)) refuse('incomplete_asset', 'a note names a recording whose complete bytes are not available; nothing was replaced');
	}
	for (const value of markdown) for (const attachment of attachmentsOf(value.text)) {
		if (!Object.hasOwn(assets, 'attachments/' + attachment.name) && !Object.values(plan.head.assetTombstones || {}).some(t => t.file === 'attachments/' + attachment.name)) refuse('incomplete_asset', 'a note links to a file whose complete bytes are not available; nothing was replaced');
	}
	if (snapshot.head && same(headPayload(snapshot.head), headPayload(plan.head)) && same(files, snapshot.files) && same(index, snapshot.index) && same(forgotten, snapshot.forgotten || [])) {
		if (typeof store.validate === 'function') await store.validate(plan.expected);
		if (typeof store.observe === 'function') {
			const {proof, ...previous} = snapshot.verified || {};
			const verified = same(previous, plan.verified) ? snapshot.verified : await authenticateHeads(plan.verified, snapshot.deviceId, snapshot.head._key, vdk);
			await store.observe([...new Set([...plan.observed, snapshot.head._key])].filter(Boolean), verified);
		}
		if (store.applyPersonal) await store.applyPersonal(personal, snapshot.personal);
		return {ok: true, caughtUp: !snapshot.personal || same((await store.snapshot()).personal?.records || {}, personal.records), downloaded: 0, uploaded: 0, conflicts: [], head: snapshot.head._key, skipped: plan.skipped, unchanged: true, devices: plan.devices};
	}
	// The exact encrypted head is journaled WITH the owner's data commit, before publication.
	// A lost response/restart can resend these bytes, not mint a second sibling generation.
	for (const rec of [...Object.values(plan.head.notes), ...Object.values(plan.head.tombstones)]) if (rec.object) plan.head.ancestry[rec.object] = rec.parents || [];
	// Retain only edges reachable from live/deleted versions: these are the merge bases still needed.
	const needed = new Set(), queue = [...Object.values(plan.head.notes), ...Object.values(plan.head.tombstones)].flatMap(rec => [rec.object, ...(rec.parents || []), ...(rec.deletions || []).flatMap(deletion => [deletion.object, ...(deletion.parents || [])])]);
	while (queue.length) { const object = queue.pop(); if (!object || needed.has(object)) continue; needed.add(object); queue.push(...(plan.head.ancestry[object] || [])); }
	for (const object of Object.keys(plan.head.ancestry)) if (!needed.has(object)) delete plan.head.ancestry[object];
	decodeHead(encodeHead(plan.head));
	const bytes = await seal(vdk, headAAD(plan.head), encodeHead(plan.head));
	const key = headKey(plan.head.device, plan.head.generation, await sha256Hex(bytes));
	plan.head._key = key;
	const pending = {key, bytes: Array.from(bytes)};
	const verified = structuredClone(plan.verified || {keys: [], digests: {}});
	verified.keys = [...verified.keys.filter(old => parseHeadKey(old).device !== plan.head.device), key].sort();
	verified.digests = Object.fromEntries(verified.keys.map(key => [key, parseHeadKey(key).hash]));
	// The next run trusts its own checkpoint by this sealed digest instead of downloading it.
	verified.head = await sha256Hex(encodeHead(plan.head));
	const next = {files, assets, index, personal, personalBase: snapshot.personal, renames: plan.renames, deletions: plan.localTrash, assetRemoves: plan.assetRemoves, forgotten, trashedAt, head: plan.head, pending, observed: plan.observed, assetAliases: plan.assetAliases, verified: await authenticateHeads(verified, snapshot.deviceId, key, vdk)};
	await store.commit(next, {expected: plan.expected});
	await resumePending(transport, store, {vdk});
	const current = await store.snapshot();
	const caughtUp = (!current.personal || same(current.personal.records, personal.records)) && same(current.files, files) && same(portableIndex(current.index), portableIndex(index)) && same(current.index.notes, index.notes);
	return {ok: true, caughtUp, downloaded: downloaded.size, uploaded: sealedUploads.length, conflicts: resolvedConflicts, head: key, skipped: plan.skipped, devices: plan.devices};
}

// Success means the exact full bytes were read back. A PUT timeout is not an acknowledgement.
// No HEAD endpoint, no ETag-as-content-hash assumption, no guessed conditional-write support.
export async function putVerified(transport, key, bytes) {
	const hash = await sha256Hex(bytes);
	if (typeof key !== 'string' || key.slice(-64) !== hash) refuse('ciphertext', 'ciphertext does not match its immutable upload address');
	const existing = await transport.get(key);
	if (existing) {
		if (await sha256Hex(existing.bytes) !== hash) refuse('ciphertext', 'an immutable address contains different bytes');
		return;
	}
	let ambiguous = false;
	try { await transport.put(key, bytes); }
	catch (error) {
		if (!['timeout', 'network', 'server'].includes(error?.code)) throw error;
		ambiguous = true;
	}
	let got;
	try { got = await transport.get(key); }
	catch (error) { if (!ambiguous) throw error; }
	if (!got || await sha256Hex(got.bytes) !== hash) refuse('upload_unconfirmed', 'upload was not verified; local work and pending publication are kept');
}

export async function resumePending(transport, store, {vdk} = {}) {
	const snapshot = await store.snapshot({checkpointOnly: true});
	if (!snapshot.pending) return {pending: false};
	const {key, bytes} = snapshot.pending;
	const address = parseHeadKey(key);
	if (!Array.isArray(bytes) || bytes.length < 29 || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255) || snapshot.head?._key !== key) refuse('corrupt', 'the durable head receipt does not match its local checkpoint');
	const value = Uint8Array.from(bytes);
	if (await sha256Hex(value) !== address.hash) refuse('corrupt', 'the durable pending head does not match its address');
	// A checksum proves bytes, not vault authority. Authenticate the durable receipt and bind it to
	// this writer's checkpoint before any transport call, the existence check included.
	const plain = await open(vdk, headAAD(address), value);
	let head;
	try { head = decodeHead(plain); } finally { plain.fill(0); }
	if (address.device !== snapshot.deviceId || head.device !== address.device || head.generation !== address.generation
		|| !same(head, decodeHead(encodeHead(snapshot.head)))) refuse('corrupt', 'the pending head does not match its authenticated local checkpoint');
	if (typeof store.acknowledge !== 'function') refuse('store', 'the sync store must durably acknowledge the exact pending head');
	await putVerified(transport, key, value);
	await store.acknowledge(key);
	return {pending: false, published: key};
}

// The cache changes causal decisions, so its compact plaintext record needs the vault's
// authentication too. Bind the seal to this install's exact publication checkpoint.
async function authenticateHeads(verified, deviceId, checkpoint, vdk = null) {
	if (!verified) return null;
	const {proof, ...value} = verified;
	const digest = await sha256Hex(te.encode(JSON.stringify(sortObject(value))));
	const aad = 'verified-heads/' + deviceId + '/' + (checkpoint || 'empty');
	if (vdk) return {...value, proof: Array.from(await seal(vdk, aad, te.encode(digest)))};
	if (!Array.isArray(proof) || proof.some(n => !Number.isInteger(n) || n < 0 || n > 255)) refuse('cache', 'the verified head cache has no authentication proof');
	return {value, aad, digest, proof: Uint8Array.from(proof)};
}

// Every device keeps publishing immutable heads; remote history is kept until the founder
// selects a reviewed retirement policy. The read frontier is one newest generation per device.
export const HEADS_PER_DEVICE = 1;
export const HEAD_RETENTION_GENERATIONS = Infinity;
// Selection only: provider retirement remains a separate reviewed act. Infinity keeps all.
export function headRetirementCandidates(keys, deviceId, keep = HEAD_RETENTION_GENERATIONS) {
	if (!DEVICE_RE.test(deviceId) || keep !== Infinity && (!Number.isSafeInteger(keep) || keep < 2)) refuse('retention', 'head retention must keep at least two complete generations');
	const own = [...new Set(keys)].filter(key => parseHeadKey(key).device === deviceId)
		.sort((a, b) => parseHeadKey(b).generation - parseHeadKey(a).generation);
	const generations = new Set();
	for (const key of own) { const generation = parseHeadKey(key).generation; if (generations.has(generation)) refuse('device_fork', 'head retirement cannot choose between forked generations'); generations.add(generation); }
	return keep === Infinity ? [] : own.slice(keep);
}
async function listEvery(transport, prefix, options) {
	const keys = [], prefixes = [], cursors = new Set(); let cursor = null;
	for (;;) {
		const page = await (options ? transport.list(prefix, cursor, options) : transport.list(prefix, cursor));
		if (!page || !Array.isArray(page.keys) || typeof page.truncated !== 'boolean' || page.prefixes !== undefined && !Array.isArray(page.prefixes)) refuse('listing', 'head discovery returned an invalid page');
		keys.push(...page.keys); prefixes.push(...(page.prefixes || []));
		if (!page.truncated) return {keys, prefixes};
		if (typeof page.cursor !== 'string' || !page.cursor || cursors.has(page.cursor)) refuse('listing', 'head discovery did not advance its cursor');
		cursors.add(page.cursor); cursor = page.cursor;
	}
}
// Discovery downloads only what changed. Where the store lists from a key, each device's heads are
// listed from the generation this install last saw, so a quiet poll lists one head a device. This
// install's own head is its checkpoint, proved by the vault-sealed record of the last run; every
// other head is downloaded once and then read from the store's cache of verified ciphertext.
export async function loadHeads(transport, vdk, {anchors = [], verified = null, deviceId, checkpoint = null, ownHead = null, cache = null} = {}) {
	if (verified) {
		const checked = await authenticateHeads(verified, deviceId, checkpoint);
		if (td.decode(await open(vdk, checked.aad, checked.proof)) !== checked.digest) refuse('cache', 'the verified head frontier changed; no work was replaced');
		verified = checked.value;
	}
	const found = new Set(), bounds = new Map(), seenFrom = new Map();
	for (const key of [...(verified?.keys || []), ...anchors]) { const {device, generation} = parseHeadKey(key); seenFrom.set(device, Math.max(seenFrom.get(device) || 0, generation)); }
	if (transport.capabilities?.listsFrom) {
		const {keys: loose, prefixes} = await listEvery(transport, HEAD_PREFIX, {delimiter: '/'}), groups = new Set(prefixes);
		// A store that ignores the grouping lists the heads themselves; each names its device. Heads
		// before a requested start are more than was asked for, never fewer, and are kept as found.
		for (const item of loose) { groups.add(HEAD_PREFIX + parseHeadKey(item.key).device + '/'); found.add(item.key); }
		for (const group of groups) {
			const device = /^heads\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/$/.exec(group)?.[1];
			if (!device) refuse('listing', 'head discovery returned an invalid device group');
			const from = seenFrom.get(device);
			const {keys} = await listEvery(transport, group, from ? {startAfter: group + headGeneration(from) + '-'} : {});
			for (const item of keys) { if (parseHeadKey(item.key).device !== device) refuse('listing', 'head discovery returned a head outside its device'); found.add(item.key); }
			if (from) bounds.set(device, from);
		}
	} else for (const item of (await listEvery(transport, HEAD_PREFIX)).keys) { parseHeadKey(item.key); found.add(item.key); }
	if (checkpoint && !found.has(checkpoint)) refuse('rollback', 'this install’s published checkpoint is missing; no local work was replaced');
	for (const key of anchors) if (!found.has(key)) refuse('incomplete', 'a previously observed generation is missing; no local note was replaced');
	const known = new Map();
	if (checkpoint && ownHead) {
		const own = decodeHead(encodeHead(ownHead));
		if (verified?.head) {
			if (await sha256Hex(encodeHead(own)) !== verified.head) refuse('cache', 'the local checkpoint differs from its authenticated record; no work was replaced');
			known.set(checkpoint, own);
		}
	}
	const generations = new Map(), frontiers = new Map();
	for (const key of [...found, ...(verified?.keys || []), ...anchors]) {
		const {device, generation} = parseHeadKey(key), at = device + '/' + generation;
		if (generations.has(at) && generations.get(at) !== key) refuse('device_fork', 'one install identity has two kept branches; restore each under a new install identity before syncing');
		generations.set(at, key);
		if (!frontiers.has(device)) frontiers.set(device, []);
		if (!frontiers.get(device).includes(key)) frontiers.get(device).push(key);
	}
	const loaded = new Map();
	async function read(key) {
		if (loaded.has(key)) return loaded.get(key);
		const address = parseHeadKey(key);
		let head = known.get(key);
		if (!head) {
			let bytes = cache ? await cache.get(key) : null, fetched = false;
			if (!bytes) {
				const got = await transport.get(key);
				if (!got) refuse('incomplete', 'a listed or previously observed generation is missing; no local note was replaced');
				bytes = got.bytes; fetched = true;
			}
			if (await sha256Hex(bytes) !== address.hash) refuse('ciphertext', 'the head ciphertext does not match its address');
			const plain = await open(vdk, headAAD(address), bytes);
			// It opened under the vault's key, so a device of this vault wrote it: a head this Rapier cannot read was
			// written by a newer one (a record kind or a version it does not know). Still refused, and nothing is
			// replaced; the refusal says which, so the sheet asks for the update (notes/sync-ui.js).
			try { head = decodeHead(plain); }
			catch (error) { if (error?.code === 'corrupt') refuse('newer', 'a newer Rapier wrote a head in this vault: update Rapier to sync this folder. nothing was replaced'); throw error; }
			if (fetched && cache) await cache.put(key, bytes);
			if (key === checkpoint && ownHead && !same(head, decodeHead(encodeHead(ownHead)))) refuse('cache', 'the local checkpoint differs from its authenticated published bytes');
		}
		if (head.device !== address.device || head.generation !== address.generation) refuse('corrupt', 'the head disagrees with its address');
		// Below the listed range a predecessor was proved when this install first observed its successor.
		const prior = head.previous ? parseHeadKey(head.previous) : null, bound = bounds.get(address.device);
		if (prior && !(bound && prior.generation < bound)) {
			if (!found.has(head.previous)) refuse('incomplete', 'the newest head’s exact predecessor is missing; no local work was replaced');
			if (generations.get(address.device + '/' + (address.generation - 1)) !== head.previous) refuse('device_fork', 'the newest head names a different kept predecessor');
		}
		head._key = key; head._parents = head.ancestry || {}; loaded.set(key, head); return head;
	}
	const tips = [];
	for (const [device, keys] of frontiers) {
		keys.sort((a, b) => parseHeadKey(b).generation - parseHeadKey(a).generation);
		const tip = await read(keys[0]); tips.push(tip);
		// A previously observed head is the exact field-merge base, fetched only when it changed.
		// It is never kept as a second plaintext head in the local checkpoint.
		const prior = anchors.find(key => parseHeadKey(key).device === device);
		if (prior && prior !== tip._key) tip._previousHead = await read(prior);
		if (device !== deviceId) {
			const seen = tip.seen.find(key => parseHeadKey(key).device === deviceId);
			if (seen && (!prior || seen === checkpoint)) tip._seenHead = await read(seen);
		}
		for (const key of keys.slice(1, HEADS_PER_DEVICE)) await read(key);
	}
	tips.verified = {keys: tips.map(head => head._key).sort(), digests: Object.fromEntries(tips.map(head => [head._key, parseHeadKey(head._key).hash]))};
	const own = tips.find(head => head.device === deviceId);
	if (own) tips.verified.head = await sha256Hex(encodeHead(own));
	return tips.sort((a, b) => a.device.localeCompare(b.device));
}

export async function synchronize(transport, store, {vdk} = {}) {
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			await store.beginRun?.(transport.capabilities);
			await resumePending(transport, store, {vdk});
			const local = await store.snapshot();
			const heads = await loadHeads(transport, vdk, {anchors: local.observed || [], verified: local.verified, deviceId: local.deviceId,
				checkpoint: local.head?._key || null, ownHead: local.head || null, cache: store.heads || null});
			const result = await execute(await plan(local, heads, transport.capabilities), transport, store, {vdk});
			return {...result, rebases: attempt};
		} catch (error) {
			if (error?.code !== 'changed' || attempt === 3) throw error;
			// Replan the fresh owner's state; verified upload intents survive every attempt.
		}
	}
}

// Main-app adapter: all plaintext work and both sync checkpoints pass through the existing
// folder owner. No folder capability crosses to Sync; no network is held under an owner lease.
// assertActive is a caller's cancellation fence (the web session's Lock). It runs after every
// owner lease this adapter waited for and at each write-plan handoff, beside activeFolder's
// identity fence, never in place of it. Work already handed to the owner keeps its own finish.
export function createOwnerSyncStore({folder, deviceId, personal = null, label = null, assertActive = () => {}}) {
	if (!folder?.owner || !DEVICE_RE.test(deviceId) || typeof assertActive !== 'function') refuse('store', 'an admitted folder owner and install identity are required');
	label = headLabel(label);
	const objects = new Map(), byContent = new Map(), media = new Map();
	let loaded = false, limit = Infinity, folderIdentity = null;
	// A left or restored folder mints a fresh folderDeviceId (notes/folder.mjs leaveVault/
	// restoreSnapshot). A store built before that change must never let a stale snapshot,
	// observation or receipt write resurrect the departed writer's sync state.
	const activeFolder = index => {
		if (folderIdentity && index.folderDeviceId !== folderIdentity) refuse('changed', 'this folder left or restored its vault; join it again before syncing.');
		folderIdentity ||= index.folderDeviceId;
	};
	const spoolPattern = /^\.rapier-sync-object-([a-f0-9]{64})-([a-f0-9]{64})\.tmp$/;
	// Verified head ciphertext, named by the head key's own hash, so a head is downloaded once. A
	// temporary file: backups leave it out, and each finished run keeps only its observed frontier.
	const headCachePattern = /^\.rapier-sync-head-([a-f0-9]{64})\.tmp$/, headCacheName = key => '.rapier-sync-head-' + parseHeadKey(key).hash + '.tmp';
	async function retainHeads(keys) {
		const keep = new Set(keys.map(headCacheName));
		for (const name of await folder.store.list()) if (headCachePattern.test(name) && !keep.has(name)) { try { await folder.store.remove(name); } catch (_) {} }
	}
	function rememberName(content, hash, name) {
		objects.set(hash, name);
		if (!byContent.has(content)) byContent.set(content, []);
		if (!byContent.get(content).includes(hash)) byContent.get(content).push(hash);
	}
	async function loadObjects() {
		if (loaded) return;
		for (const name of await folder.store.list()) { const match = spoolPattern.exec(name); if (match) rememberName(match[1], match[2], name); }
		loaded = true;
	}
	async function withLease(fn) {
		const lease = await folder.owner.acquire(folder.scope);
		try { assertActive(); return await fn(lease); } finally { await lease.release(); }
	}
	// Publication resumes an already committed, authenticated head. Its receipt needs the
	// fresh owner identity and sync state, never the plaintext bodies used for merge decisions.
	async function checkpoint(lease) {
		const current = await lease.read(); assertActive(); activeFolder(current.index);
		await finishRenames(lease);
		const {state} = await readSyncStateBytes(folder.store); assertActive();
		if (state.deviceId && state.deviceId !== deviceId) refuse('identity', 'this folder sync state belongs to a different install identity');
		return {deviceId, head: state.head || null, pending: state.pending || null};
	}
	async function capture(lease, validateMedia = false, recoverRenames = true) {
		let listing = await lease.read();
		activeFolder(listing.index);
		if (recoverRenames && await finishRenames(lease)) listing = await lease.read();
		const current = await lease.read({bodies: listing.files.filter(isNoteFile)});
		const files = {}, assets = {};
		const {state} = await readSyncStateBytes(folder.store);
		for (const directory of ['audio', 'attachments']) for (const name of (await folder.store.list(directory)).sort()) {
			const file = directory + '/' + name;
			if (!safeAsset(file)) continue;
			if (!media.has(file)) media.set(file, await captureAsset(folder.store, file, limit, {digestSkipped: !!state.head?.assets?.[file] || Object.values(current.index.assetTombstones || {}).some(row => row.file === file)}));
			else if (typeof folder.store.stat === 'function') {
				const stat = await folder.store.stat(file), before = media.get(file).stamp;
				if (!stat || before && (before.size !== stat.size || before.modified !== stat.modified)) refuse('changed', 'the media changed during sync; its original bytes were kept');
			}
			const asset = media.get(file);
			if (validateMedia && asset.content && asset.stamp?.modified == null && await storedFileDigest(folder.store, file) !== asset.content) refuse('changed', 'the media changed during sync; its original bytes were kept');
			assets[file] = asset;
		}
		for (const [name, bytes] of current.bodies) files[name] = {text: td.decode(bytes)};
		await loadObjects();
		if (state.deviceId && state.deviceId !== deviceId) refuse('identity', 'this folder sync state belongs to a different install identity');
		const writer = typeof personal?.writer === 'function' ? await personal.writer() : null;
		return {deviceId, files, assets, personal: personal ? await personal.snapshot() : undefined, writer: typeof writer === 'string' && WRITER_RE.test(writer) ? writer : null, label,
			assetAliases: state.assetAliases || {}, index: current.index, forgotten: state.forgotten || [],
			verified: state.verified || null, head: state.head || null, pending: state.pending || null, observed: state.observed || [],
			byContent: Object.fromEntries([...byContent].map(([content, hashes]) => [content, hashes.at(-1)]))};
	}
	async function finishRenames(lease, fresh = null) {
		let previous = await readSyncStateBytes(folder.store);
		if (!previous.state.renameIntent) return fresh;
		if (previous.state.deviceId !== deviceId) refuse('identity', 'the kept rename intent belongs to a different install identity');
		// Without a capture this is recovery from a cut, not the run that wrote the intent.
		const recovering = fresh === null;
		fresh ||= await capture(lease, true, false);
		const folded = file => file.normalize('NFC').toLowerCase();
		while (previous.state.renameIntent) {
			assertActive(); activeFolder(fresh.index);
			const intent = previous.state.renameIntent, moves = intent.moves;
			const names = Object.keys(fresh.files);
			const moving = new Set(Array.isArray(moves) ? moves.map(row => row?.id) : []);
			const unnamed = !record(intent) || intent.folder !== fresh.index.folderDeviceId || !Array.isArray(moves) || !moves.length ||
				moves.some(row => !record(row) || !validId(row.id) || !safeFile(row.file) || !safeFile(row.wanted) || fresh.index.notes[row.file]?.id !== row.id) ||
				new Set(moves.map(row => row.id)).size !== moves.length || new Set(moves.map(row => folded(row.wanted))).size !== moves.length;
			const taken = !unnamed && moves.some(row => names.some(name => folded(name) === folded(row.wanted) && !moving.has(fresh.index.notes[name]?.id)));
			if (unnamed || taken) {
				// The run that wrote the intent refuses, since its publication assumes the renames. In recovery the journal
				// has left the folder at a hop boundary, so a mismatch is the person's own hand since the cut (a rename, a
				// new note at the destination): their state stands, the intent is dropped rather than refused on every
				// later sync, and the next plan derives its renames again by identity. A temporary name left is a name.
				if (!recovering) refuse('changed', unnamed ? 'the kept rename intent no longer names this folder’s notes; every file was kept' : 'a kept rename destination gained another note; both notes were kept');
				const state = {...previous.state}; delete state.renameIntent;
				const write = await syncStateWrite(state, previous.bytes);
				const result = await lease.transact(() => { assertActive(); return {kind: 'sync-rename', index: structuredClone(fresh.index), writes: [write]}; }, {bodies: []});
				if (result.dropped?.length) refuse('changed', 'the folder changed while its stale rename intent was dropped; every file was kept');
				return capture(lease, true, false);
			}
			let at = moves.findIndex(row => !names.some(name => folded(name) === folded(row.wanted))), temporary = at < 0;
			if (temporary) at = 0;
			const row = moves[at], wanted = temporary ? noteFileName('Sync move', [...names, ...moves.map(row => row.wanted)], {ascii: folder.store.ascii}) : row.wanted;
			const bodies = new Map(Object.entries(fresh.files).map(([file, value]) => [file, te.encode(value.text)]));
			const planned = await planFolderRename({index: structuredClone(fresh.index), files: names, bodies},
				{file: row.file, id: row.id, expectedDigest: await contentHash(fresh.files[row.file].text), wanted, ascii: folder.store.ascii});
			if (planned.file !== wanted) refuse('changed', 'a rename destination changed; all notes were kept');
			const remaining = moves.filter((_, i) => temporary || i !== at).map(move => move.id === row.id ? {...move, file: wanted} : move);
			const state = {...previous.state};
			if (remaining.length) state.renameIntent = {...intent, moves: remaining}; else delete state.renameIntent;
			// Each hop and its next intent share the existing guarded owner journal. Recovery
			// finishes the hop before reading this intent; no temporary name becomes a head.
			planned.writes.push(await syncStateWrite(state, previous.bytes));
			const expectedFiles = {...fresh.files};
			for (const write of planned.writes) if (isNoteFile(write.file)) expectedFiles[write.file] = {text: td.decode(write.bytes)};
			for (const remove of planned.removes || []) delete expectedFiles[remove.file];
			const result = await lease.transact(() => { assertActive(); return planned; }, {bodies: []});
			if (result.dropped?.length) refuse('changed', 'the owner retained a newer foreign write; reconcile before publishing');
			const expectedAfter = await snapshotToken({...fresh, index: result.index, files: expectedFiles});
			fresh = await capture(lease, true, false);
			if (await snapshotToken(fresh) !== expectedAfter) refuse('changed', 'the folder changed during its rename; every newer change was kept');
			previous = await readSyncStateBytes(folder.store);
		}
		return fresh;
	}
	return {
		applyPersonal: personal ? (value, baseline) => personal.commit(value, baseline, assertActive) : null,
		beginRun(capabilities = {}) { limit = capabilities.maxSingleUploadBytes ?? Infinity; media.clear(); },
		snapshot: ({checkpointOnly = false} = {}) => withLease(checkpointOnly ? checkpoint : capture),
		validate: expected => withLease(async lease => { if (await snapshotToken(await capture(lease, true)) !== expected) refuse('changed', 'the folder changed during sync; rebase its new work'); }),
		async commit(next, {expected} = {}) {
			return withLease(async lease => {
				let fresh = await capture(lease, true);
				if (await snapshotToken(fresh) !== expected) refuse('changed', 'another writer changed the folder; replan without replacing its work');
				if (next.deletions?.length) {
					assertActive();
					const result = await runTrash({store: folder.store, index: fresh.index,
						files: next.deletions.map(row => row.file), expected: new Map(next.deletions.map(row => [row.file, row])),
						mode: 'confirmed', deviceId: folder.deviceId, commitIndex: lease.commitIndex});
					if (result.revived.length || result.missing.length || result.deferred.length) refuse('changed', 'a note changed before deletion and was kept; sync again to keep both decisions');
					fresh = await capture(lease);
				}
				if (next.renames?.length) {
					const previous = await readSyncStateBytes(folder.store), state = {...previous.state, deviceId,
						renameIntent: {folder: fresh.index.folderDeviceId, moves: next.renames.map(({id, file, wanted}) => ({id, file, wanted}))}};
					const index = structuredClone(fresh.index), collisions = (next.index.conflicts || []).filter(c => c.kind === 'filename-collision');
					if (collisions.length) index.conflicts = uniqueConflicts([...(index.conflicts || []), ...collisions]);
					const write = await syncStateWrite(state, previous.bytes);
					const result = await lease.transact(() => { assertActive(); return {kind: 'sync-rename', index, writes: [write]}; }, {bodies: []});
					if (result.dropped?.length) refuse('changed', 'the folder changed before its rename intent; every file was kept');
					const expectedAfter = await snapshotToken({...fresh, index: result.index});
					fresh = await capture(lease, true, false);
					if (await snapshotToken(fresh) !== expectedAfter) refuse('changed', 'the folder changed before its rename; every file was kept');
					fresh = await finishRenames(lease, fresh);
				}
				const writes = new Map(), removes = [];
				const index = structuredClone(next.index);
				index.folderGeneration = fresh.index.folderGeneration;
				index.noteCounters = fresh.index.noteCounters;
				index.tombstones = fresh.index.tombstones;
				index.assetTombstones = {...fresh.index.assetTombstones, ...next.head.assetTombstones};
				index.assetRevivals = next.head.assetRevivals;
				if (fresh.index.deletions) index.deletions = fresh.index.deletions; else delete index.deletions;
				// The normal history writer keeps exact preimages. Its verified objects and manifest
				// precede the note replacement inside the same recoverable owner journal.
				const histories = new Map(), nextById = new Map(Object.entries(index.notes).map(([file, entry]) => [entry.id, file]));
				for (const [file, value] of Object.entries(fresh.files)) {
					const entry = fresh.index.notes[file], target = nextById.get(entry.id);
					if (!target || next.files[target]?.text === value.text) continue;
					const path = 'history/' + manifestName(entry.id), before = await folder.store.read(path);
					const recorded = await recordVersion(parseManifest(before, {noteId: entry.id, now: Date.now()}),
						{file, text: value.text, entry, reason: 'merge', now: Date.now()});
					for (const row of recorded.writes) {
						const name = 'history/' + row.name, old = name === path ? before : await folder.store.read(name);
						if (old && await sha256Hex(old) === await sha256Hex(row.bytes)) continue;
						if (row.immutable && old) refuse('history', 'a kept history object changed; no note was replaced');
						histories.set(name, {file: name, bytes: row.bytes, ...(old ? {expectedDigest: await sha256Hex(old)} : {createOnly: true})});
					}
				}
				for (const [file, value] of Object.entries(next.files)) {
					if (!safeFile(file)) refuse('name', 'sync may write only a safe note filename');
					if (fresh.files[file]?.text === value.text && !writes.has(file)) continue;
					const planned = writes.get(file);
					writes.set(file, {...planned, file, bytes: te.encode(value.text), ...(fresh.files[file] ? {expectedDigest: await contentHash(fresh.files[file].text)} : {createOnly: true})});
				}
				if (Object.keys(fresh.files).some(file => !Object.hasOwn(next.files, file))) refuse('keep', 'sync has no owner proof to remove a kept local file');
				for (const [file, bytes] of Object.entries(next.assets || {})) {
					if (!safeAsset(file)) refuse('name', 'sync media must be complete bytes in the owner’s media directories');
					if (fresh.assets[file]) {
						if (fresh.assets[file] !== bytes && !bytes.skipped && await assetDigest(fresh.assets[file]) !== await assetDigest(bytes)) refuse('asset_conflict', 'sync cannot overwrite kept media');
					} else writes.set(file, {file, bytes: await assetBytes(bytes), createOnly: true});
				}
				for (const row of next.assetRemoves || []) if (fresh.assets[row.file]) removes.push({file: row.file, expectedDigest: row.content});
				const previous = await readSyncStateBytes(folder.store);
				const state = {...previous.state, deviceId, assetAliases: next.assetAliases, verified: next.verified, head: next.head, pending: next.pending,
					observed: [...(next.observed || []).filter(key => parseHeadKey(key).device !== deviceId), next.pending.key], forgotten: next.forgotten};
				if (personal && next.personal) await personal.commit(next.personal, next.personalBase, assertActive);
				writes.set(SYNC_STATE_FILE, await syncStateWrite(state, previous.bytes));
				const result = await lease.transact(() => {
					assertActive();
					return {kind: 'sync', index, writes: [...histories.values(), ...writes.values()], removes};
				}, {bodies: []});
				if (result.dropped?.length) refuse('changed', 'the owner retained a newer foreign write; reconcile before publishing');
				return result;
			});
		},
		heads: {
			async get(key) {
				const bytes = await folder.store.read(headCacheName(key));
				return bytes && await sha256Hex(bytes) === parseHeadKey(key).hash ? bytes : null;
			},
			put: (key, bytes) => withLease(() => folder.store.write(headCacheName(key), bytes)),
		},
		async observe(keys, verified) {
			const result = await updateSyncState(folder, (state, index) => {
				activeFolder(index); assertActive();
				return same(state.observed || [], keys) && same(state.verified, verified) ? null : {...state, observed: keys, verified};
			});
			await withLease(() => retainHeads(keys));
			return result;
		},
		async acknowledge(key) {
			await updateSyncState(folder, (state, index) => {
				activeFolder(index); assertActive();
				if (state.pending?.key !== key) refuse('changed', 'the pending sync receipt changed');
				return {...state, pending: null};
			});
			await withLease(async lease => {
				// A restarted receipt-only reader has not discovered the previous run's spools.
				const current = await lease.read(); assertActive(); activeFolder(current.index);
				await loadObjects(); assertActive();
				for (const name of objects.values()) { try { await folder.store.remove(name); } catch (_) {} }
				objects.clear(); byContent.clear(); loaded = false;
				await retainHeads((await readSyncStateBytes(folder.store)).state.observed || []);
			});
		},
		async rememberObject(content, hash, bytes) {
			if (!HASH_RE.test(content) || !HASH_RE.test(hash) || await sha256Hex(bytes) !== hash) refuse('cache', 'the upload intent has no exact immutable bytes');
			if (objects.has(hash)) return;
			const name = '.rapier-sync-object-' + content + '-' + hash + '.tmp';
			await withLease(async () => {
				await folder.store.write(name, bytes);
				const kept = await folder.store.read(name);
				if (!kept || await sha256Hex(kept) !== hash) refuse('cache', 'the upload intent did not read back; nothing was sent');
				rememberName(content, hash, name);
			});
		},
		getSealed: async hash => objects.has(hash) ? folder.store.read(objects.get(hash)) : null,
		getByContent: (content, excluded = []) => (byContent.get(content) || []).find(hash => !excluded.includes(hash)) || null,
	};
}
