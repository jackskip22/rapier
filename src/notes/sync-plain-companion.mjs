// SPDX-License-Identifier: AGPL-3.0-only
import {createPlainSession} from './sync-plain-session.mjs';
import {createCompanionPlainStore} from './plain-companion.mjs';
import {readSyncState} from './sync-state.mjs';

const fail = (code, message) => Object.assign(new Error(message), {code});
const ID = /^[a-f0-9]{32}$/, SERVICES = ['dropbox', 'drive', 'onedrive', 'webdav', 's3', 'r2'];

export function createPlainCompanionSession({folder, call, now = Date.now} = {}) {
	if (!folder || typeof call !== 'function') throw fail('config', 'plain files through rapier sync need this device\'s app.');
	const device = () => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(folder.deviceId || '') && folder.deviceId !== 'files' ? folder.deviceId : 'rapier';
	const session = place => createPlainSession({folder, store: createCompanionPlainStore({call, destination: place}), provider: 'companion', place, device: device(), now});
	let running = null;
	const once = fn => running ||= fn().finally(() => { running = null; });
	async function connection() { const kept = (await readSyncState(folder)).plain; return kept?.provider === 'companion' ? Object.freeze({place: kept.place}) : null; }
	return Object.freeze({
		async places() {
			const answer = await call('plain.status', {});
			if (!answer || typeof answer.offered !== 'boolean' || !Array.isArray(answer.destinations)) throw fail('response', 'rapier sync answered in an unreadable form.');
			const places = answer.destinations.map(row => {
				if (!ID.test(row?.id || '') || !SERVICES.includes(row?.service)) throw fail('response', 'rapier sync answered in an unreadable form.');
				return Object.freeze({id: row.id, service: row.service});
			});
			return Object.freeze({offered: answer.offered, places});
		},
		connection,
		connect(place) {
			if (!ID.test(place || '')) throw fail('connection', 'choose a folder rapier sync set up for plain files.');
			return once(async () => { const plain = session(place); await plain.connect(); return plain.syncNow(); });
		},
		syncNow() {
			return once(async () => {
				const kept = await connection();
				if (!kept) throw fail('connection', 'connect this folder to its plain files first.');
				return session(kept.place).syncNow();
			});
		},
		async forget() { const kept = await connection(); if (kept) await session(kept.place).forget(); },
	});
}
