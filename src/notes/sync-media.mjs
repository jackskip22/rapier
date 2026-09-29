// SPDX-License-Identifier: AGPL-3.0-only
// Media stay immutable. A name collision keeps each byte sequence and rewrites only the
// originating branch's links; old local names remain usable by retained note history.
import {recordingsOf, rewriteRecordingNames} from './audio.mjs';
import {attachmentsOf, rewriteAttachmentNames} from './attachments.mjs';
import {mapTextConflictVariants} from './merge.mjs';

import {assetDigest, assetSize, SEAL_OVERHEAD_BYTES} from './sync-assets.mjs';
const te = new TextEncoder();
const fold = name => name.normalize('NFC').toLowerCase();
const safe = name => typeof name === 'string' && /^(?:audio|attachments)\/[^/\\\x00-\x1f\x7f]+$/.test(name) && !name.split('/')[1].startsWith('.');
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };

function collisionName(source, content, attempt = 0) {
	const slash = source.indexOf('/'), dir = source.slice(0, slash + 1), leaf = source.slice(slash + 1);
	const dot = leaf.lastIndexOf('.'), ext = dot > 0 && leaf.length - dot <= 24 ? leaf.slice(dot) : '';
	let stem = ext ? leaf.slice(0, -ext.length) : leaf;
	const suffix = ' (' + content + ')' + (attempt ? ' ' + attempt : '') + ext;
	while (te.encode(stem + suffix).length > 240) stem = Array.from(stem).slice(0, -1).join('');
	return dir + (stem.replace(/[ .]+$/, '') || 'file') + suffix;
}

function keptAttempt(file, source, content) {
	const marker = '(' + content + ')', at = file.lastIndexOf(marker);
	if (at < 0) return 0;
	const suffix = file.slice(at + marker.length), match = /^ ([1-9][0-9]*)/.exec(suffix);
	const attempt = match ? Number(match[1]) : 0;
	return Number.isSafeInteger(attempt) && collisionName(source, content, attempt) === file ? attempt : 0;
}

export async function planSyncMedia(local, heads, capabilities = {}) {
	const skipped = [], limit = capabilities.maxSingleUploadBytes ?? Infinity;
	const rows = [], groups = new Map(), mappings = {local: {}, heads: {}}, aliases = {}, copies = [], removes = [], conflicts = [];
	const tombstones = {};
	for (const source of [...heads.map(h => h.assetTombstones || {}), local.index?.assetTombstones || {}]) for (const [id, row] of Object.entries(source)) {
		const prior = tombstones[id];
		if (prior && ['file', 'source', 'content', 'device', 'at'].some(key => prior[key] !== row[key])) fail('corrupt', 'a media deletion operation has two different proofs');
		tombstones[id] = row;
	}
	// Restoration acknowledges a particular deletion, not a pathname forever. A subsequent
	// explicit delete has a new operation identity and remains effective on every device.
	const revived = new Set([...heads.flatMap(h => h.assetRevivals || []), ...(local.head?.assetRevivals || []), ...(local.index?.assetRevivals || [])]);
	const ourHead = local.head || heads.find(head => head.device === local.deviceId), localRows = [];
	for (const [file, bytes] of Object.entries(local.assets || {})) {
		if (!safe(file)) fail('bytes', 'media must be exact bytes in its sibling folder');
		if (bytes?.skipped || assetSize(bytes) + SEAL_OVERHEAD_BYTES > limit) {
			const known = bytes.content && heads.some(head => Object.values(head.assets || {}).some(row => row.content === bytes.content));
			const deleted = bytes.content && Object.values(tombstones).some(row => row.content === bytes.content && (row.file === file || row.source === file));
			if (!known && !deleted) { skipped.push(file); continue; }
		}
		const content = await assetDigest(bytes), alias = local.assetAliases?.[file], prior = ourHead?.assets?.[file];
		const source = alias?.content === content && safe(alias.source) ? alias.source : prior?.source || file;
		localRows.push({file, source: fold(source), content, bytes, device: null});
	}
	const protectedFiles = new Set();
	for (const [file, value] of Object.entries(local.files || {})) {
		const text = typeof value === 'string' ? value : value.text, id = local.index?.notes?.[file]?.id;
		if (ourHead?.notes?.[id]?.content === await assetDigest(te.encode(text))) continue;
		for (const row of recordingsOf(text)) protectedFiles.add('audio/' + row.name);
		for (const row of attachmentsOf(text)) protectedFiles.add('attachments/' + row.name);
	}
	for (const t of Object.values(tombstones)) {
		if (revived.has(t.opId) || t.device === local.deviceId) continue;
		// A new local reference protects precisely its bytes, including collision aliases.
		// Persist this acknowledgement in the sealed head: a later unchanged sync must not
		// remove a file that the preceding merge just kept for the person's new work.
		const changed = localRows.find(row => row.source === fold(t.source) && row.content === t.content && protectedFiles.has(row.file));
		if (changed) { revived.add(t.opId); conflicts.push({kind: 'media-delete-edit', path: ['assets', changed.file], opId: t.opId}); }
	}
	const deletions = Object.values(tombstones).filter(t => !revived.has(t.opId));
	const deleted = (source, content) => deletions.some(t => fold(t.source) === fold(source) && t.content === content);
	for (const head of heads) {
		mappings.heads[head.device] = {};
		for (const [file, rec] of Object.entries(head.assets || {})) {
			if (!safe(file) || !safe(rec.source)) fail('corrupt', 'media needs its original sibling path');
			if (deleted(rec.source, rec.content)) continue;
			if (local.assets?.[file]?.skipped && local.assets[file].content !== rec.content) continue;
			rows.push({file, source: fold(rec.source), content: rec.content, object: rec.object, record: rec, device: head.device});
		}
	}
	for (const row of localRows) {
		if (deleted(row.source, row.content)) { removes.push({file: row.file, content: row.content}); continue; }
		rows.push(row);
	}
	for (const row of rows) {
		row.identity = row.source + '\0' + row.content;
		if (!groups.has(row.source)) groups.set(row.source, new Map());
		const versions = groups.get(row.source);
		if (!versions.has(row.content)) versions.set(row.content, []);
		versions.get(row.content).push(row);
	}
	// Reserve actual names before generating any. An authored file may itself happen to have
	// the digest suffix this planner would otherwise choose for another recording or file.
	const occupied = new Map();
	for (const row of rows) {
		const key = fold(row.file);
		if (!occupied.has(key)) occupied.set(key, new Set());
		occupied.get(key).add(row.identity);
	}
	const claimed = new Map(), uploads = [], downloads = [], output = {};
	for (const source of [...groups.keys()].sort()) {
		const versions = groups.get(source);
		for (const content of [...versions.keys()].sort()) {
			const members = versions.get(content), identity = members[0].identity;
			const allowed = file => (!claimed.has(fold(file)) || claimed.get(fold(file)) === identity) &&
				(!occupied.has(fold(file)) || [...occupied.get(fold(file))].every(id => id === identity));
			const previouslyRenamed = members.some(row => fold(row.file) !== source);
			const spellingCollision = new Set(members.map(row => row.file)).size > 1;
			let file = members.map(row => row.file).filter(name => fold(name) === source).sort()[0] || source;
			if (versions.size > 1 || previouslyRenamed || spellingCollision || !allowed(file)) {
				// Once an authored name has displaced a generated one, keep that allocation.
				// Otherwise devices lacking the old local alias would move it back every sync.
				let attempt = 0;
				for (const row of members) attempt = Math.max(attempt, keptAttempt(row.file, source, content));
				do { file = collisionName(source, content, attempt++); } while (!allowed(file));
			}
			claimed.set(fold(file), identity);
			const known = members.filter(row => row.object).sort((a, b) => a.object < b.object ? -1 : a.object > b.object ? 1 : 0)[0];
			const localMember = members.find(row => row.bytes);
			output[file] = {object: known?.object || null, content, parents: [], source};
			if (!known) {
				if (!localMember) fail('incomplete_asset', 'a kept media version has no complete bytes');
				uploads.push({file, bytes: localMember.bytes, content, source});
			}
			if (!Object.hasOwn(local.assets || {}, file)) {
				if (localMember) copies.push({file, bytes: localMember.bytes});
				else downloads.push({file, ...output[file]});
			} else if (await assetDigest(local.assets[file]) !== content) fail('asset_conflict', 'a new media name would overwrite kept bytes');
			for (const member of members) {
				(member.device === null ? mappings.local : mappings.heads[member.device])[member.file] = file;
				if (member.device === null && member.file !== file) aliases[member.file] = {content, source};
			}
		}
	}
	return {uploads, downloads, output, aliases, mappings, copies, skipped, removes, tombstones, assetRevivals: [...revived].sort(), conflicts};
}

export function rewriteSyncMedia(text, mapping = {}) {
	const audio = new Map(), attachments = new Map();
	for (const [from, to] of Object.entries(mapping)) {
		if (from === to) continue;
		if (!safe(from) || !safe(to) || from.slice(0, from.indexOf('/')) !== to.slice(0, to.indexOf('/'))) fail('name', 'a media link must stay in its sibling folder');
		const table = from.startsWith('audio/') ? audio : attachments;
		table.set(from.slice(from.indexOf('/') + 1), to.slice(to.indexOf('/') + 1));
	}
	if (!audio.size && !attachments.size) return text;
	const rewrite = source => rewriteAttachmentNames(rewriteRecordingNames(source, audio), attachments);
	// The merge owner admits only exact envelopes it knows how to reconstruct. Ordinary
	// fenced examples, malformed markers and arbitrary comments retain their literal bytes.
	return rewrite(mapTextConflictVariants(text, source => rewriteSyncMedia(source, mapping)));
}
