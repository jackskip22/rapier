// SPDX-License-Identifier: AGPL-3.0-only
import {sha256State, storedFileDigest} from './integrity.mjs';
const HASH = /^[a-f0-9]{64}$/;
const fail = message => { throw Object.assign(new Error(message), {code: 'changed'}); };
export const SEAL_OVERHEAD_BYTES = 29;
export function assetSize(value) { return value instanceof Uint8Array ? value.length : value?.size; }
export async function assetDigest(value) {
	if (value instanceof Uint8Array) {
		const hash = sha256State(); hash.update(value); return hash.finish();
	}
	if (!value || !HASH.test(value.content) || !Number.isSafeInteger(value.size) || value.size < 0) fail('The media snapshot has no exact digest.');
	return value.content;
}
export async function assetBytes(value) {
	if (value instanceof Uint8Array) return value;
	if (!(value?.blob instanceof Blob) || value.blob.size !== value.size) fail('The media snapshot has no complete bytes.');
	const bytes = new Uint8Array(await value.blob.arrayBuffer());
	if (bytes.length !== value.size) fail('The media snapshot changed before sealing.');
	return bytes;
}
// One pass through the source, bounded hash workspace, Blob parts outside JS number arrays.
// Complete-object materialization waits for the shared upload queue's byte reservation.
export async function captureAsset(store, file, limit, {digestSkipped = false} = {}) {
	const stat = typeof store.stat === 'function' ? await store.stat(file) : null;
	const skipped = stat && stat.size + SEAL_OVERHEAD_BYTES > limit;
	if (skipped && !digestSkipped) return {size: stat.size, skipped: true, stamp: stat};
	const hash = sha256State(), parts = []; let size = 0, opened;
	if (typeof store.readChunks === 'function') {
		for await (const bytes of store.readChunks(file, {onOpen: value => { opened = value; }})) {
			if (!(bytes instanceof Uint8Array)) fail('The media reader returned incomplete bytes.');
			size += bytes.length; hash.update(bytes); if (!skipped) parts.push(new Blob([bytes]));
		}
		if (!opened || opened.size !== size) fail('The media changed while taking the snapshot.');
	} else {
		const bytes = await store.read(file);
		if (!(bytes instanceof Uint8Array)) fail('The media listing changed while taking the snapshot.');
		size = bytes.length; hash.update(bytes); if (!skipped) parts.push(new Blob([bytes]));
	}
	const content = hash.finish();
	if (stat && stat.size !== size || HASH.test(stat?.sha256) && stat.sha256 !== content || HASH.test(opened?.sha256) && opened.sha256 !== content)
		fail('The media changed while taking the snapshot.');
	return {content, size, ...(skipped ? {} : {blob: new Blob(parts)}), stamp: stat || opened || null,
		...(size + SEAL_OVERHEAD_BYTES > limit ? {skipped: true} : {})};
}

// sha256 is an explicit byte-store proof, never an ETag or a guessed timestamp.
// The IndexedDB chunk writer can supply its verified immutable descriptor's digest.
// Neither a different old publication nor matching edge samples proves that a source
// stayed unchanged AFTER capture. Without exact current-source evidence, stream it again.
export async function validateCapturedAsset(store, file, asset) {
	const stat = typeof store.stat === 'function' ? await store.stat(file) : undefined;
	if (stat === null || stat && stat.size !== asset.size) fail('The media changed during sync; its original bytes were kept.');
	if (HASH.test(stat?.sha256)) {
		if (stat.sha256 !== asset.content) fail('The media changed during sync; its original bytes were kept.');
		return;
	}
	if (await storedFileDigest(store, file) !== asset.content) fail('The media changed during sync; its original bytes were kept.');
}
