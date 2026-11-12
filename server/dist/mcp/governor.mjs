// SPDX-License-Identifier: AGPL-3.0-only
import {editorSecretUsable, editorSecretKeyMaterial} from './editor-keys.mjs';

export const GOVERNOR = Object.freeze({personPerDay: 2000, anonymousCallerPerDay: 2000, anonymousWorkspacePerDay: 500, doorPerDay: 80000,
	doorSample: 16, anonymousCreatesStopAt: 0.8});
export const DAILY_LIMIT_WORDS = 'Rapier\'s free server has done today\'s share for you. It resets at 8 am AWST (00:00 UTC). ' +
	'Your document is safe in the editor; keep writing there.';

const day = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const untilMidnight = (now = Date.now()) => Math.max(1, Math.ceil((Date.UTC(...(d => [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1])(new Date(now))) - now) / 1000));
async function hash(value) {
	const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
	return [...bytes.subarray(0, 12)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function routeClass(request) {
	const url = new URL(request.url), path = url.pathname;
	if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return 'socket';
	if (/^\/d\//.test(path)) return 'page';
	if (/^\/editor\/[^/]+/.test(path)) return 'page-transport';
	if (path.startsWith('/live/')) return 'live';
	if (path === '/authorize' || path.startsWith('/oauth/') || path.startsWith('/.well-known/')) return 'oauth';
	if (path.startsWith('/export/')) return 'export';
	if (path.startsWith('/return/')) return 'return';
	if (path === '/health') return 'health';
	return 'other';
}

export function personOf(authority, args, caller = null) {
	if (authority?.ownerId && ['oauth', 'server', 'browser', 'access'].includes(authority.source)) return {key: 'owner:' + authority.ownerId, anonymous: false};
	const workspace = authority?.source === 'page' && authority.id ? 'workspace:' + authority.id
		: typeof args?.document === 'string' && args.document ? 'workspace:' + args.document : null;
	if (caller) return {key: 'caller:' + caller, anonymous: true, ...(workspace ? {workspace} : {})};
	return workspace ? {key: workspace, anonymous: true} : null;
}

export async function callerOf(request, env) {
	if (env?.DOOR_GOVERNOR !== 'on' || !editorSecretUsable(env.EDITOR_KEY_SECRET)) return null;
	const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(env.EDITOR_KEY_SECRET, 'rapier-governor-caller-v1\0'),
		{name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
	const tag = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(request.headers.get('CF-Connecting-IP') || 'unknown')));
	return [...tag.subarray(0, 16)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function meter(env, kind, door = '', person = null) {
	try {
		if (typeof env?.DOOR_METER?.writeDataPoint !== 'function') return;
		const index = person ? await hash(day() + ':' + person.key) : '';
		env.DOOR_METER.writeDataPoint({blobs: [String(kind).slice(0, 64), String(door).slice(0, 16), person ? (person.anonymous ? 'anonymous' : 'owner') : ''],
			doubles: [1], indexes: [index]});
	} catch {}
}

async function take(env, key, limit, peek = false, below = undefined) {
	const response = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', {
		method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({limit, windowMs: 24 * 60 * 60 * 1000,
			...(peek ? {peek: true} : {}), ...(below !== undefined ? {below} : {})})}));
	if (!response.ok) return null;
	const body = await response.json();
	return typeof body.allowed === 'boolean' ? body : null;
}

export async function takeDailyShare(env, person, {creating = false, limits = GOVERNOR, random = Math.random, now = Date.now()} = {}) {
	if (env?.DOOR_GOVERNOR !== 'on' || !env.BUDGET?.get || !env.BUDGET?.idFromName) return null;
	const refuse = () => ({status: 429, code: 'DAILY_LIMIT', message: DAILY_LIMIT_WORDS, retryAfter: untilMidnight(now)});
	try {
		const today = day(now);
		const counters = [];
		if (person) {
			const ownLimit = !person.anonymous ? limits.personPerDay : person.key.startsWith('caller:') ? limits.anonymousCallerPerDay : limits.anonymousWorkspacePerDay;
			counters.push({key: 'person-day:' + today + ':' + await hash(person.key), limit: ownLimit});
			if (person.workspace) counters.push({key: 'person-day:' + today + ':' + await hash(person.workspace), limit: limits.anonymousWorkspacePerDay});
		}
		const doorLimit = Math.ceil(limits.doorPerDay / limits.doorSample);
		const anonymousCreate = creating && person?.anonymous !== false;
		if (random() < 1 / limits.doorSample)
			counters.push({key: 'door-day:' + today, limit: doorLimit, ...(anonymousCreate ? {below: Math.floor(doorLimit * limits.anonymousCreatesStopAt)} : {})});
		for (const row of counters) if ((await take(env, row.key, row.limit, true, row.below))?.allowed === false) return refuse();
		for (const row of counters) if ((await take(env, row.key, row.limit, false, row.below))?.allowed === false) return refuse();
		return null;
	} catch { return null; }
}
