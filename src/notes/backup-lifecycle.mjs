// SPDX-License-Identifier: AGPL-3.0-only
import {sha256State} from './integrity.mjs';
import {check} from './backup-folder.mjs';
import {ZIP_READ_MAX_BYTES, ZIP_WRITE_METADATA_BYTES} from './zip.mjs';
export const BACKUP_STAGE_MAX_BYTES = ZIP_WRITE_METADATA_BYTES;

export function backupStageRecord(value) {
	if (value?.sequence === true) return backupSequenceRecord(value);
	if (!value || typeof value.name !== 'string' || !/^[^/\\\0]+\.zip$/i.test(value.name) || value.name.length > 255 || !value.name.isWellFormed()
		|| !Number.isSafeInteger(value.bytes) || value.bytes < 22 || !Number.isSafeInteger(value.files) || value.files < 1 || value.files > 65534
		|| typeof value.stamp !== 'string' || !Number.isFinite(Date.parse(value.stamp)) || !/^[0-9a-f]{64}$/.test(value.digest)) throw new Error('the private backup completion record is invalid; staging is retained, not exported');
	const record = {name:value.name, bytes:value.bytes, files:value.files, stamp:value.stamp, digest:value.digest};
	if (value.parts !== undefined) throw new Error('the private backup completion record is invalid; staging is retained, not exported');
	return record;
}
// The private cursor describes one immutable declaration, not retained copies of sent parts.
// Only pending has staged bytes. A saved accepted cursor precedes deletion, so a crash may
// leave a removable sent file but can never skip an unaccepted destination.
function backupSequenceRecord(value) {
	const fail = () => { throw new Error('the private backup sequence record is invalid; staging is retained, not exported'); };
	const {name, stamp, plan, options, sent, pending} = value;
	if (typeof name !== 'string' || !/^[^/\\\0]+\.zip$/i.test(name) || name.length > 255 || !name.isWellFormed() || typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp))
		|| !plan || !Array.isArray(plan.parts) || !plan.parts.length || plan.parts.length > 65533 || !Number.isSafeInteger(plan.maxBytes) || plan.maxBytes < 22 || plan.maxBytes > ZIP_READ_MAX_BYTES
		|| !Array.isArray(plan.manifest?.files) || !plan.manifest.files.length || plan.manifest.files.length > 65533 || !Array.isArray(plan.omitted)
		|| !options || options.stamp !== Date.parse(stamp) || plan.manifest.stamp !== options.stamp || plan.manifest.appVersion !== options.appVersion || typeof options.appVersion !== 'string' || typeof options.comment !== 'string'
		|| !Array.isArray(sent) || sent.length > plan.parts.length || sent.some(row => !['confirmed','dispatched'].includes(row?.status) || typeof row.name !== 'string')) fail();
	const names = new Set();
	for (const row of plan.manifest.files) {
		if (typeof row?.name !== 'string' || !row.name || /[\\\0]/.test(row.name) || row.name.split('/').some(p => !p || p === '.' || p === '..') || names.has(row.name)
			|| !Number.isSafeInteger(row.bytes) || row.bytes < 0 || !/^[0-9a-f]{64}$/.test(row.sha256)) fail();
		names.add(row.name);
	}
	if (!names.has('notes.json')) fail();
	const assigned = new Set();
	for (let i = 0; i < plan.parts.length; i++) {
		const part = plan.parts[i];
		if (part?.number !== i + 1 || !Number.isSafeInteger(part.bytes) || part.bytes < 22 || part.bytes > plan.maxBytes || !Array.isArray(part.names) || !part.names.includes('notes.json') || new Set(part.names).size !== part.names.length || part.files !== part.names.length + 1) fail();
		for (const path of part.names) { if (!names.has(path) || path !== 'notes.json' && assigned.has(path)) fail(); assigned.add(path); }
	}
	if (assigned.size !== names.size) fail();
	if (plan.parts.length > 1 && (!/^[0-9a-f]{64}$/.test(plan.manifest.set?.id) || plan.manifest.set.count !== plan.parts.length)) fail();
	if (plan.parts.length > 1) {
		if (!Array.isArray(plan.manifest.set.parts) || plan.manifest.set.parts.length !== plan.parts.length) fail();
		for (let i = 0; i < plan.parts.length; i++) {
			const local = plan.manifest.set.parts[i], paths = new Set(plan.parts[i].names), expected = plan.manifest.files.filter(row => paths.has(row.name));
			if (local?.number !== i + 1 || JSON.stringify(local.files) !== JSON.stringify(expected)) fail();
		}
	} else if (plan.manifest.set !== undefined) fail();
	if (JSON.stringify(plan.manifest.omitted || []) !== JSON.stringify(plan.omitted)) fail();
	if (pending != null) {
		if (pending.sequence !== undefined || pending.parts !== undefined) fail();
		if (pending.number !== sent.length + 1 || pending.number > plan.parts.length) fail();
		const checked = backupStageRecord(pending), expectedName = plan.parts.length === 1 ? name : name.replace(/\.zip$/i, '') + ' part ' + pending.number + ' of ' + plan.parts.length + '.zip';
		if (checked.parts || checked.sequence || checked.name !== expectedName || checked.bytes !== plan.parts[pending.number - 1].bytes || checked.stamp !== stamp || checked.files !== plan.parts[pending.number - 1].files) fail();
	}
	return {sequence:true, name, stamp, files:plan.manifest.files.length, bytes:plan.parts.reduce((n, p) => n + p.bytes, 0), setId:plan.manifest.set?.id || null,
		omitted:plan.omitted, plan, options, sent:sent.map(row => ({status:row.status, name:row.name, ...(row.route ? {route:row.route} : {})})), pending:pending == null ? null : {...backupStageRecord(pending), number:pending.number}};
}

// OPFS Files are snapshots of a pathname, not independent byte custody: unlinking can make
// them unreadable even through new File([file]). Copy bounded slices into browser-owned Blobs
// before releasing the stage; neither the returned File nor its URL refers back to OPFS.
export async function detachBackupFile(file, record, {onProgress, signal} = {}) {
	const chunks = [], hash = sha256State(), step = 4 * 1024 * 1024;
	if (file.size !== record.bytes) throw new Error('the private backup size changed before export');
	for (let at = 0; at < file.size; at += step) {
		check(signal);
		const bytes = new Uint8Array(await file.slice(at, Math.min(file.size, at + step)).arrayBuffer());
		if (bytes.length !== Math.min(step, file.size - at)) throw new Error('the private backup could not be copied for export');
		hash.update(bytes); chunks.push(new Blob([bytes]));
		onProgress?.({phase:'Preparing download', bytes:at + bytes.length, totalBytes:file.size});
	}
	if (hash.finish() !== record.digest) throw new Error('the private backup bytes changed before export');
	return new File(chunks, record.name, {type:'application/zip'});
}

export async function verifyBackupFile(file, {bytes, digest}, {onProgress} = {}) {
	if (!Number.isSafeInteger(bytes) || bytes < 0 || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new TypeError('backup verification needs an exact byte count and SHA-256');
	if (!file || file.size !== bytes) throw new Error('the private backup size no longer matches its completion record');
	const hash = sha256State(), step = 4 * 1024 * 1024;
	onProgress?.({phase: 'Verifying backup', bytes: 0, totalBytes: bytes});
	for (let at = 0; at < bytes; at += step) {
		const part = new Uint8Array(await file.slice(at, at + step).arrayBuffer());
		if (part.length !== Math.min(step, bytes - at)) throw new Error('the private backup could not be read back completely');
		hash.update(part);
		onProgress?.({phase: 'Verifying backup', bytes: Math.min(bytes, at + step), totalBytes: bytes});
	}
	if (hash.finish() !== digest) throw new Error('the private backup bytes no longer match its completion record');
	return file;
}
export function retainedBackupSink(target, value) {
	const record = backupStageRecord(value); let discarded = false, busy = false;
	if (typeof target?.file !== 'function' || typeof target?.remove !== 'function') throw new TypeError('retained backup needs file and remove capabilities');
	const run = async job => {
		if (discarded || busy) throw new Error('retained backup is not available');
		busy = true; try { return await job(); } finally { busy = false; }
	};
	return {
		get state() { return discarded ? 'discarded' : 'sealed'; },
		get bytes() { return record.bytes; }, get digest() { return record.digest; },
		file: ({onProgress} = {}) => run(async () => verifyBackupFile(await target.file(), record, {onProgress})),
		discard: () => run(async () => { await target.remove(); discarded = true; })
	};
}

// One origin owns staging at a time; a clock lease could delete a suspended tab's live attempt.
export function acquireBackupLease(request) {
	if (typeof request !== 'function') throw new TypeError('backup staging needs an exclusive lock owner');
	let granted, refused;
	const acquired = new Promise((resolve, reject) => { granted = resolve; refused = reject; });
	const pending = Promise.resolve().then(() => request(lock => {
		if (!lock) throw new Error('Another Rapier window is using backup staging. Its work is unchanged.');
		return new Promise(done => { granted(() => { done(); return pending; }); });
	}));
	pending.catch(refused);
	return acquired;
}
