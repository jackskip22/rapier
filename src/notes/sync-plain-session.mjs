// SPDX-License-Identifier: AGPL-3.0-only
import {syncPlainFiles} from './sync-plain.mjs';
import {plainConflicts, writePlainNote} from './sync-plain-conflicts.mjs';
import {readSyncState, readSyncStateBytes, updateSyncState} from './sync-state.mjs';
import {syncPlainMedia, plainMediaChoice, resolvePlainMedia} from './sync-plain-media.mjs';
import {syncPlainCards} from './sync-plain-cards.mjs';
import {withWikiPictures} from './plain-wiki-pictures.mjs';

export const PLAIN_PROVIDERS = Object.freeze(['dropbox', 'drive', 'onedrive', 'webdav', 's3', 'r2', 'companion']);
const fail = (code, message) => Object.assign(new Error(message), {code});
const DEVICE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDLE_STAMP_MS = 5 * 60 * 1000;
const PLACE = /^[^\x00-\x1f\x7f]{1,1024}$/;

export function plainRecord({provider, place, device, destination}) {
	if (!PLAIN_PROVIDERS.includes(provider)) throw fail('connection', 'choose where the plain files are kept.');
	if (typeof place !== 'string' || !PLACE.test(place)) throw fail('connection', 'choose the folder that keeps the plain files.');
	if (!DEVICE.test(device || '') || device === 'files') throw fail('connection', 'this device has no sync name.');
	if (destination !== undefined && !/^[a-f0-9]{64}$/.test(destination)) throw fail('connection', 'the plain-files connection changed.');
	return Object.freeze({...(destination ? {destination} : {}), layout: 'plain', provider, place, device});
}

export function createPlainSession({folder, store: given, provider, place, device, media = true, cards = true, now = Date.now, guard: parentGuard = () => {}, connectionId, destination}) {
	const record = plainRecord({provider, place, device, destination});
	if (!folder || !given) throw fail('config', 'a plain-files sync needs the folder and its store.');
	const store = withWikiPictures(given);
	let running = null, epoch = 0, boundConnectionId = connectionId;
	const transports = new Set([store]);
	const active = ticket => { parentGuard(); if (ticket !== epoch) throw fail('cancelled', 'sync stopped. your notes, and what waits to upload, are kept.'); };
	const sameConnection = (a, b) => !!a && !!b && a.provider === b.provider && a.place === b.place &&
		a.device === b.device && a.connectionId === b.connectionId && a.destination === b.destination;
	const connectionGuard = (ticket, connection) => async () => {
		active(ticket);
		if (!sameConnection((await readSyncStateBytes(folder.store)).state.plain, connection))
			throw fail('connection', 'the plain-files connection changed.');
		active(ticket);
	};
	const stop = () => {
		epoch++;
		const stopped = [];
		for (const transport of transports) {
			try { stopped.push(Promise.resolve(transport.pause?.())); } catch (error) { stopped.push(Promise.reject(error)); }
		}
		const drain = Promise.allSettled([...stopped, running?.catch(() => {})]).then(results => {
			const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
		});
		drain.catch(() => {});
		return drain;
	};
	function guarded(remote, guard) {
		transports.add(remote);
		return new Proxy({}, {get(_target, key) {
			const target = remote;
			if (key === 'area') return typeof target.area === 'function' ? name => guarded(target.area(name), guard) : undefined;
			const value = target[key];
			if (typeof value !== 'function') return value;
			return async (...args) => { await guard(); const result = await value.apply(target, args); await guard(); return result; };
		}});
	}
	const base = {
		async read() { return structuredClone((await readSyncState(folder)).plain?.base || {}); },
		async write(value, guard) {
			await updateSyncState(folder, state => {
				const kept = state.plain;
				if (!kept || kept.provider !== record.provider || kept.place !== record.place) throw fail('connection', 'this folder\'s plain-files connection changed during the sync; nothing was saved.');
				return {...state, plain: {...kept, base: value}};
			}, {guard});
		},
	};
	const cardsBase = {
		async read() { return structuredClone((await readSyncState(folder)).plain?.cards || {}); },
		async write(value, guard) { await updateSyncState(folder, state => {
			if (state.plain?.provider !== record.provider || state.plain.place !== record.place) throw fail('connection', 'the plain-files connection changed.');
			return {...state, plain: {...state.plain, cards: value}};
		}, {guard}); },
	};
	const mediaBase = {
		async read() { return structuredClone((await readSyncState(folder)).plain?.media || {}); },
		async write(value, guard) { await updateSyncState(folder, state => {
			if (state.plain?.provider !== record.provider || state.plain.place !== record.place) throw fail('connection', 'the plain-files connection changed.');
			return {...state, plain: {...state.plain, media: value}};
		}, {guard}); },
	};
	const chooseMedia = (target, resolve = false) => {
		if (running) return Promise.reject(fail('busy', 'let the current sync finish.'));
		target = structuredClone(target);
		const ticket = epoch;
		running = (async () => {
			const saved = (await readSyncStateBytes(folder.store)).state.plain;
			if (!saved || saved.provider !== record.provider || saved.place !== record.place || saved.destination !== record.destination ||
				boundConnectionId !== undefined && saved.connectionId !== boundConnectionId || resolve && target.connectionId !== saved.connectionId)
				throw fail('connection', 'the plain-files connection changed.');
			const guard = connectionGuard(ticket, saved); await guard();
			await store.resume?.(); await guard();
			const remote = guarded(store, guard);
			if (resolve) return resolvePlainMedia({folder, store: remote, choice: target, guard, now});
			return {...await plainMediaChoice({...target, folder, store: remote, guard}), connectionId: saved.connectionId};
		})();
		return running.finally(() => { running = null; transports.clear(); transports.add(store); });
	};
	return Object.freeze({
		record,
		async connect({expectedConnectionId} = {}) {
			if (running) throw fail('busy', 'let the current sync finish.');
			const ticket = epoch, guard = () => active(ticket);
			let connected;
			running = (async () => {
				await guard();
				const expected = (await readSyncState(folder)).plain;
				await guard();
				if (expectedConnectionId !== undefined && (expected?.connectionId ?? null) !== expectedConnectionId)
					throw fail('connection', 'the plain-files connection changed.');
				if (expected && (expected.provider !== record.provider || expected.place !== record.place || expected.destination !== record.destination))
					throw fail('connection', 'this folder already syncs plain files to another place: forget that connection first.');
				if (typeof store.connect === 'function') await store.connect();
				await guard();
				await updateSyncState(folder, async state => {
					await guard();
					if (expected ? !sameConnection(state.plain, expected) : state.plain !== undefined)
						throw fail('connection', 'the plain-files connection changed.');
					if (state.plain) { connected = state.plain; return null; }
					connected = {...record, connectionId: crypto.randomUUID(), base: {}, media: {}};
					return {...state, plain: connected};
				}, {guard});
				await guard();
				await connectionGuard(ticket, connected)(); boundConnectionId = connected.connectionId; return Object.freeze({...record, connectionId: connected.connectionId});
			})();
			try { return await running; } finally { running = null; transports.clear(); transports.add(store); }
		},
		async syncNow() {
			if (running) return running;
			const ticket = epoch;
			running = (async () => {
				active(ticket);
				const saved = (await readSyncState(folder)).plain;
				if (!saved || saved.provider !== record.provider || saved.place !== record.place || saved.destination !== record.destination || boundConnectionId !== undefined && saved.connectionId !== boundConnectionId) throw fail('connection', 'connect this folder to its plain files first.');
				boundConnectionId = saved.connectionId;
				const guard = connectionGuard(ticket, saved); await guard();
				if (typeof store.resume === 'function') await store.resume();
				await guard();
				const remote = guarded(store, guard);
				try {
					await remote.beginPoll?.();
					const listing = await remote.list();
					const result = await syncPlainFiles({folder, store: remote, base: {read: base.read, write: value => base.write(value, guard)}, device: record.device, other: 'files', listing, guard, now});
					if (cards) result.cards = await syncPlainCards({folder, store: remote, base: {read: cardsBase.read, write: value => cardsBase.write(value, guard)}, listing, guard, now});
					if (media) result.media = await syncPlainMedia({folder, store: guarded(store, guard), base: {read: mediaBase.read, write: value => mediaBase.write(value, guard)}, guard});
					await guard();
					const moved = row => ['pushed', 'pulled', 'created', 'renamed', 'trashed', 'removed', 'conflicts'].some(key => row?.[key]);
					if (moved(result) || moved(result.media) || moved(result.cards) || !(saved.syncedAt > now() - IDLE_STAMP_MS))
						await updateSyncState(folder, state => state.plain?.provider === record.provider && state.plain.place === record.place ? {...state, plain: {...state.plain, syncedAt: now()}} : null, {guard});
					return result;
				} finally { store.endPoll?.(); }
			})();
			try { return await running; } finally { running = null; transports.clear(); transports.add(store); }
		},
		async forget({connectionId} = {}) {
			const drain = stop();
			const ticket = epoch, guard = () => active(ticket);
			await drain; guard();
			if (running) await running.catch(() => {});
			guard();
			const expected = (await readSyncStateBytes(folder.store)).state.plain;
			guard();
			if (!expected) return;
			if (expected.provider !== record.provider || expected.place !== record.place || connectionId !== undefined && expected.connectionId !== connectionId)
				throw fail('connection', 'the plain-files connection changed.');
			await updateSyncState(folder, state => {
				if (!state.plain) return null;
				if (!sameConnection(state.plain, expected)) throw fail('connection', 'the plain-files connection changed.');
				const {plain, ...rest} = state;
				void plain;
				return rest;
			}, {guard});
			await store.pause?.();
		},
		conflicts() { const ticket = epoch; return plainConflicts(folder, () => active(ticket)); },
		mediaChoice(target) { return chooseMedia(target); },
		resolve(choice) {
			if (choice?.kind === 'media') return chooseMedia(choice, true);
			if (running) return Promise.reject(fail('busy', 'let the current sync finish.'));
			const ticket = epoch;
			running = (async () => {
				const connection = (await readSyncStateBytes(folder.store)).state.plain;
				if (connection?.provider !== record.provider || connection.place !== record.place || boundConnectionId !== undefined && connection.connectionId !== boundConnectionId) throw fail('connection', 'the plain-files connection changed.');
				return writePlainNote({folder, ...choice, choice, guard: connectionGuard(ticket, connection), now});
			})();
			return running.finally(() => { running = null; });
		},
		lock: stop,
		pause: stop,
	});
}
