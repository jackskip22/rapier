
import {admitPersonal, mergePersonal, personalAsset} from './personal.mjs';
import {isNoteFile, isCodeFile, emptyIndex, NOTES_INDEX_FILE, validNoteId as validId} from './model.mjs';
import {mergeIndex, assignNoteFilenames, inspectTextConflicts, mapTextConflictVariants} from './merge.mjs';
import {seal, open} from './vault.mjs';
import {recordingsOf} from './audio.mjs';
import {attachmentsOf} from './attachments.mjs';
import {runTrash} from './trash.mjs';
import {manifestName, parseManifest, parseCanonical, appendCanonical, canonicalSources, bindMedia, joinMedia, unboundMedia} from './history.mjs';
import {readLedger} from '../kit/ledger/format.mjs';
import {joinCanonical} from './canonical-merge.mjs';
import {prepareCanonicalAdmission, verifyCanonicalNote, verifyCanonicalBinding} from './sync-canonical-admission.mjs';
import {buildLinkIndex, resolveLinkIndex, renameLinks} from './links.mjs';
import {planSyncMedia, rewriteSyncMedia} from './sync-media.mjs';
import {storedFileDigest} from './integrity.mjs';
import {assetDigest, assetBytes, assetSize, captureAsset, validateCapturedAsset} from './sync-assets.mjs';
import {SYNC_STATE_FILE, readSyncStateBytes, syncStateWrite, updateSyncState} from './sync-state.mjs';

export const HEAD_VERSION = 2;
export const OBJECT_PREFIX = 'objects/';
const AUDIT_SAMPLE = 16;
export const HEAD_PREFIX = 'heads/';
export const OBJECT_AAD = 'object';

const te = new TextEncoder();
const td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const codeDecoder = new TextDecoder('utf-8', {ignoreBOM: true});
const fileBody = (file, bytes) => isCodeFile(file) ? {text: codeDecoder.decode(bytes), bytes} : {text: td.decode(bytes)};
const fileBytes = value => value.bytes ?? te.encode(typeof value === 'string' ? value : value.text);
const fileHash = value => sha256Hex(fileBytes(value));
function sameFile(a, b) {
	if (!a || !b) return false;
	if (!a.bytes && !b.bytes) return a.text === b.text;
	const ours = fileBytes(a), theirs = fileBytes(b);
	return ours.length === theirs.length && ours.every((byte, i) => byte === theirs[i]);
}
const subtle = () => globalThis.crypto.subtle;
function refuse(code, message) { throw Object.assign(new Error(message), {code}); }

export async function sha256Hex(bytes) {
	const hash = new Uint8Array(await subtle().digest('SHA-256', bytes instanceof Uint8Array ? bytes : te.encode(String(bytes))));
	let hex = '';
	for (let i = 0; i < hash.length; i++) hex += hash[i].toString(16).padStart(2, '0');
	return hex;
}
export function canonicalText(text) { return String(text ?? ''); }
export async function contentHash(text) { return sha256Hex(te.encode(canonicalText(text))); }
export function objectKey(hash) { return OBJECT_PREFIX + hash; }
const GENERATION_DIGITS = 12;
export const headGeneration = generation => String(generation).padStart(GENERATION_DIGITS, '0');
export function headKey(deviceId, generation, hash) {
	if (!DEVICE_RE.test(deviceId) || !Number.isSafeInteger(generation) || generation < 1 || generation >= 10 ** GENERATION_DIGITS || !HASH_RE.test(hash)) refuse('corrupt', 'invalid head address');
	return `${HEAD_PREFIX}${deviceId}/${headGeneration(generation)}-${hash}`;
}
const HASH_RE = /^[a-f0-9]{64}$/;
const MEDIA_OP_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}:[a-f0-9-]{36}$/;
const DEVICE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const HEAD_RE = /^heads\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/([0-9]{12})-([a-f0-9]{64})$/;
const safeFile = file => isNoteFile(file) && !/[\0-\x1f\x7f]/.test(file);
const WRITER_RE = /^[a-f0-9]{32}$/;
const HELD_REASONS = ['history', 'media', 'deleted-media'];
export const headLabel = value => typeof value === 'string' && value.length > 0 && value.length <= 64 && value.trim() === value && !/[\0-\x1f\x7f]/.test(value) ? value : null;
const safeAsset = file => typeof file === 'string' && /^(?:audio|attachments)\/[^/\\\x00-\x1f\x7f]+$/.test(file) && !file.split('/')[1].startsWith('.');
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const headAAD = head => `${HEAD_PREFIX}${head.device}/${headGeneration(head.generation)}`;
const portableIndex = index => ({version: 1, notes: {}, sections: index?.sections || [], collapsed: index?.collapsed || {}});
function parseHeadKey(key) {
	const m = typeof key === 'string' && HEAD_RE.exec(key);
	if (!m || !(Number(m[2]) >= 1)) refuse('corrupt', 'invalid immutable head address');
	return {device: m[1], generation: Number(m[2]), hash: m[3]};
}
export async function snapshotToken(snapshot) {
	const assets = {};
	for (const [name, value] of Object.entries(snapshot.assets || {})) assets[name] = value.skipped ? {size: value.size, skipped: true} : {content: await assetDigest(value), size: assetSize(value)};
	const {ownerNotice, ...index} = snapshot.index || {};
	return sha256Hex(te.encode(JSON.stringify(sortObject({deviceId: snapshot.deviceId, assets,
		files: snapshot.files, index, personal: snapshot.personal?.records || {}, head: snapshot.head || null, pending: snapshot.pending || null}))));
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
		...(head.writer ? {writer: head.writer} : {}), ...(head.label ? {label: head.label} : {}), ...(head.held ? {held: sortObject(head.held)} : {})}));
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
			if (r.media !== undefined && (!Array.isArray(r.media) || r.media.some(row => !record(row) || !safeAsset(row.file) || typeof row.act !== 'string' || !HASH_RE.test(row.content) || row.end !== undefined && typeof row.end !== 'string'))) refuse('corrupt', 'the note has an invalid media binding');
			if (!record(r.sidecar) || r.sidecar.id !== id || (r.conflicts !== undefined && !Array.isArray(r.conflicts))) refuse('corrupt', 'the head sidecar has an invalid identity or conflict ledger');
			verifyCanonicalNote(r.ledger, undefined, r.sidecar, r.content);
			const name = r.file.normalize('NFC').toLowerCase();
			if (names.has(name)) refuse('corrupt', 'the head has colliding filenames');
			names.add(name);
		} else if (!Number.isFinite(r.at) || r.at < 0) refuse('corrupt', 'the tombstone has no explicit deletion time');
		if (kind === 'tombstone' && r.observed !== undefined) { if (!Array.isArray(r.observed)) refuse('corrupt', 'a deletion has no readable observed frontier'); for (const key of r.observed) parseHeadKey(key); }
		if (kind === 'tombstone') {
			if (!Array.isArray(r.deletions) || !r.deletions.length) refuse('corrupt', 'the deletion set is empty');
			for (const t of r.deletions) if (!record(t) || !safeFile(t.file) || !safeFile(t.priorFile) ||
				!(t.object === null || HASH_RE.test(t.object)) || !HASH_RE.test(t.content) || !Array.isArray(t.parents) || t.parents.some(p => !HASH_RE.test(p)) ||
				!Number.isSafeInteger(t.at) || t.at < 0 || t.baseEntry !== undefined && (!record(t.baseEntry) || t.baseEntry.id !== id) || !validId(t.opId) || typeof t.device !== 'string' || !DEVICE_RE.test(t.device)) refuse('corrupt', 'a deletion has no exact identity and content proof');
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
	if (!record(raw.personal)) refuse('corrupt', 'the head has no readable personal settings map');
	if (raw.held !== undefined && (!record(raw.held) || Object.entries(raw.held).some(([id, r]) => !validId(id) || !record(r) || !HELD_REASONS.includes(r.reason) || !safeFile(r.file) ||
		!HASH_RE.test(r.content) || !HASH_RE.test(r.ledger) || typeof r.published !== 'boolean'))) refuse('corrupt', 'the head has an invalid held note');
	raw.personal = admitPersonal(raw.personal);
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
	if (value instanceof Uint8Array) return value;
	if (Array.isArray(value)) return value.map(sortObject);
	if (value && typeof value === 'object') {
		const out = {};
		for (const k of Object.keys(value).sort()) out[k] = sortObject(value[k]);
		return out;
	}
	return value;
}

const noteText = (file, text, rewrite) => isCodeFile(file) ? text : rewrite(text);

function noteIndex(fe) {
	if (!fe) return null;
	const {canonicalHistory, ...entry} = fe.entry;
	return {version: 1, notes: {[fe.file]: entry}};
}
function mergeSidecar(base, ours, theirs, oursId, theirsId, options = {}) {
	const result = mergeIndex(noteIndex(base), noteIndex(ours), noteIndex(theirs), {oursId, theirsId, ...options});
	const file = Object.keys(result.index.notes)[0];
	return {file, entry: result.index.notes[file], conflicts: result.conflicts};
}
async function textConflictDigest(conflict, id) {
	return {kind: conflict.kind, path: ['notes', id, 'text'], blockHash: await contentHash(conflict.block),
		variants: await Promise.all(conflict.variants.map(async v => ({device: v.device, content: await contentHash(v.text)})))};
}
const mediaNames = text => [...recordingsOf(text).map(row => 'audio/' + row.name), ...attachmentsOf(text).map(row => 'attachments/' + row.name)];
function canonicalMedia(ledger, id) {
	const names = new Set(), manifest = {...parseManifest(null, {noteId: id, now: 0}), canonical: ledger};
	for (const {text} of canonicalSources(manifest)) for (const file of mediaNames(text)) names.add(file);
	return names;
}

function localNotes(local) {
	const files = local.files || {};
	const index = local.index || emptyIndex();
	const out = [];
	for (const file of Object.keys(files).sort()) {
		if (!isNoteFile(file)) continue;
		const rec = files[file];
		const bytes = isCodeFile(file) && rec.bytes;
		const text = bytes ? codeDecoder.decode(bytes) : typeof rec === 'string' ? rec : rec.text;
		if (!safeFile(file) || typeof text !== 'string') refuse('bytes', 'a local note must have a safe filename and exact text');
		const entry = copyEntry(index.notes[file]), proved = verifyCanonicalNote(rec.ledger, text, entry);
		if (bytes && !sameFile({bytes}, {text})) refuse('notes_history_unavailable', 'non-UTF-8 source has no exact canonical history');
		out.push({file, text, ledger: proved.ledger, ...(bytes ? {bytes} : {}), entry, media: rec.media});
	}
	return out;
}

async function hashedLocals(local, historyParents) {
	const rows = localNotes(local);
	const ourHead = local.head && local.head.device === local.deviceId ? local.head : emptyHead(local.deviceId);
	const out = [], seen = new Set();
	for (const row of rows) {
		const id = row.entry && row.entry.id;
		if (!validId(id) || seen.has(id)) refuse('identity', 'local notes need unique admitted identities');
		seen.add(id);
		const content = await fileHash(row);
		const known = ourHead.notes[id];
		const parents = known?.object ? (known.content === content ? (known.parents || []) : [known.object]) : [];
		const cached = local.byContent?.[content];
		const adopted = cached && !parents.some(p => isAncestor(cached, p, historyParents)) ? cached : null;
		out.push({
			id, file: row.file, text: row.text, ledger: row.ledger, ...(row.bytes ? {bytes: row.bytes} : {}), content, entry: {...row.entry, id},
			object: known && known.content === content ? known.object : adopted,
			revivals: known?.revivals || [], key: ourHead._key || null, media: row.media,
			changedFromHead: !!known && (row.file !== known.file || content !== known.content || row.ledger.sha256 !== known.ledger?.sha256 || !same(deletionMetadata(row.entry), deletionMetadata(known.sidecar)) || known.sidecar.trashed === true && row.entry.trashed !== true), parents,
		});
	}
	return {rows: out, ourHead};
}

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
			touch(id, {source: 'head', device: head.device, key: head._key || null, id, file: rec.file, object: rec.object, content: rec.content, entry: rec.sidecar, ledger: rec.ledger, parents: rec.parents, conflicts: rec.conflicts || [], revivals: rec.revivals || [], media: rec.media});
		}
		for (const [id, rec] of Object.entries(head.tombstones || {})) {
			for (const t of rec.deletions) touch(id, {source: 'head', ...t, id, tombstone: true});
		}
	}
	return byId;
}

function deletionMetadata(entry) {
	return Object.fromEntries(Object.entries(entry || {}).filter(([key]) => !['revision', 'trashed', 'archived', 'trashedAt', 'trashDigest', 'trashRevision', 'modified', 'created'].includes(key)));
}
function seenBy(t, live, known) {
	if (!live.id || !Array.isArray(t.observed)) return false;
	const frontier = t.observed.map(parseHeadKey);
	return known.some(head => {
		const rec = head?._key && head.notes?.[live.id], at = rec && parseHeadKey(head._key);
		return rec && frontier.some(o => o.device === at.device && o.generation >= at.generation) && rec.file === live.file &&
			rec.content === live.content && same(deletionMetadata(rec.sidecar), deletionMetadata(live.entry));
	});
}
function tombstoneWins(localRow, tombstones, liveVersions, parents, known = []) {
	if (!tombstones.length) return false;
	const lives = [...(localRow ? [localRow] : []), ...(liveVersions || [])].filter(v => v && (v.object || v.content));
	if (!lives.length) return true;
	for (const live of lives) {
		if (live.source === 'local' && live.changedFromHead) return false;
		let covered = false;
		for (const t of tombstones) {
			const observed = live.key && (t.observed || []).includes(live.key) || seenBy(t, live, known);
			if (!observed && live.file !== t.file && live.file !== t.priorFile || (live.revivals || []).includes(t.opId)) continue;
			if (!observed && t.baseEntry && live.entry && !same(deletionMetadata(t.baseEntry), deletionMetadata(live.entry))) continue;
			if (live.object && [t.object, ...(t.parents || [])].some(object => object && (object === live.object || isAncestor(live.object, object, parents)))) { covered = true; break; }
			if (t.content && live.content && t.content === live.content) { covered = true; break; }
		}
		if (!covered) return false;
	}
	return true;
}

function headPayload(head) { return sortObject({notes: head.notes, tombstones: head.tombstones, assets: head.assets || {}, assetTombstones: head.assetTombstones || {}, assetRevivals: head.assetRevivals || [], metadata: head.metadata, personal: head.personal || {}, writer: head.writer ?? null, label: head.label ?? null, held: head.held ?? null}); }
function same(left, right) { return JSON.stringify(sortObject(left)) === JSON.stringify(sortObject(right)); }
function uniqueConflicts(rows, active = null) {
	const unique = [...new Map(rows.map(c => [JSON.stringify(sortObject(c)), c])).values()];
	const keys = c => c.blockHash && c.path?.[2] === 'text' ? new Set(c.variants.map(v => v.device + ':' + v.content)) : null;
	const sets = unique.map(keys);
	return unique.filter((c, i) => !active || active.has(c.blockHash) || !sets[i] || !unique.some((other, j) => j !== i && active.has(other.blockHash) && sets[j]?.size > sets[i].size &&
		same(c.path, other.path) && [...sets[i]].every(key => sets[j].has(key))));
}

export async function plan(local, heads, capabilities) {
	const deviceId = local.deviceId;
	const returned = !!heads.retiredFrontiers?.length;
	if (!DEVICE_RE.test(deviceId)) refuse('identity', 'a stable install identity is required');
	if (local.pending) refuse('pending', 'finish the durable pending publication before planning another sync');
	const expected = await snapshotToken(local);
	const allHeads = (Array.isArray(heads) ? heads.slice() : []).sort((a, b) => (a.device < b.device ? -1 : a.device > b.device ? 1 : 0));
	const published = allHeads.find(h => h && h.device === deviceId);
	if (local.head?._key && published?._key !== local.head._key) refuse('rollback', 'this install checkpoint and its published head differ; keep both copies and reconnect the restored copy with a fresh install identity');
	const assets = await planSyncMedia(local, allHeads, capabilities);
	const rebound = new Set(), held = new Set(), unbound = new Set(), reasons = new Map();
	const present = new Set([...Object.keys(assets.output), ...assets.skipped]), deletedPaths = new Set(Object.values(assets.tombstones).flatMap(t => [t.file, t.source]));
	for (const row of [
		...Object.entries(local.files || {}).map(([file, value]) => ({file, id: local.index.notes[file]?.id, ledger: value.ledger, media: value.media, mapping: assets.mappings.local})),
		...allHeads.flatMap(head => Object.entries(head.notes || {}).map(([id, row]) => ({file: row.file, id, ledger: row.ledger, media: row.media, mapping: assets.mappings.heads[head.device]}))),
	]) {
		if (isCodeFile(row.file)) continue;
		const media = [...canonicalMedia(row.ledger, row.id)];
		if (media.some(file => row.mapping?.[file] && row.mapping[file] !== file)) { rebound.add(row.id); reasons.set(row.id, 'media'); }
		else if (media.some(file => !present.has(file) && deletedPaths.has(file))) {
			const loose = unboundMedia(row.ledger, row.media || [], mediaNames);
			if (media.some(file => !present.has(file) && deletedPaths.has(file) && loose.has(file))) unbound.add(row.id);
		}
	}

	const localForHash = {...local, head: local.head?.device === deviceId ? local.head : published || local.head || emptyHead(deviceId)};
	const {rows: locals, ourHead} = await hashedLocals(localForHash, parentGraph([localForHash.head, ...allHeads]));
	if (!local.head && published && locals.some(row => {
		const known = published.notes[row.id];
		return known && (known.content !== row.content || !same(known.sidecar, row.entry));
	})) refuse('rollback', 'the restored copy has no checkpoint proving these changes; keep both copies and reconnect with a fresh install identity');
	const others = allHeads.filter(h => h && h.device !== deviceId);
	const observed = new Set(local.observed || []), peerBases = new Map();
	for (const tip of allHeads) {
		let base = tip;
		while (base && !observed.has(base._key)) base = base._previousHead;
		peerBases.set(tip.device, base || null);
	}
	const graphHeads = [ourHead, ...others];
	const knownHeads = [...graphHeads, ...peerBases.values(), ...allHeads.flatMap(head => [head._seenHead, head._previousHead])].filter(head => head?.notes);
	const parents = parentGraph(graphHeads, locals);
	const byId = collectById(locals, graphHeads);
	for (const row of locals) if (!byId.has(row.id)) byId.set(row.id, {versions: [{source: 'local', ...row}], tombstones: []});
	const localMedia = new Map(), mediaOut = {}, removing = new Map(assets.removes.map(row => [row.file, row.content]));
	for (const row of locals) {
		if (isCodeFile(row.file)) continue;
		const named = canonicalMedia(row.ledger, row.id), fresh = ourHead.notes[row.id]?.ledger?.sha256 !== row.ledger.sha256;
		let media = row.media || [];
		for (const file of named) if (removing.has(file)) media = bindMedia(row.ledger, media, file, removing.get(file), mediaNames, {close: true});
		if (media !== (row.media || [])) mediaOut[row.id] = media;
		for (const file of named) {
			const bytes = local.assets?.[file];
			if (fresh && !removing.has(file) && bytes && (bytes instanceof Uint8Array || HASH_RE.test(bytes.content))) media = bindMedia(row.ledger, media, file, await assetDigest(bytes), mediaNames);
		}
		localMedia.set(row.id, media);
	}

	for (const [id, rows] of Object.entries(local.index?.tombstones || {})) for (const row of rows) {
		if (row.pending || row.revivedAt !== undefined || !Number.isSafeInteger(row.deletedAt)) continue;
		if (!validId(id) || !validId(row.opId) || !HASH_RE.test(row.digest) || typeof row.device !== 'string' || !DEVICE_RE.test(row.device) || !Number.isSafeInteger(row.at) || row.at < 0) refuse('corrupt', 'a completed note deletion has no exact proof');
		if (!byId.has(id)) byId.set(id, {versions: [], tombstones: []});
		if (byId.get(id).tombstones.some(t => t.opId === row.opId)) continue;
		const known = ourHead.notes[id] || ourHead.tombstones[id];
		byId.get(id).tombstones.push({source: 'local', tombstone: true, id, file: row.file,
			opId: row.opId, device: row.device, at: row.at,
			...(row.checkpoint && row.checkpoint === ourHead._key ? {observed: [...new Set([ourHead._key, ...(ourHead.seen || [])])].sort()} : {}),
			priorFile: known?.file || row.file, ...(known?.sidecar ? {baseEntry: known.sidecar} : {}), content: row.digest, object: known?.content === row.digest ? known.object : null,
			parents: known?.object && known.content !== row.digest ? [known.object] : known?.parents || []});
	}

	const canonicalInputs = {}, canonicalContexts = {}, uploads = [], downloads = [], sourceReads = [], localWrites = [], localTrash = [], merges = [], renames = [], deletionConflicts = [];
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
		const rec = {file: row.file, object: object || null, content: row.content, ledger: row.ledger, sidecar: copyEntry(row.entry), parents: row.parents || extra.parents || [], ...((extra.conflicts || []).length ? {conflicts: extra.conflicts} : {}), ...(row.media?.length ? {media: row.media} : {})};
		notesOut[row.id] = rec;
		const alreadyPublished = !!(object && ourHead.notes[row.id] && ourHead.notes[row.id].object === object && ourHead.notes[row.id].content === row.content);
		if (row.text != null && !alreadyPublished && extra.adopted !== true) {
			uploads.push({id: row.id, file: row.file, content: row.content, text: row.text, ...(row.bytes ? {bytes: row.bytes} : {}), object: object || null, parents: rec.parents, ancestors: [...new Set(rec.parents.flatMap(p => [...ancestorsOf(p, parents)]))], sidecar: rec.sidecar});
		}
	};

	const ids = [...byId.keys()].sort();
	for (const id of ids) {
		const slot = byId.get(id);
		const localRow = slot.versions.find(v => v.source === 'local') || null;
		const remoteVersions = slot.versions.filter(v => v.source === 'head' && (v.device !== deviceId || !localRow));
		const tombs = slot.tombstones;
		const revivals = new Set(slot.versions.flatMap(v => v.revivals || []));
		if (localRow && (ourHead.tombstones[id] || ourHead.notes[id]?.sidecar.trashed === true && localRow.entry.trashed !== true)) {
			for (const t of tombs) revivals.add(t.opId);
		}
		if (localRow) localRow.revivals = [...revivals].sort();
		revivalById.set(id, [...revivals].sort());
		const activeTombs = tombs.filter(t => !revivals.has(t.opId));

		if (activeTombs.length && tombstoneWins(localRow, activeTombs, remoteVersions, parents, knownHeads)) {
			const t = activeTombs.slice().sort((a, b) => String(a.file || '').localeCompare(String(b.file || '')))[0];
			if (localRow) localTrash.push({id, file: localRow.file, content: localRow.content, at: t.at});
			const clean = row => ({file: row.file, ...(row.observed ? {observed: row.observed} : {}), priorFile: row.priorFile, ...(row.baseEntry ? {baseEntry: row.baseEntry} : {}), at: row.at, object: row.object, content: row.content, parents: row.parents, opId: row.opId, device: row.device});
			tombstonesOut[id] = {...clean(t), deletions: [...new Map(activeTombs.map(row => [JSON.stringify(clean(row)), clean(row)])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row)};
			rebound.delete(id); unbound.delete(id); reasons.delete(id);
			continue;
		}
		if (activeTombs.length && (localRow || remoteVersions.length)) {
			deletionConflicts.push({kind: 'delete-edit', path: ['notes', id], deletions: activeTombs.map(t => ({opId: t.opId, device: t.device, at: t.at, content: t.content}))});
			for (const t of activeTombs) revivals.add(t.opId);
			revivalById.set(id, [...revivals].sort());
		}
		if (!localRow && !remoteVersions.length) continue;

		if (rebound.has(id)) continue;
		if (unbound.has(id)) { held.add(id); reasons.set(id, 'deleted-media'); continue; }
		const candidates = [...(localRow ? [localRow] : []), ...remoteVersions];
		for (const row of candidates) verifyCanonicalNote(row.ledger, row.source === 'local' ? row.text : undefined, row.entry, row.content);
		let ledger = candidates[0].ledger;
		try { for (const row of candidates.slice(1)) ledger = joinCanonical(ledger, row.ledger); }
		catch (error) { if (error?.code !== 'notes_history_conflict') throw error; held.add(id); reasons.set(id, 'history'); continue; }
		const proved = readLedger(ledger), content = ledger.head.sha256;
		if (!isCodeFile(candidates[0].file) && mediaNames(proved.text).some(file => !present.has(file) && deletedPaths.has(file))) { held.add(id); reasons.set(id, 'deleted-media'); continue; }
		const seed = localRow || candidates.find(row => row.ledger.sha256 === ledger.sha256) || candidates[0];
		let media;
		try { media = joinMedia([localMedia.get(id), ...slot.versions.filter(row => row.source === 'head').map(row => row.media)]); }
		catch (error) { if (error?.code !== 'notes_media_conflict') throw error; held.add(id); reasons.set(id, 'media'); continue; }
		mediaOut[id] = media;
		const exact = candidates.find(row => row.content === content && row.object && !(localRow?.parents || []).some(parent => isAncestor(row.object, parent, parents)));
		canonicalInputs[id] = candidates.map(row => ({ledger: row.ledger, file: row.file, device: row.source === 'local' ? null : row.device}));
		const context = candidates.find(row => row.ledger.sha256 === ledger.sha256) || seed;
		canonicalContexts[id] = context.source === 'local' ? null : context.device;
		const entry = {...copyEntry(seed.entry), id, canonicalHistory: ledger.sha256};
		const parentObjects = tipsOf(candidates.flatMap(row => row.object ? [row.object] : row.parents || []), parents);
		const body = {id, file: seed.file, text: proved.text, ledger, content, entry, media,
			object: exact?.object || null, parents: exact?.parents || parentObjects};
		publish(body, {adopted: exact?.source === 'head'});
		if (exact?.source === 'head' && (!localRow || content !== localRow.content)) {
			downloads.push({id, device: exact.device, key: objectKey(exact.object), hash: exact.object, file: seed.file,
				sidecar: entry, ledger, content, parents: body.parents, conflicts: exact.conflicts || []});
		} else if (!localRow || localRow.ledger.sha256 !== ledger.sha256) {
			localWrites.push({id, file: seed.file, text: proved.text, ledger, sidecar: entry});
		}
		for (const row of remoteVersions) if ((!localRow || row.content !== localRow.content && row.ledger.records.some(act => !localRow.ledger.records.some(kept => kept.transaction.id === act.transaction.id))) &&
			!downloads.some(download => download.hash === row.object) && !sourceReads.some(read => read.object === row.object))
			sourceReads.push({id, file: seed.file, object: row.object, content: row.content});

	}

	const deferredIds = new Set([...rebound, ...held]), deferredFiles = new Set();
	for (const [file, value] of Object.entries(local.files || {})) {
		if (isCodeFile(file)) continue;
		if (!tombstonesOut[local.index.notes[file]?.id] && [...canonicalMedia(value.ledger, local.index.notes[file]?.id)].some(name => assets.skipped.includes(name))) {
			deferredIds.add(local.index.notes[file]?.id); deferredFiles.add(file);
		}
	}
	for (const id of deferredIds) delete notesOut[id];

	const downloadsById = new Map(downloads.map(row => [row.id, row]));
	const requestedFile = (id, row, ledger = []) => [...(row.conflicts || []), ...ledger]
		.find(conflict => conflict.kind === 'filename-collision' && conflict.noteID === id && conflict.assigned === row.file)?.requested || row.file;
	for (const [id, rec] of Object.entries(notesOut)) {
		const versions = byId.get(id).versions;
		const localRow = versions.find(v => v.source === 'local');
		const allPeers = versions.filter(v => v.source === 'head' && (v.device !== deviceId || !localRow));
		const observedPeers = localRow ? null : new Set(allHeads.filter(head => head.notes[id]).flatMap(head => head.seen));
		const peers = localRow ? allPeers : allPeers.filter(peer => !observedPeers.has(peer.key));
		const seed = localRow || peers.find(v => v.object === rec.object) || peers[0];
		let entry = copyEntry(seed.entry), chosenFile = requestedFile(id, seed, seed === localRow ? local.index?.conflicts : []);
		let conflicts = [...(local.index?.conflicts || []).filter(c => c.path?.[0] === 'notes' && c.path[1] === id), ...(ourHead.notes[id]?.conflicts || []), ...allPeers.flatMap(v => v.conflicts || [])];
		for (const peer of peers) {
			if (peer === seed) continue;
			const prior = peerBases.get(peer.device), seen = allHeads.find(head => head.device === peer.device)?._seenHead;
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
		rec.sidecar = {...entry, canonicalHistory: rec.ledger.sha256};
		conflicts = uniqueConflicts(conflicts);
		if (conflicts.length) rec.conflicts = conflicts;
	}
	const keptHeld = [...held].filter(id => !rebound.has(id) && ourHead.notes[id] && locals.find(row => row.id === id)?.file === ourHead.notes[id].file);
	const reserved = [...Object.keys(local.files || {}).filter(file => !locals.some(row => row.file === file && notesOut[row.id])), ...keptHeld.map(id => ourHead.notes[id].file)];
	for (const named of assignNoteFilenames(Object.entries(notesOut).map(([id, rec]) => ({file: rec.file, entry: {...rec.sidecar, id}})), reserved)) {
		const id = named.entry.id, rec = notesOut[id], localRow = locals.find(row => row.id === id), entry = rec.sidecar;
		rec.file = named.file;
		const conflicts = [...(rec.conflicts || [])];
		if (named.file !== named.requested) conflicts.push({kind: 'filename-collision', path: ['notes', id, 'file'], noteID: id, requested: named.requested, assigned: named.file});
		if (conflicts.length) rec.conflicts = uniqueConflicts(conflicts);
		if (localRow && rec.file !== localRow.file) renames.push({id, file: localRow.file, wanted: rec.file, content: await fileHash(local.files[localRow.file])});
		for (const write of localWrites) if (write.id === id) write.file = rec.file;
		const download = downloadsById.get(id);
		if (download) { download.file = rec.file; download.sidecar = entry; if (conflicts.length) download.conflicts = conflicts; }
		if (localRow && !same(entry, localRow.entry)) localWrites.push({file: rec.file, sidecar: entry});
		if (!download && conflicts.length) merges.push({id, file: rec.file, conflicts});
	}

	for (const id of keptHeld) notesOut[id] = structuredClone(ourHead.notes[id]);

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
	const linksFor = entries => entries.filter(([id]) => notesOut[id])
		.map(([id, row]) => ({file: row.file, wanted: notesOut[id].file}));
	const linkContexts = {local: linksFor(locals.map(row => [row.id, row])), heads: {}};
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
	const declared = {};
	for (const id of deferredIds) {
		const row = locals.find(row => row.id === id);
		if (row && reasons.has(id)) declared[id] = {reason: reasons.get(id), file: row.file, content: row.content, ledger: row.ledger.sha256, published: !!notesOut[id]};
	}
	if (Object.keys(declared).length) head.held = sortObject(declared);
	head.personal = mergePersonal(ourHead.personal, ...allHeads.map(head => head.personal), local.personal?.records);
	const personalObjects = new Set([ourHead, ...allHeads].flatMap(head => Object.values(head.personal || {}).filter(row => row.value?.object).map(row => row.value.content + ':' + row.value.object)));
	for (const [key, row] of Object.entries(head.personal)) if (personalAsset(key) && row.value?.object && !personalObjects.has(row.value.content + ':' + row.value.object)) row.value.object = null;

	const omit = list => { for (let i = list.length - 1; i >= 0; i--) if (deferredIds.has(list[i].id) || deferredFiles.has(list[i].file)) list.splice(i, 1); };
	for (const list of [uploads, downloads, merges, localWrites, localTrash, renames]) omit(list);
	head.ancestry = Object.fromEntries([...parents].map(([object, list]) => [object, [...list]]));
	return {
		returned, held: [...new Set([...rebound, ...held])].sort(),
		heldElsewhere: [...new Set(others.flatMap(other => Object.keys(other.held || {})))].filter(id => !deferredIds.has(id)).sort(),
		heldNotes: Object.fromEntries([...others.flatMap(other => Object.entries(other.held || {}).map(([id, row]) => [id, {file: row.file, reason: row.reason, here: false}])),
			...[...reasons].filter(([id]) => deferredIds.has(id)).map(([id, reason]) => [id, {file: locals.find(row => row.id === id)?.file ?? byId.get(id)?.versions[0]?.file ?? null, reason, here: !!declared[id]}])]),
		expected, canonicalInputs, canonicalContexts, sourceReads, skipped: assets.skipped, renames, linkRenames, linkContexts, assetRemoves: assets.removes, media: mediaOut, verified: heads.verified || local.verified || null, rootConflicts, assetUploads: assets.uploads, assetDownloads: assets.downloads, assetCopies: assets.copies, assetAliases: assets.aliases, assetMappings: assets.mappings, observed: allHeads.map(h => h._key).filter(Boolean),
		devices: [head, ...others].map(h => ({device: h.device, writer: h.writer ?? null, label: h.label ?? null})),
		uploads: uploads.map(sortObject).sort((a, b) => (a.id || '').localeCompare(b.id || '') || a.file.localeCompare(b.file)),
		downloads: downloads.map(sortObject).sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file)),
		localWrites: localWrites.map(sortObject).sort((a, b) => a.file.localeCompare(b.file)),
		localTrash: localTrash.map(sortObject).sort((a, b) => a.file.localeCompare(b.file)),
		merges: merges.map(sortObject).sort((a, b) => a.id.localeCompare(b.id)),
		conflicts: [],
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
export const UPLOAD_WORKSPACE_BYTES = 64 * 1024 * 1024;
function uploadSize(item) {
	if (item.bytes) return assetSize(item.bytes);
	let size = 0;
	for (const point of item.text || '') { const c = point.codePointAt(0); size += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4; }
	return size;
}
async function parallelUploads(items, run) {
	const weights = items.map(item => {
		const size = uploadSize(item), weight = 4 * (size + 29);
		if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(weight)) refuse('incomplete', 'an upload has no exact byte count');
		return weight;
	});
	let budget = UPLOAD_WORKSPACE_BYTES;
	for (const weight of weights) budget = Math.max(budget, weight);
	let at = 0, active = 0, held = 0, failed = false, failure;
	await new Promise((resolve, reject) => {
		function pump() {
			while (!failed && at < items.length && active < UPLOAD_CONCURRENCY && held + weights[at] <= budget) {
				const index = at++, weight = weights[index]; active++; held += weight;
				Promise.resolve().then(() => run(items[index])).catch(error => { if (!failed) { failed = true; failure = error; } }).finally(() => {
					active--; held -= weight; pump();
				});
			}
			if (!active) { if (failed) reject(failure); else if (at === items.length) resolve(); }
		}
		pump();
	});
}

export async function execute(inputPlan, transport, store, options = {}) {
	const plan = structuredClone(inputPlan);
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

	const relocate = (device, file, text) => noteText(file, text, source => rewriteLinks(rewriteSyncMedia(source,
		device === null ? plan.assetMappings?.local : plan.assetMappings?.heads[device]), device === null ? plan.linkContexts.local : plan.linkContexts.heads[device]));
	for (const [id, inputs] of Object.entries(plan.canonicalInputs || {})) {
		const rec = plan.head.notes[id];
		if (!rec || inputs.some(row => row.ledger.sha256 === rec.ledger.sha256)) continue;
		for (const row of inputs) {
			const text = readLedger(row.ledger).text;
			if (relocate(row.device, row.file, text) !== relocate(plan.canonicalContexts[id], row.file, text))
				refuse('notes_history_conflict', 'both source histories were kept; concurrent relative links need a proven common namespace');
		}
	}
	const downloaded = new Map();
	const sealedUploads = [];
	const assets = structuredClone(snapshot.assets || {});
	for (const row of plan.assetRemoves || []) delete assets[row.file];
	for (const copy of plan.assetCopies || []) assets[copy.file] = copy.bytes;
	for (const item of plan.assetDownloads || []) {
		const got = await transport.get(objectKey(item.object));
		if (!got) refuse('incomplete', 'a kept media object is missing');
		if (await sha256Hex(got.bytes) !== item.object) refuse('ciphertext', 'media ciphertext does not match its address');
		const bytes = await open(vdk, OBJECT_AAD, got.bytes);
		if (await sha256Hex(bytes) !== item.content) refuse('content', 'media plaintext does not match its declared digest');
		assets[item.file] = bytes;
	}


	for (const row of plan.sourceReads || []) {
		const got = await transport.get(objectKey(row.object));
		if (!got) refuse('incomplete', 'a retained canonical source object is missing');
		if (await sha256Hex(got.bytes) !== row.object) refuse('ciphertext', 'a canonical source ciphertext does not match its address');
		const plain = await open(vdk, OBJECT_AAD, got.bytes);
		if (await sha256Hex(plain) !== row.content) refuse('content', 'a canonical source does not match its authenticated ledger');
	}

	for (const d of plan.downloads || []) {
		const got = await transport.get(d.key);
		if (!got) throw Object.assign(new Error('download missing ' + d.key), {code: 'incomplete'});
		if (await sha256Hex(got.bytes) !== (d.hash || d.key.slice(OBJECT_PREFIX.length))) refuse('ciphertext', 'the ciphertext does not match its address');
		const plain = await open(vdk, OBJECT_AAD, got.bytes);
		verifyCanonicalNote(d.ledger, td.decode(plain), d.sidecar, d.content);
		downloaded.set(d.id, {...fileBody(d.file, plain), ledger: d.ledger, sidecar: d.sidecar, file: d.file, id: d.id, sealed: got.bytes});
		if (store.rememberObject) await store.rememberObject(d.content || await sha256Hex(plain), d.hash, got.bytes);
	}
	await parallelUploads([...(plan.assetUploads || []).map(item => ({...item, media: true})), ...(plan.uploads || [])], async item => {
		const {object, sealed} = await sealUpload(item, vdk, store);
		if (store.rememberObject) await store.rememberObject(item.content, object, sealed);
		await putVerified(transport, objectKey(object), sealed);
		if (item.media) plan.head.assets[item.file].object = object;
		else {
			if (plan.head.notes[item.id]) Object.assign(plan.head.notes[item.id], {object, content: item.content});
			sealedUploads.push(object);
		}
	});

	const files = {};
	for (const [name, rec] of Object.entries(snapshot.files || {})) files[name] = structuredClone(rec);

	const index = structuredClone(snapshot.index || emptyIndex());
	const trashedAt = {};
	const resolvedConflicts = [...(plan.rootConflicts || [])];
	index.sections = plan.head.metadata.sections; index.collapsed = plan.head.metadata.collapsed;

	const moved = (plan.renames || []).map(rename => ({...rename, body: files[rename.file], entry: index.notes[rename.file]}));
	for (const rename of moved) { delete files[rename.file]; delete index.notes[rename.file]; }
	for (const rename of moved) { files[rename.wanted] = rename.body; index.notes[rename.wanted] = rename.entry; }

	for (const w of plan.localWrites || []) {
		if (w.text != null) files[w.file] = {text: w.text, ledger: w.ledger, ...(isCodeFile(w.file) ? {bytes: te.encode(w.text)} : {})};
		if (w.sidecar) {
			if (!index.notes[w.file]) index.notes[w.file] = defaultEntry();
			index.notes[w.file] = {...index.notes[w.file], ...w.sidecar};
		}
	}
	for (const d of plan.downloads || []) {
		const got = downloaded.get(d.id);
		if (!got) continue;
		files[d.file] = {text: got.text, ledger: d.ledger, ...(got.bytes ? {bytes: got.bytes} : {})};
		index.notes[d.file] = {...defaultEntry(), ...(d.sidecar || {}), ...(d.id ? {id: d.id} : {})};
		if (d.conflicts && d.conflicts.length) resolvedConflicts.push(...d.conflicts);
	}
	for (const t of plan.localTrash || []) { delete files[t.file]; delete index.notes[t.file]; }

	for (const m of plan.merges || []) resolvedConflicts.push(...(m.conflicts || []));

	const expectedDownloads = (plan.downloads || []).length;
	if (downloaded.size !== expectedDownloads) throw Object.assign(new Error('download count'), {code: 'incomplete'});
	for (const d of plan.downloads || []) {
		const got = downloaded.get(d.id);
		if (!got) throw Object.assign(new Error('unverified ' + d.file), {code: 'incomplete'});
		if (d.content) {
			const actual = await fileHash(got);
			if (actual !== d.content) throw Object.assign(new Error('content hash ' + d.file), {code: 'incomplete'});
		}
	}



	for (const [id, rec] of Object.entries(plan.head.notes)) {
		if (plan.held.includes(id)) continue;
		const body = files[rec.file];
		if (!body) refuse('incomplete', 'a canonical note is missing its planned body');
		const source = verifyCanonicalNote(rec.ledger, body.text, rec.sidecar, rec.content);
		const device = plan.canonicalContexts[id], mapping = device === null ? plan.assetMappings?.local : plan.assetMappings?.heads[device];
		const context = device === null ? plan.linkContexts.local : plan.linkContexts.heads[device];
		const text = await noteText(rec.file, body.text, value => rewriteKnown(value, mapping, id, rec.conflicts, context));
		let ledger = source.ledger;
		if (text !== source.text) {
			const manifest = {...parseManifest(null, {noteId: id, now: 0}), canonical: ledger};
			ledger = appendCanonical(manifest, {text, metadata: source.metadata, author: {kind: 'system', id: 'notes-sync'},
				operation: 'notes.sync.relocate', now: null, id: 'relocate:' + await sha256Hex(te.encode(JSON.stringify([ledger.sha256, text])))}).ledger;
		}
		files[rec.file] = {text, ledger, ...(isCodeFile(rec.file) ? {bytes: te.encode(text)} : {})};
		rec.ledger = ledger; rec.sidecar.canonicalHistory = ledger.sha256;
		const content = ledger.head.sha256;
		if (content === rec.content) continue;
		const {sealed, object} = await sealUpload({...files[rec.file], content, ancestors: [rec.object]}, vdk, store);
		if (store.rememberObject) await store.rememberObject(content, object, sealed);
		await putVerified(transport, objectKey(object), sealed);
		if (rec.object) plan.head.ancestry[rec.object] = [...new Set([...(plan.head.ancestry[rec.object] || []), ...(rec.parents || [])])];
		rec.parents = [rec.object]; rec.object = object; rec.content = content;
	}

	for (const id of plan.held) {
		const file = Object.keys(index.notes).find(name => index.notes[name].id === id), body = file && files[file];
		if (!body || isCodeFile(file)) continue;
		const source = verifyCanonicalNote(body.ledger, body.text, index.notes[file]), text = rewriteLinks(source.text, plan.linkContexts.local);
		if (text === source.text) continue;
		const ledger = appendCanonical({...parseManifest(null, {noteId: id, now: 0}), canonical: source.ledger}, {text, metadata: source.metadata, author: {kind: 'system', id: 'notes-sync'},
			operation: 'notes.sync.relocate', now: null, id: 'relocate:' + await sha256Hex(te.encode(JSON.stringify([source.ledger.sha256, text])))}).ledger;
		files[file] = {text, ledger};
		index.notes[file] = {...index.notes[file], revision: 'sha256:' + ledger.head.sha256, canonicalHistory: ledger.sha256};
		if (plan.head.held?.[id]) plan.head.held[id] = {...plan.head.held[id], content: await fileHash(files[file]), ledger: ledger.sha256};
	}
	if (plan.head && plan.head.notes) {
		for (const [nid, rec] of Object.entries(plan.head.notes)) {
			if (rec && !plan.held.includes(nid) && rec.file && files[rec.file]) {
				if (!index.notes[rec.file]) index.notes[rec.file] = defaultEntry();
				const revision = 'sha256:' + rec.content;
				index.notes[rec.file] = {...index.notes[rec.file], id: nid, revision, canonicalHistory: rec.ledger.sha256};
				rec.sidecar = {...rec.sidecar, revision};
			}
		}
	}
	const activeConflicts = new Set(), markdown = Object.entries(files).filter(([file]) => !isCodeFile(file)).map(([, value]) => value);
	for (const value of markdown) for (const block of inspectTextConflicts(value.text, {nested: true})) activeConflicts.add(await contentHash(block.block));
	const rebind = conflict => {
		const next = rebound.get(conflict.blockHash);
		return next ? {...conflict, blockHash: next.blockHash, variants: next.variants} : conflict;
	};
	if (resolvedConflicts.length || rebound.size) {
		index.conflicts = uniqueConflicts([...(index.conflicts || []), ...resolvedConflicts].map(rebind), activeConflicts);
	}
	for (const rec of Object.values(plan.head.notes)) if (rec.conflicts) rec.conflicts = uniqueConflicts(rec.conflicts.map(rebind), activeConflicts);
	const checked = Object.entries(files).filter(([file]) => !isCodeFile(file) && !plan.held.includes(index.notes[file]?.id)).map(([, value]) => value);
	for (const value of checked) for (const recording of recordingsOf(value.text)) {
		if (!Object.hasOwn(assets, 'audio/' + recording.name)) refuse('incomplete_asset', 'a note names a recording whose complete bytes are not available; nothing was replaced');
	}
	for (const value of checked) for (const attachment of attachmentsOf(value.text)) {
		if (!Object.hasOwn(assets, 'attachments/' + attachment.name)) refuse('incomplete_asset', 'a note links to a file whose complete bytes are not available; nothing was replaced');
	}
	const forgotten = new Set(Object.values(plan.head.assetTombstones || {}).flatMap(t => [t.file, t.source]));
	for (const [file, value] of Object.entries(files)) if (!isCodeFile(file) && plan.head.notes[index.notes[file].id] && !plan.held.includes(index.notes[file].id)) {
		const id = index.notes[file].id, missing = [...canonicalMedia(value.ledger, id)].filter(mediaFile => !Object.hasOwn(assets, mediaFile));
		const loose = missing.length ? unboundMedia(value.ledger, plan.media?.[id] || value.media || [], mediaNames) : null;
		if (missing.some(mediaFile => !forgotten.has(mediaFile) || loose.has(mediaFile)))
			refuse('incomplete_asset', 'retained canonical history names missing media; no note or history was replaced');
	}
	for (const [file, value] of Object.entries(files)) if (plan.media?.[index.notes[file]?.id]?.length) files[file] = {...value, media: plan.media[index.notes[file].id]};
	if (!plan.returned && snapshot.head && same(headPayload(snapshot.head), headPayload(plan.head)) && same(files, snapshot.files) && same(index, snapshot.index)) {
		if (typeof store.validate === 'function') await store.validate(plan.expected);
		if (typeof store.observe === 'function') {
			const {proof, ...previous} = snapshot.verified || {};
			const verified = same(previous, plan.verified) ? snapshot.verified : await authenticateHeads(plan.verified, snapshot.deviceId, snapshot.head._key, vdk);
			await store.observe([...new Set([...plan.observed, snapshot.head._key])].filter(Boolean), verified);
		}
		if (store.applyPersonal) await store.applyPersonal(personal, snapshot.personal);
		const missing = [];
		if (typeof transport.stat === 'function') {
			const named = [...new Set([...Object.values(snapshot.head.notes || {}), ...Object.values(snapshot.head.assets || {})].map(rec => rec?.object).filter(Boolean))];
			for (let i = named.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [named[i], named[j]] = [named[j], named[i]]; }
			for (const object of named.slice(0, AUDIT_SAMPLE)) if (!await transport.stat(objectKey(object))) missing.push(object);
		}
		return {ok: true, caughtUp: !plan.held?.length && !plan.heldElsewhere?.length && (!snapshot.personal || same((await store.snapshot()).personal?.records || {}, personal.records)), downloaded: 0, uploaded: 0, conflicts: [], head: snapshot.head._key, skipped: plan.skipped, unchanged: true, devices: plan.devices, ...(missing.length ? {missing} : {}), ...heldResult(plan)};
	}
	for (const rec of [...Object.values(plan.head.notes), ...Object.values(plan.head.tombstones)]) if (rec.object)
		plan.head.ancestry[rec.object] = [...new Set([...(plan.head.ancestry[rec.object] || []), ...(rec.parents || [])])];
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
	verified.paths = [...new Set([...(verified.paths || []), ...plan.head.seen, ...(plan.head.previous ? [plan.head.previous] : [])])].sort();
	verified.digests = Object.fromEntries(verified.keys.map(key => [key, parseHeadKey(key).hash]));
	verified.head = await sha256Hex(encodeHead(plan.head));
	const next = {files, assets, index, personal, personalBase: snapshot.personal, renames: plan.renames, deletions: plan.localTrash, assetRemoves: plan.assetRemoves, media: plan.media, trashedAt, head: plan.head, pending, observed: plan.observed, assetAliases: plan.assetAliases, verified: await authenticateHeads(verified, snapshot.deviceId, key, vdk)};
	await store.commit(next, {expected: plan.expected});
	await resumePending(transport, store, {vdk});
	const current = await store.snapshot();
	const caughtUp = (!current.personal || same(current.personal.records, personal.records)) && same(current.files, files) && same(portableIndex(current.index), portableIndex(index)) && same(current.index.notes, index.notes);
	return {ok: true, caughtUp: caughtUp && !plan.held?.length && !plan.heldElsewhere?.length, downloaded: downloaded.size, uploaded: sealedUploads.length, conflicts: resolvedConflicts, head: key, skipped: plan.skipped, devices: plan.devices, ...heldResult(plan)};
}

const heldResult = plan => ({...(plan.held?.length ? {held: plan.held} : {}), ...(plan.heldElsewhere?.length ? {heldElsewhere: plan.heldElsewhere} : {}),
	...(plan.held?.length || plan.heldElsewhere?.length ? {heldNotes: plan.heldNotes} : {})});

export async function putVerified(transport, key, bytes) {
	const hash = await sha256Hex(bytes);
	if (typeof key !== 'string' || key.slice(-64) !== hash) refuse('ciphertext', 'ciphertext does not match its immutable upload address');
	const existing = await transport.get(key);
	if (existing && await sha256Hex(existing.bytes) === hash) return;
	const repair = existing?.etag && transport.capabilities?.supportsConditionalWrite ? {ifMatch: existing.etag} : undefined;
	let ambiguous = false;
	try { await (repair ? transport.put(key, bytes, repair) : transport.put(key, bytes)); }
	catch (error) {
		if (!['timeout', 'network', 'server', ...(existing ? ['precondition'] : [])].includes(error?.code)) throw error;
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

async function authenticateHeads(verified, deviceId, checkpoint, vdk = null) {
	if (!verified) return null;
	const {proof, ...value} = verified;
	const digest = await sha256Hex(te.encode(JSON.stringify(sortObject(value))));
	const aad = 'verified-heads/' + deviceId + '/' + (checkpoint || 'empty');
	if (vdk) return {...value, proof: Array.from(await seal(vdk, aad, te.encode(digest)))};
	if (!Array.isArray(proof) || proof.some(n => !Number.isInteger(n) || n < 0 || n > 255)) refuse('cache', 'the verified head cache has no authentication proof');
	return {value, aad, digest, proof: Uint8Array.from(proof)};
}

export const HEADS_PER_DEVICE = 1;
export const HEAD_RETENTION_GENERATIONS = Infinity;
export const HEAD_RETIREMENT_WINDOW = 64;
export const HEAD_RETENTION_WINDOW = Infinity;
function checkRetentionWindow(window, keep = 2) {
	if (window !== Infinity && (!Number.isSafeInteger(window) || window < keep)) refuse('retention', 'the observed-frontier window must cover the retained generations');
}
export function headRetirementCandidates(keys, deviceId, keep = HEAD_RETENTION_GENERATIONS, heads = null, window = HEAD_RETENTION_WINDOW) {
	if (!DEVICE_RE.test(deviceId) || keep !== Infinity && (!Number.isSafeInteger(keep) || keep < 2)) refuse('retention', 'head retention must keep at least two complete generations');
	checkRetentionWindow(window, keep === Infinity ? 2 : keep);
	keys = [...new Set(keys)];
	const own = keys.filter(key => parseHeadKey(key).device === deviceId)
		.sort((a, b) => parseHeadKey(b).generation - parseHeadKey(a).generation);
	const generations = new Set();
	for (const key of own) { const generation = parseHeadKey(key).generation; if (generations.has(generation)) refuse('device_fork', 'head retirement cannot choose between forked generations'); generations.add(generation); }
	if (keep === Infinity || window === Infinity) return [];
	if (!Array.isArray(heads)) refuse('retention', 'head retirement needs every device’s authenticated newest head');
	const newest = new Map(), namedGenerations = new Map();
	for (const key of keys) {
		const at = parseHeadKey(key), previous = newest.get(at.device);
		const named = at.device + '/' + at.generation;
		if (namedGenerations.has(named) && namedGenerations.get(named) !== key) refuse('device_fork', 'head retirement cannot choose between forked generations');
		namedGenerations.set(named, key);
		if (!previous || at.generation > parseHeadKey(previous).generation) newest.set(at.device, key);
	}
	if (heads.length !== newest.size || new Set(heads.map(head => head.device)).size !== heads.length)
		refuse('retention', 'head retirement needs one newest head for every listed device');
	const protectedKeys = new Set();
	const protectFrom = own.length ? parseHeadKey(own[0]).generation - window : Infinity;
	for (const head of heads) {
		if (head._key !== newest.get(head.device)) refuse('retention', 'head retirement was given a stale frontier');
		const admitted = decodeHead(encodeHead(head));
		if (admitted.generation !== parseHeadKey(head._key).generation) refuse('retention', 'head retirement disagrees with its listing');
		for (const key of [head._key, admitted.previous].filter(Boolean)) protectedKeys.add(key);
		for (const key of admitted.seen) {
			const at = parseHeadKey(key), tip = newest.get(at.device);
			if (!tip || parseHeadKey(tip).generation < at.generation) refuse('retention', 'the listing omits a writer or generation a newest head observed');
			const named = namedGenerations.get(at.device + '/' + at.generation);
			if (named && named !== key) refuse('device_fork', 'an observed frontier names another branch of a listed generation');
			if (parseHeadKey(tip).generation - at.generation < window) protectedKeys.add(key);
		}
	}
	const pinnedGenerations = new Set([...protectedKeys].map(parseHeadKey)
		.filter(at => at.device === deviceId).flatMap(at => [at.generation, at.generation - 1]));
	return own.slice(keep).filter(key => { const generation = parseHeadKey(key).generation; return generation < protectFrom && !pinnedGenerations.has(generation); });
}
export async function retireHeadGenerations(transport, {vdk, deviceId, keys, heads, window, signal} = {}) {
	if (window !== HEAD_RETIREMENT_WINDOW || !DEVICE_RE.test(deviceId) || !Array.isArray(keys) || !Array.isArray(heads)
		|| !transport || !['get', 'list', 'delete'].every(name => typeof transport[name] === 'function')
		|| signal != null && typeof signal.aborted !== 'boolean')
		refuse('retention', 'head retirement needs an explicit reviewed window, complete listing and authenticated frontiers');
	const check = () => { if (signal?.aborted) refuse('cancelled', 'head retirement stopped; no further generation was removed'); };
	check();
	keys = [...new Set(keys)];
	heads = heads.map(head => {
		if (!record(head)) refuse('retention', 'head retirement needs every enrolled device’s newest head');
		return {...decodeHead(encodeHead(head)), _key: head._key};
	});
	const expected = new Set(keys), authenticated = new Map(), pinned = new Set();
	const candidates = headRetirementCandidates(keys, deviceId, window, heads, window);
	if (!heads.some(head => head.device === deviceId)) refuse('retention', 'this device has no authenticated published frontier');
	async function read(key) {
		check();
		if (!expected.has(key)) refuse('retention', 'the complete listing omits an enrolled frontier or its required predecessor');
		if (authenticated.has(key)) return authenticated.get(key);
		const address = parseHeadKey(key), got = await transport.get(key);
		check();
		if (!(got?.bytes instanceof Uint8Array)) refuse('retention', 'an enrolled frontier or its predecessor is missing');
		if (await sha256Hex(got.bytes) !== address.hash) refuse('ciphertext', 'the retirement frontier ciphertext does not match its address');
		const plain = await open(vdk, headAAD(address), got.bytes);
		let head;
		try { head = decodeHead(plain); } finally { plain.fill(0); }
		if (head.device !== address.device || head.generation !== address.generation)
			refuse('retention', 'the authenticated retirement frontier disagrees with its address');
		authenticated.set(key, head);
		return head;
	}
	async function pin(key) {
		const head = await read(key);
		pinned.add(key);
		if (head.previous) { await read(head.previous); pinned.add(head.previous); }
	}
	for (const claimed of heads) {
		const head = await read(claimed._key);
		if (!same(head, decodeHead(encodeHead(claimed)))) refuse('retention', 'a supplied retirement frontier is not its authenticated published head');
		await pin(claimed._key);
		for (const key of head.seen) await pin(key);
	}
	const discovery = await loadHeads(transport, vdk);
	for (const key of discovery.proofKeys) pinned.add(key);
	const planned = candidates.filter(key => !pinned.has(key)).reverse(), retired = [];
	const listingTransport = {list: async (...args) => { check(); const page = await transport.list(...args); check(); return page; }};
	async function confirm() {
		const page = await listEvery(listingTransport, HEAD_PREFIX), found = new Set();
		if (page.prefixes.length) refuse('listing', 'retirement needs a complete, ungrouped heads listing');
		for (const item of page.keys) { parseHeadKey(item?.key); found.add(item.key); }
		if (found.size !== expected.size || [...found].some(key => !expected.has(key)))
			refuse('retention', 'the heads listing changed or still names a retired generation; rediscover before another retirement');
	}
	await confirm();
	for (const key of planned) {
		check();
		await transport.delete(key);
		expected.delete(key);
		await confirm();
		retired.push(key);
	}
	return {window, planned, retired};
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
export async function loadHeads(transport, vdk, {anchors = [], verified = null, deviceId, checkpoint = null, ownHead = null, cache = null, retentionWindow = HEAD_RETENTION_WINDOW, floor = []} = {}) {
	checkRetentionWindow(retentionWindow);
	if (verified) {
		const checked = await authenticateHeads(verified, deviceId, checkpoint);
		if (td.decode(await open(vdk, checked.aad, checked.proof)) !== checked.digest) refuse('cache', 'the verified head frontier changed; no work was replaced');
		verified = checked.value;
	}
	const retained = [...new Set([...(verified?.keys || []), ...anchors, ...(checkpoint ? [checkpoint] : [])])];
	const found = new Set(), bounds = new Map(), seenFrom = new Map();
	for (const key of retained) { const {device, generation} = parseHeadKey(key); seenFrom.set(device, Math.max(seenFrom.get(device) || 0, generation)); }
	if (transport.capabilities?.listsFrom) {
		const {keys: loose, prefixes} = await listEvery(transport, HEAD_PREFIX, {delimiter: '/'}), groups = new Set(prefixes);
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
	if (checkpoint && !found.has(checkpoint)) {
		const held = await transport.get(checkpoint);
		if (!held || await sha256Hex(held.bytes) !== parseHeadKey(checkpoint).hash) refuse('rollback', 'this install’s published checkpoint is missing; no local work was replaced');
		found.add(checkpoint);
	}
	const generations = new Map(), newest = new Map(), certified = new Set(verified?.paths || []);
	function name(key) {
		const at = parseHeadKey(key), slot = at.device + '/' + at.generation;
		if (generations.has(slot) && generations.get(slot) !== key) refuse('device_fork', 'one install identity has two kept branches; restore each under a new install identity before syncing');
		generations.set(slot, key); return at;
	}
	for (const key of [...found, ...retained, ...certified]) name(key);
	for (const key of found) {
		const at = parseHeadKey(key), prior = newest.get(at.device);
		if (!prior || at.generation > parseHeadKey(prior).generation) newest.set(at.device, key);
	}
	const trusted = new Map((verified?.keys || []).map(key => [parseHeadKey(key).device, key]));
	for (const key of certified) {
		const at = parseHeadKey(key), tip = trusted.get(at.device);
		if (!tip || at.generation > parseHeadKey(tip).generation) refuse('cache', 'the verified head frontier changed; no work was replaced');
	}
	const expired = key => {
		const at = parseHeadKey(key), tip = newest.get(at.device);
		return retentionWindow !== Infinity && tip && parseHeadKey(tip).generation - at.generation >= retentionWindow;
	};
	const belowRange = key => { const at = parseHeadKey(key); return at.generation < (bounds.get(at.device) || 0); };
	const absent = anchors.filter(key => !found.has(key) && !belowRange(key));
	for (const key of retained) if (!found.has(key) && !belowRange(key) && !expired(key))
		refuse('incomplete', 'a previously observed generation is missing; no local note was replaced');
	const loaded = new Map(), opened = [], reached = new Set(), cursors = new Map(newest);
	const full = new Set([...newest.values(), ...(!absent.length ? anchors : [])]);
	function reach(key) {
		reached.add(key);
		const at = parseHeadKey(key);
		if (trusted.get(at.device) === key) for (const old of certified) if (parseHeadKey(old).device === at.device) reached.add(old);
	}
	async function read(key) {
		if (loaded.has(key)) return loaded.get(key);
		const address = name(key);
		let head;
		if (key === checkpoint && ownHead && verified?.head) {
			head = decodeHead(encodeHead(ownHead));
			if (await sha256Hex(encodeHead(head)) !== verified.head) refuse('cache', 'the local checkpoint differs from its authenticated record; no work was replaced');
		} else {
			let bytes = cache ? await cache.get(key) : null, fetched = false;
			if (!bytes) {
				const got = await transport.get(key);
				if (!got) refuse('incomplete', 'a listed or previously observed generation is missing; no local note was replaced');
				bytes = got.bytes; fetched = true;
			}
			if (await sha256Hex(bytes) !== address.hash) refuse('ciphertext', 'the head ciphertext does not match its address');
			const plain = await open(vdk, headAAD(address), bytes);
			try { head = decodeHead(plain); }
			catch (error) { if (error?.code === 'corrupt') refuse('newer', 'a newer Rapier wrote a head in this vault: update Rapier to sync this folder. nothing was replaced'); throw error; }
			finally { plain.fill(0); }
			if (key === checkpoint && ownHead && !same(head, decodeHead(encodeHead(ownHead)))) refuse('cache', 'the local checkpoint differs from its authenticated published bytes');
			if (fetched && cache) await cache.put(key, bytes);
		}
		if (head.device !== address.device || head.generation !== address.generation) refuse('corrupt', 'the head disagrees with its address');
		if (head.previous) name(head.previous);
		if (full.has(key)) { head._key = key; head._parents = head.ancestry || {}; }
		else head = {device: head.device, generation: head.generation, previous: head.previous, seen: head.seen, _key: key};
		loaded.set(key, head); opened.push(head); return head;
	}
	const tips = [];
	for (const key of newest.values()) { tips.push(await read(key)); reach(key); }
	const latestTips = new Map(tips.map(head => [head.device, head]));
	for (const key of floor) {
		const at = parseHeadKey(key), tip = latestTips.get(at.device);
		if (at.device === deviceId) continue;
		if (!tip || tip.generation < at.generation || tip.generation === at.generation && tip._key !== key) refuse('rollback', 'the vault is older than this device has already seen; nothing was imported');
	}
	const bases = [];
	for (const tip of tips) {
		const prior = anchors.find(key => parseHeadKey(key).device === tip.device);
		if (!absent.length && prior && prior !== tip._key) bases.push([tip, '_previousHead', prior]);
		if (!absent.length && tip.device !== deviceId) {
			const seen = tip.seen.find(key => parseHeadKey(key).device === deviceId);
			if (seen && (!prior || seen === checkpoint || prior !== tip._key) && (found.has(seen) || !expired(seen))) bases.push([tip, '_seenHead', seen]);
		}
	}
	for (const [, , key] of bases) full.add(key);
	function observation(key) {
		const at = name(key), latest = newest.get(at.device);
		if (!latest || parseHeadKey(latest).generation < at.generation) refuse('incomplete', 'a head observes a generation missing from this discovery; no local work was replaced');
		if (!found.has(key) && !belowRange(key) && !expired(key)) refuse('incomplete', 'a previously observed generation is missing; no local note was replaced');
		return at;
	}
	async function prove(key) {
		const target = observation(key);
		if (reached.has(key)) return;
		let cursor = cursors.get(target.device);
		while (parseHeadKey(cursor).generation > target.generation) {
			if (!found.has(cursor) && !belowRange(cursor)) refuse('rollback', 'the restored copy has no checkpoint proving these changes; keep both copies and reconnect with a fresh install identity');
			const head = await read(cursor);
			cursor = head.previous; name(cursor); reach(cursor); cursors.set(target.device, cursor);
			if (reached.has(key)) return;
		}
		if (cursor !== key) refuse('device_fork', 'the newest head names a different kept predecessor');
	}
	for (const key of retained) await prove(key);
	for (const tip of tips) if (tip.previous && !seenFrom.has(tip.device)) {
		observation(tip.previous); await prove(tip.previous); await read(tip.previous);
	}
	let checked = 0;
	async function observations() {
		while (checked < opened.length) for (const key of opened[checked++].seen) await prove(key);
	}
	await observations();
	tips.retiredFrontiers = absent;
	for (const [tip, field, key] of bases) tip[field] = await read(key);
	await observations();
	const paths = [...new Set(tips.flatMap(head => [...head.seen, ...(head.previous ? [head.previous] : [])]))].sort();
	for (const key of paths) await prove(key);
	await observations();
	tips.verified = {keys: tips.map(head => head._key).sort(), paths, digests: Object.fromEntries(tips.map(head => [head._key, parseHeadKey(head._key).hash]))};
	tips.proofKeys = [...new Set([...loaded.keys(), ...opened.flatMap(head => head.seen)])];
	const own = tips.find(head => head.device === deviceId);
	if (own) tips.verified.head = await sha256Hex(encodeHead(own));
	return tips.sort((a, b) => a.device.localeCompare(b.device));
}

export async function synchronize(transport, store, {vdk, retentionWindow = HEAD_RETENTION_WINDOW, floor = []} = {}) {
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			await store.beginRun?.(transport.capabilities);
			await resumePending(transport, store, {vdk});
			const local = await store.snapshot();
			const heads = await loadHeads(transport, vdk, {anchors: local.observed || [], verified: local.verified, deviceId: local.deviceId,
				checkpoint: local.head?._key || null, ownHead: local.head || null, cache: store.heads || null, retentionWindow, floor});
			const result = await execute(await plan(local, heads, transport.capabilities), transport, store, {vdk});
			return {...result, rebases: attempt, ...(heads.retiredFrontiers.length ? {retiredFrontiers: heads.retiredFrontiers} : {})};
		} catch (error) {
			if (error?.code !== 'changed' || attempt === 3) throw error;
		}
	}
}

export function createOwnerSyncStore({folder, deviceId, personal = null, label = null, assertActive = () => {}}) {
	if (!folder?.owner || !DEVICE_RE.test(deviceId) || typeof assertActive !== 'function') refuse('store', 'an admitted folder owner and install identity are required');
	label = headLabel(label);
	const objects = new Map(), byContent = new Map(), media = new Map();
	let loaded = false, limit = Infinity, folderIdentity = null;
	const activeFolder = index => {
		if (folderIdentity && index.folderDeviceId !== folderIdentity) refuse('changed', 'this folder left or restored its vault; join it again before syncing.');
		folderIdentity ||= index.folderDeviceId;
	};
	const spoolPattern = /^\.rapier-sync-object-([a-f0-9]{64})-([a-f0-9]{64})\.tmp$/;
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
	async function checkpoint(lease) {
		const current = await lease.read(); assertActive(); activeFolder(current.index);
		const {state} = await readSyncStateBytes(folder.store); assertActive();
		if (state.deviceId && state.deviceId !== deviceId) refuse('identity', 'this folder sync state belongs to a different install identity');
		return {deviceId, head: state.head || null, pending: state.pending || null};
	}
	async function capture(lease, validateMedia = false) {
		const listing = await lease.read();
		activeFolder(listing.index);
		const current = await lease.read({bodies: listing.files.filter(isNoteFile)});
		const files = {}, assets = {}, historyDigests = new Map();
		const indexDigest = await storedFileDigest(folder.store, NOTES_INDEX_FILE);
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
			if (validateMedia && asset.content) await validateCapturedAsset(folder.store, file, asset);
			assets[file] = asset;
		}
		for (const [name, bytes] of current.bodies) {
			const entry = current.index.notes[name], path = 'history/' + manifestName(entry.id), history = await folder.store.read(path);
			const body = fileBody(name, bytes), proved = parseCanonical(history, {noteId: entry.id, now: Date.now(), text: td.decode(bytes)});
			verifyCanonicalBinding(proved, entry, await sha256Hex(bytes));
			files[name] = {...body, ledger: proved.ledger, ...(proved.manifest.media ? {media: proved.manifest.media} : {})}; historyDigests.set(path, await sha256Hex(history));
		}
		for (const [file, value] of Object.entries(files)) if (await storedFileDigest(folder.store, file) !== await fileHash(value)) refuse('changed', 'source changed while canonical history was captured');
		for (const [path, digest] of historyDigests) if (await storedFileDigest(folder.store, path) !== digest) refuse('changed', 'canonical history changed while source was captured');
		if (await storedFileDigest(folder.store, NOTES_INDEX_FILE) !== indexDigest) refuse('changed', 'the note identity changed while canonical history was captured');
		await loadObjects();
		if (state.deviceId && state.deviceId !== deviceId) refuse('identity', 'this folder sync state belongs to a different install identity');
		const writer = typeof personal?.writer === 'function' ? await personal.writer() : null;
		return {deviceId, files, assets, personal: personal ? await personal.snapshot() : undefined, writer: typeof writer === 'string' && WRITER_RE.test(writer) ? writer : null, label,
			assetAliases: state.assetAliases || {}, index: current.index,
			verified: state.verified || null, head: state.head || null, pending: state.pending || null, observed: state.observed || [],
			byContent: Object.fromEntries([...byContent].map(([content, hashes]) => [content, hashes.at(-1)]))};
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
						mode: 'confirmed', deviceId: folder.deviceId, commitIndex: lease.commitIndex, sync: true});
					if (result.revived.length || result.missing.length || result.deferred.length) refuse('changed', 'a note changed before deletion and was kept; sync again to keep both decisions');
					fresh = await capture(lease);
				}
				const writes = new Map(), removes = [];
				const index = structuredClone(next.index);
				index.folderGeneration = fresh.index.folderGeneration;
				index.noteCounters = fresh.index.noteCounters;
				if (fresh.index.imports) index.imports = structuredClone(fresh.index.imports); else delete index.imports;
				index.tombstones = fresh.index.tombstones;
				index.assetTombstones = {...fresh.index.assetTombstones, ...next.head.assetTombstones};
				index.assetRevivals = next.head.assetRevivals;
				if (fresh.index.deletions) index.deletions = fresh.index.deletions; else delete index.deletions;
				const {writes: histories, canonical, byId: freshById} = await prepareCanonicalAdmission({
					store: folder.store, previous: fresh, index, files: next.files, media: next.media,
				});

				for (const [file, value] of Object.entries(next.files)) {
					if (!safeFile(file)) refuse('name', 'sync may write only a safe note filename');
					if (sameFile(fresh.files[file], value) && fresh.index.notes[file]?.id === index.notes[file]?.id && !writes.has(file)) continue;
					const planned = writes.get(file), source = freshById.get(index.notes[file].id);
					const caseSource = source && source !== file && !fresh.files[file] && source.normalize('NFC').toLowerCase() === file.normalize('NFC').toLowerCase() ? source : null;
					writes.set(file, {...planned, file, bytes: fileBytes(value), ...(caseSource ? {caseSource, createOnly: true} : fresh.files[file] ? {expectedDigest: await fileHash(fresh.files[file])} : {createOnly: true})});
				}
				for (const [file, value] of Object.entries(fresh.files)) if (!Object.hasOwn(next.files, file)) {
					const id = fresh.index.notes[file].id, target = Object.keys(index.notes).find(name => index.notes[name].id === id);
					if (!target || !next.renames?.some(row => row.id === id && row.file === file && row.wanted === target)) refuse('keep', 'sync has no owner proof to remove a kept local file');
					removes.push({file, expectedDigest: await fileHash(value), requires: target});
				}
				for (const [file, bytes] of Object.entries(next.assets || {})) {
					if (!safeAsset(file)) refuse('name', 'sync media must be complete bytes in the owner’s media directories');
					const removed = fresh.assets[file] && next.assetRemoves?.find(row => row.file === file);
					if (removed) writes.set(file, {file, bytes: await assetBytes(bytes), expectedDigest: removed.content});
					else if (fresh.assets[file]) {
						if (fresh.assets[file] !== bytes && !bytes.skipped && await assetDigest(fresh.assets[file]) !== await assetDigest(bytes)) refuse('asset_conflict', 'sync cannot overwrite kept media');
					} else writes.set(file, {file, bytes: await assetBytes(bytes), createOnly: true});
				}
				for (const row of next.assetRemoves || []) if (fresh.assets[row.file] && !writes.has(row.file)) removes.push({file: row.file, expectedDigest: row.content});
				const previous = await readSyncStateBytes(folder.store);
				const state = {...previous.state, deviceId, assetAliases: next.assetAliases, verified: next.verified, head: next.head, pending: next.pending,
					observed: [...(next.observed || []).filter(key => parseHeadKey(key).device !== deviceId), next.pending.key]};
				if (personal && next.personal) await personal.commit(next.personal, next.personalBase, assertActive);
				writes.set(SYNC_STATE_FILE, await syncStateWrite(state, previous.bytes));
				const result = await lease.transact(({index: admittedIndex}) => {
					assertActive();
					if (!same(admittedIndex, fresh.index)) refuse('changed', 'the folder metadata changed before sync admission; its newer choices were kept');
					return {kind: [...writes.values()].some(row => row.caseSource) ? 'rename' : 'sync', index, writes: [...histories.values(), ...writes.values()], removes, ...(canonical.length ? {canonical} : {})};
				}, {bodies: [], admissionGuard: assertActive});
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
