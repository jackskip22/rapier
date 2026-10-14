import {createS3Transport} from './transport-s3.mjs';
import {createWebDAVTransport} from './transport-webdav.mjs';
import {asBytes, refuse, untilAbort} from './provider-http.mjs';
const FIELDS = Object.freeze({
	s3: ['endpoint', 'bucket', 'region', 'addressingStyle', 'prefix', 'vaultId', 'network', 'allowInsecureLan', 'accessKeyId', 'secretAccessKey', 'sessionToken'],
	webdav: ['endpoint', 'vaultId', 'network', 'allowInsecureLan', 'username', 'password'],
});
export function createProviderSetup({fetch: fetchFn, authorizeEndpoint, credentials, crypto = globalThis.crypto, clock, wait} = {}) {
	if (typeof fetchFn !== 'function' || typeof authorizeEndpoint !== 'function' || typeof credentials?.read !== 'function' || typeof credentials?.compareAndSet !== 'function') refuse('config', 'Companion network admission and an encrypted credential store are required.');
	const lifetime = new AbortController(); let transport = null, busy = false;
	const check = () => { if (lifetime.signal.aborted) refuse('cancelled', 'Setup stopped. Your notes are unchanged.'); };
	return Object.freeze({
		pause() { lifetime.abort(); transport?.pause(); },
		async checkAndSave(provider, input, {replace = false} = {}) {
			check(); if (busy) refuse('busy', 'Another connection check is running.');
			if (!Object.hasOwn(FIELDS, provider) || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(name => !FIELDS[provider].includes(name))) refuse('config', 'Only this provider’s destination settings are accepted; never enter a vault key.');
			const config = {...input};
			if (!/^[a-f0-9]{32}$/.test(config.vaultId || '')) refuse('config', 'Use the public 32-character vault identifier, not a passphrase or recovery code.');
			const slot = provider + '-' + config.vaultId;
			const encoded = new TextEncoder().encode(JSON.stringify({schema: 1, provider, config}));
			if (encoded.length > 64 * 1024) refuse('too_large', 'These settings exceed the credential store budget. Nothing was sent.');
			busy = true; let before;
			try {
				const old = await untilAbort(lifetime.signal, () => credentials.read(slot));
				before = old == null ? null : asBytes(old).slice();
				if (before && replace !== true) refuse('exists', 'This vault already has saved settings. Choose CHECK AND REPLACE explicitly.');
				const network = config.network ?? 'public';
				const send = async (url, init) => {
					if (await authorizeEndpoint(Object.freeze({url, origin: new URL(url).origin, network, cleartext: new URL(url).protocol === 'http:', signal: init.signal})) !== true) refuse('network_scope', 'This destination is not authorized. No credential was sent.');
					return fetchFn(url, init);
				};
				transport = provider === 's3'
					? createS3Transport({...config, fetch: send, signal: lifetime.signal, crypto, ...(clock ? {clock} : {}), ...(wait ? {wait} : {})})
					: createWebDAVTransport({...config, fetch: fetchFn, authorizeEndpoint, signal: lifetime.signal});
				await transport.connect(); check();
				if (await untilAbort(lifetime.signal, () => credentials.compareAndSet(slot, before, encoded)) !== true) refuse('changed', 'The saved destination changed during this check. Its newer settings were kept.');
				check();
				return Object.freeze({provider, vaultId: config.vaultId, checked: true, syncReady: false,
					retainedCheck: provider === 's3' ? 'one random 32-byte object' : 'one empty .webdav-check file'});
			} finally {
				transport?.pause(); transport = null; before?.fill(0); encoded.fill(0);
				for (const key of Object.keys(config)) delete config[key];
				busy = false;
			}
		},
	});
}
