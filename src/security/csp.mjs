// Sole owner of the page CSP; tools/build.mjs refuses drift in the shell <meta>, _headers, Android and Windows. Node only, never bundled.

import {CLOUDFLARE_SYNC, registrationReady} from '../notes/sync-config.mjs';
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
	// dash.cloudflare.com and api.cloudflare.com join connect-src only once the sign-in is registered and verified (csp()
	// below): the PKCE token exchange is a fetch at dash. Until then neither is reachable, so nothing can POST at either.
	web: { 'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://*.r2.cloudflarestorage.com', RETURN_ORIGIN] },
	native: { 'frame-ancestors': ["'none'"] },
	// Embed law (docs/architecture.md): any HTTPS page may frame Rapier.
	hosted: { 'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://*.r2.cloudflarestorage.com', RETURN_ORIGIN], 'frame-ancestors': ['https:', 'http://localhost:*', 'http://127.0.0.1:*'] },
};

export function csp(surface, syncConfig = CLOUDFLARE_SYNC) {
	if (!Object.hasOwn(SURFACES, surface)) throw new Error('Unknown CSP surface: ' + surface);
	const rows = BASE.map(([name, values]) => {
		const selected = SURFACES[surface][name] || values;
		return [name, name === 'connect-src' && surface !== 'native' && registrationReady(syncConfig)
			? [...selected, 'https://dash.cloudflare.com', 'https://api.cloudflare.com'] : selected];
	});
	for (const [name, values] of Object.entries(SURFACES[surface])) if (!BASE.some(([base]) => base === name)) rows.push([name, values]);
	return rows.map(([name, values]) => name + ' ' + values.join(' ')).join('; ');
}

export const CSP_SURFACES = Object.freeze(Object.keys(SURFACES));
