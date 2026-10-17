// SPDX-License-Identifier: AGPL-3.0-only
import {syncPlainFiles} from './sync-plain.mjs';
import {readSyncState, updateSyncState} from './sync-state.mjs';
import {syncPlainPictures} from './sync-plain-pictures.mjs';

export const PLAIN_PROVIDERS = Object.freeze(['dropbox', 'drive', 'onedrive', 'webdav', 's3', 'r2', 'companion']);
const fail = (code, message) => Object.assign(new Error(message), {code});
const DEVICE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PLACE = /^[^\x00-\x1f\x7f]{1,1024}$/;

export function plainRecord({provider, place, device}) {
	if (!PLAIN_PROVIDERS.includes(provider)) throw fail('connection', 'choose where the plain files are kept.');
	if (typeof place !== 'string' || !PLACE.test(place)) throw fail('connection', 'choose the folder that keeps the plain files.');
	if (!DEVICE.test(device || '') || device === 'files') throw fail('connection', 'this device has no sync name.');
	return Object.freeze({layout: 'plain', provider, place, device});
}

export function createPlainSession({folder, store, provider, place, device, pictures = true}) {
	const record = plainRecord({provider, place, device});
	if (!folder || !store) throw fail('config', 'a plain-files sync needs the folder and its store.');
	let running = null;
	const base = {
		async read() { return structuredClone((await readSyncState(folder)).plain?.base || {}); },
		async write(value) {
			await updateSyncState(folder, state => {
				const kept = state.plain;
				if (!kept || kept.provider !== record.provider || kept.place !== record.place) throw fail('connection', 'this folder\'s plain-files connection changed during the sync; nothing was saved.');
				return {...state, plain: {...kept, base: value}};
			});
		},
	};
	const pictureBase = {
		async read() { return structuredClone((await readSyncState(folder)).plain?.pictures || {}); },
		async write(value) { await updateSyncState(folder, state => state.plain ? {...state, plain: {...state.plain, pictures: value}} : null); },
	};
	return Object.freeze({
		record,
		async connect() {
			await updateSyncState(folder, state => {
				if (state.vault || state.head) throw fail('connection', 'this folder syncs as an encrypted vault: stop that sync before choosing plain files.');
				if (state.plain && (state.plain.provider !== record.provider || state.plain.place !== record.place)) throw fail('connection', 'this folder already syncs plain files to another place: forget that connection first.');
				if (state.plain) return null;
				return {...state, plain: {...record, base: {}, pictures: {}}};
			});
			if (typeof store.connect === 'function') await store.connect();
			return record;
		},
		async syncNow() {
			if (running) return running;
			running = (async () => {
				const saved = (await readSyncState(folder)).plain;
				if (!saved || saved.provider !== record.provider || saved.place !== record.place) throw fail('connection', 'connect this folder to its plain files first.');
				const result = await syncPlainFiles({folder, store, base, device: record.device, other: 'files'});
				if (pictures) result.pictures = await syncPlainPictures({folder, store, base: pictureBase});
				return result;
			})();
			try { return await running; } finally { running = null; }
		},
		async forget() {
			await updateSyncState(folder, state => {
				if (!state.plain) return null;
				const {plain, ...rest} = state;
				void plain;
				return rest;
			});
			store.pause?.();
		},
		pause() { store.pause?.(); },
	});
}
