// SPDX-License-Identifier: AGPL-3.0-only
import {createPlainSession} from './sync-plain-session.mjs';
import {createCompanionPlainStore} from './plain-companion.mjs';
import {readSyncState} from './sync-state.mjs';

const fail = (code, message) => Object.assign(new Error(message), {code});
const ID = /^[a-f0-9]{32}$/, SERVICES = ['dropbox', 'drive', 'onedrive', 'webdav', 's3', 'r2', 'workspace'];

export function createPlainCompanionSession({folder, call, now = Date.now} = {}) {
	if (!folder || typeof call !== 'function') throw fail('config', 'plain files through rapier sync need this device\'s app.');
	const device = () => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(folder.deviceId || '') && folder.deviceId !== 'files' ? folder.deviceId : 'rapier';
	const session = (place, guard, connectionId) => activePlain = createPlainSession({folder, store: createCompanionPlainStore({call, destination: place}), provider: 'companion', place, device: device(), now, guard, connectionId});
	let running = null, activePlain = null, epoch = 0, closing = null, stopping = null, bound = null;
	const observing = new Set();
	const active = ticket => { if (ticket !== epoch) throw fail('cancelled', 'sync stopped. your notes, and what waits to upload, are kept.'); };
	const once = fn => { if (running || closing || stopping) throw fail('busy', 'let the current sync finish.'); const ticket = epoch; return running = Promise.resolve().then(() => { active(ticket); return fn(ticket); }).finally(() => { running = null; activePlain = null; }); };
	const stop = () => {
		epoch++;
		if (stopping) return stopping;
		const paused = activePlain?.pause();
		const drain = Promise.allSettled([Promise.resolve(paused), running?.catch(() => {}), ...observing]).then(([result]) => { if (result.status === 'rejected') throw result.reason; });
		stopping = drain;
		const finished = () => { if (stopping === drain) stopping = null; };
		drain.then(finished, finished);
		return drain;
	};
	function connection() {
		const remember = !closing && !stopping;
		const reading = (async () => {
			const kept = (await readSyncState(folder)).plain;
			const current = kept?.provider === 'companion' ? Object.freeze({place: kept.place, connectionId: kept.connectionId}) : null;
			if (remember) bound ||= current;
			return current;
		})();
		observing.add(reading);
		const finished = () => observing.delete(reading);
		reading.then(finished, finished);
		return reading;
	}
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
		async connection() { const kept = await connection(); return kept ? Object.freeze({place: kept.place}) : null; },
		connect(place) {
			if (!ID.test(place || '')) throw fail('connection', 'choose a folder rapier sync set up for plain files.');
			return once(async ticket => {
				const plain = session(place, () => active(ticket)), accepted = await plain.connect(); active(ticket);
				bound = {place: accepted.place, connectionId: accepted.connectionId};
				return plain.syncNow();
			});
		},
		syncNow() {
			return once(async ticket => {
				const kept = await connection(); active(ticket);
				if (!kept) throw fail('connection', 'connect this folder to its plain files first.');
				return session(kept.place, () => active(ticket), kept.connectionId).syncNow();
			});
		},
		async conflicts() { const kept = await connection(); return kept ? createPlainSession({folder, store: {}, provider: 'companion', place: kept.place, device: device(), now}).conflicts() : []; },
		mediaChoice(target) { target = structuredClone(target); return once(async ticket => {
			const kept = await connection(); active(ticket);
			if (!kept) throw fail('connection', 'connect this folder to its plain files first.');
			return session(kept.place, () => active(ticket), kept.connectionId).mediaChoice(target);
		}); },
		resolve(choice) { choice = structuredClone(choice); return once(async ticket => {
			const kept = await connection(); active(ticket);
			if (!kept) throw fail('connection', 'connect this folder to its plain files first.');
			return session(kept.place, () => active(ticket), kept.connectionId).resolve(choice);
		}); },
		lock: stop,
		forget() {
			if (closing) return closing;
			let expected = bound && {...bound};
			const drain = stop(), ticket = epoch;
			closing = (async () => {
				await drain; active(ticket);
				expected ||= bound && {...bound};
				const kept = await connection(); active(ticket);
				if (kept && expected && (kept.place !== expected.place || kept.connectionId !== expected.connectionId))
					throw fail('connection', 'the plain-files connection changed.');
				if (kept) { await session(kept.place, () => active(ticket), kept.connectionId).forget({connectionId: kept.connectionId}); active(ticket); }
				bound = null;
			})();
			return closing.finally(() => { closing = null; });
		},
	});
}
