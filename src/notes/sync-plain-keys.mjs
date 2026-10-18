// SPDX-License-Identifier: AGPL-3.0-only
import {createPlainSession} from './sync-plain-session.mjs';
import {plainStore, plainPlace} from './plain-stores.mjs';
import {readSyncState} from './sync-state.mjs';

export const KEY_PLAIN_PROVIDERS = Object.freeze(['webdav', 's3', 'r2']);
export const KEY_PLAIN_LABELS = Object.freeze({webdav: 'WebDAV', s3: 'S3-compatible storage', r2: 'Cloudflare R2'});
export function plainCorsRule(origin) {
	return [{AllowedOrigins: [origin], AllowedMethods: ['GET', 'PUT', 'HEAD', 'DELETE'],
		AllowedHeaders: ['authorization', 'content-type', 'x-amz-content-sha256', 'x-amz-date', 'if-match', 'if-none-match'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600}];
}
const fail = (code, message) => Object.assign(new Error(message), {code});
const sameConnection = (a, b) => ['provider', 'place', 'device', 'connectionId', 'destination'].every(key => a[key] === b[key]);
const text = value => typeof value === 'string' ? value.trim() : '';
const authorizeEndpoint = async ({network, cleartext}) => network === 'public' && !cleartext;
const R2_JURISDICTIONS = ['default', 'eu', 'us', 'fedramp'];

const FIELDS = Object.freeze({webdav: ['endpoint', 'username', 'password'], s3: ['endpoint', 'bucket', 'region', 'accessKeyId', 'secretAccessKey'],
	r2: ['accountId', 'bucket', 'jurisdiction', 'accessKeyId', 'secretAccessKey']});
const typedOf = (provider, input) => Object.fromEntries(FIELDS[provider].map(name => [name, typeof input?.[name] === 'string' ? input[name] : '']));
export function plainKeySettings(provider, input = {}) {
	if (provider === 'webdav') {
		const endpoint = text(input.endpoint), username = text(input.username), password = typeof input.password === 'string' ? input.password : '';
		if (!/^https:\/\/[^\s/?#]+\/[^\s?#]*$/i.test(endpoint.replace(/\/?$/, '/'))) throw fail('connection', 'enter the WebDAV address, starting with https://.');
		if (!username || !password) throw fail('credential', 'enter the WebDAV user name and app password.');
		return Object.freeze({endpoint: endpoint.replace(/\/?$/, '/'), username, password});
	}
	if (provider === 's3') {
		const endpoint = text(input.endpoint), bucket = text(input.bucket), region = text(input.region).toLowerCase();
		const accessKeyId = text(input.accessKeyId), secretAccessKey = typeof input.secretAccessKey === 'string' ? input.secretAccessKey.trim() : '';
		if (!endpoint || !bucket || !region) throw fail('connection', 'enter the endpoint, bucket and region.');
		if (!accessKeyId || !secretAccessKey) throw fail('credential', 'enter the access key id and secret access key.');
		return Object.freeze({endpoint, bucket, region, addressingStyle: 'path', accessKeyId, secretAccessKey});
	}
	if (provider === 'r2') {
		const accountId = text(input.accountId).toLowerCase(), bucket = text(input.bucket), jurisdiction = text(input.jurisdiction) || 'default';
		const accessKeyId = text(input.accessKeyId), secretAccessKey = typeof input.secretAccessKey === 'string' ? input.secretAccessKey.trim() : '';
		if (!/^[a-f0-9]{32}$/.test(accountId)) throw fail('connection', 'enter the 32-character cloudflare account id.');
		if (!R2_JURISDICTIONS.includes(jurisdiction)) throw fail('connection', 'choose the jurisdiction cloudflare shows for your r2 bucket.');
		if (!bucket) throw fail('connection', 'enter the r2 bucket name.');
		if (!accessKeyId || !secretAccessKey) throw fail('credential', 'enter the access key id and secret access key.');
		return Object.freeze({endpoint: `https://${accountId}.${jurisdiction === 'default' ? '' : jurisdiction + '.'}r2.cloudflarestorage.com`,
			bucket, region: 'auto', addressingStyle: 'path', accessKeyId, secretAccessKey});
	}
	throw fail('config', 'choose webdav, s3-compatible storage or cloudflare r2.');
}

async function destinationOf(provider, settings) {
	const endpoint = new URL(settings.endpoint);
	if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw fail('connection', 'the plain-files connection changed.');
	const value = JSON.stringify([provider, endpoint.href.replace(/\/+$/, ''), settings.bucket || '', settings.region || '', settings.username || '']);
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function createPlainKeySession({folder, fetch: fetchFn, device = null, origin = 'https://rapier.website', now = Date.now} = {}) {
	if (!folder?.owner || typeof fetchFn !== 'function') throw fail('config', 'plain files need the notes folder and the network.');
	let held = null, bound = null, remember = !!device && device.available !== false, inspected = false, running = null, activePlain = null, epoch = 0, locked = false, closing = null;
	const binding = (kept, identity) => JSON.stringify({kind: 'plain-keys', folder: identity, provider: kept.provider, place: kept.place, connectionId: kept.connectionId, origin});
	async function kept() {
		const plain = (await readSyncState(folder)).plain;
		if (!plain || !KEY_PLAIN_PROVIDERS.includes(plain.provider)) return null;
		bound ||= {...plain};
		return plain;
	}
	const identity = async () => (await folder.read()).index.folderDeviceId;
	async function restore(plain) {
		if (held || !device || !plain || locked) return;
		const ticket = epoch, before = JSON.stringify([plain.provider, plain.place, plain.connectionId]);
		const restored = await device.read(binding(plain, await identity()));
		const current = await kept();
		active(ticket);
		if (locked || !current || JSON.stringify([current.provider, current.place, current.connectionId]) !== before) throw fail('connection', 'the plain-files connection changed.');
		if (held) return;
		inspected = true; remember = restored.enabled;
		const saved = restored.data?.settings;
		if (saved) held = {provider: plain.provider, place: plain.place, connectionId: plain.connectionId, typed: typedOf(plain.provider, saved), settings: plainKeySettings(plain.provider, saved)};
	}
	async function keep(plain) {
		if (!device || !remember || !held) return;
		if (!inspected) { await device.read(binding(plain, await identity())); inspected = true; }
		try { await device.keep(binding(plain, await identity()), {settings: held.typed}); }
		catch { throw fail('device', 'this device could not remember the storage key. your notes are kept; try again or turn off remember this device.'); }
	}
	function session(provider, place, settings, guard, connectionId, destination) {
		const where = plainPlace(provider, place);
		const store = plainStore(provider, {place: where, settings, fetch: fetchFn, authorizeEndpoint});
		const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(folder.deviceId || '') && folder.deviceId !== 'files' ? folder.deviceId : 'rapier';
		activePlain = createPlainSession({folder, store, provider, place: where, device: id, now, guard, connectionId, destination});
		return {store, plain: activePlain};
	}
	const active = ticket => { if (ticket !== epoch) throw fail('cancelled', 'sync stopped. your notes, and what waits to upload, are kept.'); };
	const once = fn => { if (running || closing) throw fail('busy', 'let the current sync finish.'); const ticket = epoch; running = Promise.resolve().then(() => { active(ticket); return fn(ticket); }).finally(() => { running = null; activePlain = null; }); return running; };
	const stop = async () => { epoch++; activePlain?.pause(); if (running) await running.catch(() => {}); };
	return Object.freeze({
		async status() {
			let plain = await kept();
			try { await restore(plain); } catch {  }
			plain = await kept();
			return Object.freeze({connection: plain ? Object.freeze({provider: plain.provider, place: plain.place}) : null, keyHeld: !locked && !!held && !!plain && held.provider === plain.provider && held.place === plain.place && held.connectionId === plain.connectionId,
				rememberAvailable: !!device && device.available !== false, rememberDevice: remember});
		},
		connect({provider, place, settings: typed} = {}) { return once(async ticket => {
			if (!KEY_PLAIN_PROVIDERS.includes(provider)) throw fail('config', 'choose webdav, s3-compatible storage or cloudflare r2.');
			const settings = plainKeySettings(provider, typed), destination = await destinationOf(provider, settings); active(ticket);
			const {store, plain} = session(provider, place, settings, () => active(ticket), undefined, destination);
			await store.connect(); active(ticket);
			const connected = await plain.connect(); active(ticket);
			const accepted = await kept(); active(ticket);
			if (!accepted || ['provider', 'place', 'connectionId', 'destination'].some(key => accepted[key] !== connected[key])) throw fail('connection', 'the plain-files connection changed.');
			locked = false;
			bound = {...accepted};
			held = {provider, place: plain.record.place, connectionId: connected.connectionId, typed: typedOf(provider, typed), settings};
			await keep(connected);
			return plain.syncNow();
		}); },
		syncNow({settings: typed} = {}) { return once(async ticket => {
			const plain = await kept(); active(ticket);
			if (!plain) throw fail('connection', 'connect this folder to its plain files first.');
			if (typed) { locked = false; held = {provider: plain.provider, place: plain.place, connectionId: plain.connectionId, typed: typedOf(plain.provider, typed), settings: plainKeySettings(plain.provider, typed)}; }
			else await restore(plain);
			active(ticket);
			if (locked || !held || held.provider !== plain.provider || held.place !== plain.place || held.connectionId !== plain.connectionId) throw fail('credential', 'type the storage key again: this page does not keep it.');
			if (await destinationOf(plain.provider, held.settings) !== plain.destination) throw fail('connection', 'the plain-files connection changed.');
			active(ticket);
			const result = await session(plain.provider, plain.place.replace(/^\//, ''), held.settings, () => active(ticket), plain.connectionId, plain.destination).plain.syncNow();
			active(ticket);
			if (typed) { bound = {...plain}; await keep(plain); }
			active(ticket);
			return result;
		}); },
		async setRememberDevice(enabled) {
			if (!device || device.available === false || typeof enabled !== 'boolean') throw fail('device', 'this device cannot remember sync.');
			const plain = await kept();
			if (!inspected) { await device.read(plain ? binding(plain, await identity()) : '{}'); inspected = true; }
			await device.forget(enabled); remember = enabled;
			if (enabled && plain) await keep(plain);
		},
		async conflicts() {
			const plain = await kept();
			return plain ? createPlainSession({folder, store: {}, provider: plain.provider, place: plain.place, device: plain.device, now, connectionId: plain.connectionId, destination: plain.destination}).conflicts() : [];
		},
		resolve(choice) { return once(async ticket => {
			const plain = await kept(); active(ticket);
			if (!plain) throw fail('connection', 'connect this folder to its plain files first.');
			activePlain = createPlainSession({folder, store: {}, provider: plain.provider, place: plain.place, device: plain.device, now, connectionId: plain.connectionId, destination: plain.destination});
			return activePlain.resolve(choice);
		}); },
		async lock() { locked = true; await stop(); held = null; },
		forget() {
			if (closing) return closing;
			const expected = bound && {...bound}; locked = true;
			const stopped = stop(), ticket = epoch;
			closing = (async () => {
			await stopped; active(ticket);
			const plain = await kept(); active(ticket);
			if (plain && expected && !sameConnection(plain, expected)) throw fail('connection', 'the plain-files connection changed.');
			if (plain) await createPlainSession({folder, store: {}, provider: plain.provider, place: plain.place, device: plain.device,
				connectionId: plain.connectionId, destination: plain.destination, guard: () => active(ticket)}).forget({connectionId: plain.connectionId});
			active(ticket); held = null; bound = null;
			if (device && device.available !== false) {
				try { if (!inspected) { await device.read('{}'); active(ticket); inspected = true; } active(ticket); await device.forget(); }
				catch (error) { if (error.code === 'cancelled') throw error; throw fail('device', 'the files stopped syncing, but this device could not forget its storage key. clear this site’s storage before leaving a shared device.'); }
			}
			})();
			return closing.finally(() => { closing = null; });
		},
	});
}
