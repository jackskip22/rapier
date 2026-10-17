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

export function createPlainKeySession({folder, fetch: fetchFn, device = null, origin = 'https://rapier.website', now = Date.now} = {}) {
	if (!folder?.owner || typeof fetchFn !== 'function') throw fail('config', 'plain files need the notes folder and the network.');
	let held = null, remember = !!device && device.available !== false, inspected = false, running = null;
	const binding = (kept, identity) => JSON.stringify({kind: 'plain-keys', folder: identity, provider: kept.provider, place: kept.place, origin});
	async function kept() {
		const plain = (await readSyncState(folder)).plain;
		return plain && KEY_PLAIN_PROVIDERS.includes(plain.provider) ? plain : null;
	}
	const identity = async () => (await folder.read()).index.folderDeviceId;
	async function restore(plain) {
		if (held || !device || !plain) return;
		const restored = await device.read(binding(plain, await identity())); inspected = true;
		remember = restored.enabled;
		const saved = restored.data?.settings;
		if (saved) held = {provider: plain.provider, place: plain.place, typed: typedOf(plain.provider, saved), settings: plainKeySettings(plain.provider, saved)};
	}
	async function keep(plain) {
		if (!device || !remember || !held) return;
		if (!inspected) { await device.read(binding(plain, await identity())); inspected = true; }
		try { await device.keep(binding(plain, await identity()), {settings: held.typed}); }
		catch { throw fail('device', 'this device could not remember the storage key. your notes are kept; try again or turn off remember this device.'); }
	}
	function session(provider, place, settings) {
		const where = plainPlace(provider, place);
		const store = plainStore(provider, {place: where, settings, fetch: fetchFn, authorizeEndpoint});
		const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(folder.deviceId || '') && folder.deviceId !== 'files' ? folder.deviceId : 'rapier';
		return {store, plain: createPlainSession({folder, store, provider, place: where, device: id, now})};
	}
	const once = fn => { if (running) throw fail('busy', 'let the current sync finish.'); running = fn().finally(() => { running = null; }); return running; };
	return Object.freeze({
		async status() {
			const plain = await kept();
			try { await restore(plain); } catch {  }
			return Object.freeze({connection: plain ? Object.freeze({provider: plain.provider, place: plain.place}) : null, keyHeld: !!held && !!plain,
				rememberAvailable: !!device && device.available !== false, rememberDevice: remember});
		},
		connect({provider, place, settings: typed} = {}) { return once(async () => {
			if (!KEY_PLAIN_PROVIDERS.includes(provider)) throw fail('config', 'choose webdav, s3-compatible storage or cloudflare r2.');
			const settings = plainKeySettings(provider, typed), {store, plain} = session(provider, place, settings);
			await store.connect();
			await plain.connect();
			held = {provider, place: plain.record.place, typed: typedOf(provider, typed), settings};
			await keep(plain.record);
			return plain.syncNow();
		}); },
		syncNow({settings: typed} = {}) { return once(async () => {
			const plain = await kept();
			if (!plain) throw fail('connection', 'connect this folder to its plain files first.');
			if (typed) held = {provider: plain.provider, place: plain.place, typed: typedOf(plain.provider, typed), settings: plainKeySettings(plain.provider, typed)};
			else await restore(plain);
			if (!held || held.provider !== plain.provider || held.place !== plain.place) throw fail('credential', 'type the storage key again: this page does not keep it.');
			const result = await session(plain.provider, plain.place.replace(/^\//, ''), held.settings).plain.syncNow();
			if (typed) await keep(plain);
			return result;
		}); },
		async setRememberDevice(enabled) {
			if (!device || device.available === false || typeof enabled !== 'boolean') throw fail('device', 'this device cannot remember sync.');
			const plain = await kept();
			if (!inspected) { await device.read(plain ? binding(plain, await identity()) : '{}'); inspected = true; }
			await device.forget(enabled); remember = enabled;
			if (enabled && plain) await keep(plain);
		},
		async forget() {
			const plain = await kept();
			if (plain) await createPlainSession({folder, store: {}, provider: plain.provider, place: plain.place, device: plain.device}).forget();
			held = null;
			if (device && device.available !== false) {
				try { if (!inspected) { await device.read('{}'); inspected = true; } await device.forget(); }
				catch { throw fail('device', 'the files stopped syncing, but this device could not forget its storage key. clear this site’s storage before leaving a shared device.'); }
			}
		},
	});
}
