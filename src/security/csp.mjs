
import {CLOUDFLARE_SYNC, OTHER_SYNC, registrationReady} from '../notes/sync-config.mjs';
import {providerConnectOrigins} from '../notes/sync-providers.mjs';
import {availability} from '../notes/cloud-providers.mjs';
import {RETURN_ORIGIN} from '../skills/rapier-html/return-address.mjs';

const LIVE_ORIGIN = RETURN_ORIGIN.replace(/^https:/, 'wss:');

const BASE = [
	['default-src', ["'none'"]],
	['frame-src', ["'self'"]],
	['script-src', ["'unsafe-inline'", "'wasm-unsafe-eval'", 'blob:']],
	['style-src', ["'unsafe-inline'"]],
	['img-src', ["'self'", 'data:', 'blob:', 'https:']],
	['media-src', ["'self'", 'blob:', 'https:']],
	['font-src', ['data:']],
	['connect-src', ["'self'"]],
	['worker-src', ["'self'", 'blob:']],
	['manifest-src', ["'self'"]],
	['base-uri', ["'none'"]],
	['form-action', ["'none'"]],
];

const SURFACES = {
	web: { 'frame-src': ["'self'"], 'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://*.r2.cloudflarestorage.com', RETURN_ORIGIN, LIVE_ORIGIN] },
	native: { 'frame-ancestors': ["'self'"], 'media-src': ["'self'", 'blob:'] },
	reader: { 'connect-src': ["'self'", 'https://cdn.jsdelivr.net'] },
	hosted: { 'frame-src': ["'self'"], 'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://*.r2.cloudflarestorage.com', RETURN_ORIGIN, LIVE_ORIGIN], 'frame-ancestors': ['https:', 'http://localhost:*', 'http://127.0.0.1:*'] },
};

export function csp(surface, syncConfig = CLOUDFLARE_SYNC, others = {registrations: OTHER_SYNC, listed: availability}) {
	if (!Object.hasOwn(SURFACES, surface)) throw new Error('Unknown CSP surface: ' + surface);
	const rows = BASE.map(([name, values]) => {
		const selected = SURFACES[surface][name] || values;
		if (name !== 'connect-src' || surface === 'native' || surface === 'reader') return [name, selected];
		const more = providerConnectOrigins(others).filter(origin => !selected.includes(origin));
		return [name, registrationReady(syncConfig) ? [...selected, 'https://dash.cloudflare.com', 'https://api.cloudflare.com', ...more] : [...selected, ...more]];
	});
	for (const [name, values] of Object.entries(SURFACES[surface])) if (!BASE.some(([base]) => base === name)) rows.push([name, values]);
	return rows.map(([name, values]) => name + ' ' + values.join(' ')).join('; ');
}

export const CSP_SURFACES = Object.freeze(Object.keys(SURFACES));
