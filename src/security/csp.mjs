// Sole owner of the page CSP; tools/build.mjs refuses drift in the shell <meta>, _headers, Android and Windows. Node only, never bundled.

import {CLOUDFLARE_SYNC, OTHER_SYNC, registrationReady} from '../notes/sync-config.mjs';
import {providerConnectOrigins} from '../notes/sync-providers.mjs';
import {availability} from '../notes/cloud-providers.mjs';
import {RETURN_ORIGIN} from '../skills/rapier-html/return-address.mjs';

const BASE = [
	['default-src', ["'none'"]],
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
	// Registration admits the two pinned OAuth/API origins, including the deliberate verification run.
	// The session gate keeps ordinary sign-in off until that live run is recorded; native stays offline.
	web: { 'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://*.r2.cloudflarestorage.com', RETURN_ORIGIN] },
	native: { 'frame-ancestors': ["'none'"] },
	// The reader downloads only its optional plug-ins, from the one host that serves them; no sync, no door.
	reader: { 'connect-src': ["'self'", 'https://cdn.jsdelivr.net'] },
	// Embed rule: any HTTPS page may frame Rapier.
	hosted: { 'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://*.r2.cloudflarestorage.com', RETURN_ORIGIN], 'frame-ancestors': ['https:', 'http://localhost:*', 'http://127.0.0.1:*'] },
};

// The other storage services' origins join connect-src when each is switched on (notes/sync-providers.mjs PROVIDER_ORIGINS).
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
