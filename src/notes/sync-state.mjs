// SPDX-License-Identifier: AGPL-3.0-only
// Private sync bookkeeping is a sibling of notes.json. The owner journals its immutable
// staged bytes by digest, so neither a normal save nor its recovery copies heads into the index.
import {sha256} from './integrity.mjs';
export const SYNC_STATE_FILE = '.rapier-sync.json';
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true});
const fail = message => { throw Object.assign(new Error(message), {code: 'sync_state'}); };
// A pure decoder, shared by the live checkpoint reader below and by a restored backup's
// carried bytes (notes/folder.mjs), which has no store to read from -- only the entries a
// person picked.
export function decodeSyncState(bytes) {
	if (bytes == null) return {};
	let state;
	try { state = JSON.parse(td.decode(bytes)); } catch { fail('The sync checkpoint is unreadable; it was kept. Restore its saved copy before syncing.'); }
	if (!state || Array.isArray(state) || state.v !== 1) fail('The sync checkpoint has an unreadable version; it was kept.');
	return state;
}
export function encodeSyncState(state) { return te.encode(JSON.stringify({...state, v: 1})); }
export async function readSyncStateBytes(store) {
	const bytes = await store.read(SYNC_STATE_FILE);
	if (bytes == null) return {state: {}, bytes: null};
	return {state: decodeSyncState(bytes), bytes};
}
export async function syncStateWrite(state, previous) {
	return {file: SYNC_STATE_FILE, bytes: encodeSyncState(state), expectedDigest: previous == null ? null : await sha256(previous)};
}
export async function readSyncState(folder) {
	const lease = await folder.owner.acquire(folder.scope);
	try { await lease.read(); return (await readSyncStateBytes(folder.store)).state; }
	finally { await lease.release(); }
}
export async function updateSyncState(folder, change) {
	const lease = await folder.owner.acquire(folder.scope);
	try {
		await lease.read();
		return await lease.transact(async ({index}) => {
			const {state, bytes} = await readSyncStateBytes(folder.store), next = await change(state, index);
			if (!next) return {index};
			return {kind: 'sync-state', index, writes: [await syncStateWrite(next, bytes)]};
		}, {brief: true});
	} finally { await lease.release(); }
}
