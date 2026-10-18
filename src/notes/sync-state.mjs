// SPDX-License-Identifier: AGPL-3.0-only
import {sha256} from './integrity.mjs';
export const SYNC_STATE_FILE = '.rapier-sync.json';
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true});
const fail = message => { throw Object.assign(new Error(message), {code: 'sync_state'}); };
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
export async function updateSyncState(folder, change, {guard} = {}) {
	const lease = await folder.owner.acquire(folder.scope);
	try {
		await lease.read();
		return await lease.transact(async ({index}) => {
			const {state, bytes} = await readSyncStateBytes(folder.store), next = await change(state, index);
			if (!next) return {index};
			return {kind: 'sync-state', index, writes: [await syncStateWrite(next, bytes)]};
		}, {brief: true, admissionGuard: guard});
	} finally { await lease.release(); }
}
