// Cloudflare's account and R2 control plane. The bearer never leaves its pinned API origin.
// OAuth permission names come from the registered client, not Wrangler's private scope names.
import {createHTTP, jsonBody, fail, refuse, publicOptions} from './provider-http.mjs';
import {R2_API_ORIGIN, R2_API_PREFIX} from './transport-r2.mjs';

export const NOTES_BUCKET = 'rapier-notes';
const accountPattern = /^[a-f0-9]{32}$/;
export function storageDashboard(accountId) {
	if (!accountPattern.test(accountId || '')) refuse('account', 'choose your cloudflare account first.');
	return 'https://dash.cloudflare.com/' + accountId + '/r2/overview';
}
export function createCloudflareSetup(options = {}) {
	publicOptions(options);
	const {fetch, token, signal} = options;
	if (typeof token !== 'string' || !token || /[\x00-\x20\x7f]/.test(token)) refuse('auth', 'sign in with cloudflare first.');
	const http = createHTTP({fetch, signal, timeoutMs: 30000});
	async function request(path, {method = 'GET', body, missing = false} = {}) {
		const response = await http.request(R2_API_ORIGIN + R2_API_PREFIX + path, {
			origin: R2_API_ORIGIN, method, exactTarget: true,
			headers: {Authorization: 'Bearer ' + token, accept: 'application/json', ...(body ? {'content-type': 'application/json'} : {})},
			body: body ? JSON.stringify(body) : undefined, maxBytes: 4 * 1024 * 1024,
		});
		if (missing && response.status === 404) return null;
		let data;
		try { data = jsonBody(response); } catch { refuse('response', 'cloudflare returned an unreadable answer. try again.'); }
		const codes = Array.isArray(data?.errors) ? data.errors.map(error => Number(error?.code)) : [];
		if (codes.includes(10042) || codes.includes(10136)) throw fail('r2_activation', 'cloudflare needs you to enable storage once. return here after its checkout, and rapier will finish setup.');
		if (response.status === 401) refuse('auth', 'your cloudflare sign-in expired. sign out and sign in again.');
		if (response.status === 403) refuse('permission', 'cloudflare has not allowed this account’s storage. check the access you granted, then try again.');
		if (response.status === 409) refuse('exists', 'the storage was created meanwhile. try again to connect it.');
		if (response.status === 429 || response.status >= 500) refuse('retry', 'cloudflare is busy. wait a moment, then try again.');
		if (response.status < 200 || response.status >= 300 || data?.success !== true) refuse('provider', 'cloudflare could not complete setup. check your account’s storage settings, then try again.');
		return data;
	}
	return Object.freeze({
		pause: http.pause,
		async accounts() {
			const accounts = new Map();
			for (let page = 1; page <= 100; page++) {
				const data = await request('/memberships?' + new URLSearchParams({status: 'accepted', per_page: '50', page: String(page)}));
				if (!Array.isArray(data.result)) refuse('response', 'cloudflare did not return your accounts.');
				let added = 0;
				for (const row of data.result) {
					if (row.status !== 'accepted' || row.api_access_enabled === false) continue;
					const account = row.account;
					if (!accountPattern.test(account?.id || '') || typeof account.name !== 'string') refuse('response', 'cloudflare returned an incomplete account.');
					if (!accounts.has(account.id)) { accounts.set(account.id, {id: account.id, name: account.name}); added++; }
				}
				const info = data.result_info;
				if (info?.page != null && info.page !== page) refuse('response', 'cloudflare repeated an account page. try again.');
				if (data.result.length < 50 || Number.isSafeInteger(info?.total_count) && page * 50 >= info.total_count) return [...accounts.values()];
				if (!added) refuse('response', 'cloudflare repeated an account page. try again.');
			}
			refuse('limit', 'this account list is too large to open here.');
		},
		async storage(accountId) {
			storageDashboard(accountId);
			const base = '/accounts/' + accountId + '/r2/buckets', path = base + '/' + NOTES_BUCKET;
			let bucket = await request(path, {missing: true});
			if (!bucket) {
				try { await request(base, {method: 'POST', body: {name: NOTES_BUCKET, storageClass: 'Standard'}}); }
				catch (error) { if (error.code !== 'exists') throw error; }
				bucket = await request(path);
			}
			if (bucket.result?.name !== NOTES_BUCKET || bucket.result.jurisdiction && bucket.result.jurisdiction !== 'default') refuse('response', 'cloudflare returned a different storage location. nothing was connected.');
			const vaults = new Map(), cursors = new Set();
			let cursor;
			for (let page = 0; page < 100; page++) {
				const query = new URLSearchParams({prefix: 'rapier/', per_page: '1000'});
				if (cursor) query.set('cursor', cursor);
				const data = await request(path + '/objects?' + query);
				if (!Array.isArray(data.result)) refuse('response', 'cloudflare did not return your saved notes.');
				for (const row of data.result) {
					if (typeof row?.key !== 'string' || !row.key.startsWith('rapier/')) refuse('response', 'cloudflare returned an unexpected storage listing.');
					const key = /^rapier\/([a-f0-9]{32})\/keys\/([a-f0-9]{64})$/.exec(row.key);
					if (key) vaults.set(key[1] + ':' + key[2], {accountId, bucket: NOTES_BUCKET, jurisdiction: 'default', vaultId: key[1], headerHash: key[2]});
				}
				const info = data.result_info;
				if (typeof info?.is_truncated !== 'boolean') refuse('response', 'cloudflare did not finish listing your saved notes.');
				if (!info.is_truncated) return {accountId, bucket: NOTES_BUCKET, jurisdiction: 'default', vaults: [...vaults.values()]};
				if (typeof info.cursor !== 'string' || !info.cursor || cursors.has(info.cursor)) refuse('response', 'cloudflare repeated a storage page. try again.');
				cursor = info.cursor; cursors.add(cursor);
			}
			refuse('limit', 'this storage list is too large to open here. connect with a device code instead.');
		},
	});
}
