// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import {stripperFor} from './strip-comments.mjs';
export function searchCacheVersion(parts) {
	const hash = createHash('sha256');
	for (const [name, source] of parts) {
		if (typeof name !== 'string' || typeof source !== 'string') throw new TypeError('cache version needs named source strings');
		const strip = stripperFor(name);
		const code = (strip ? strip(source) : source).replace(/[ \t]*\n\s*/g, '\n');
		hash.update(JSON.stringify([name, code])); hash.update('\n');
	}
	return hash.digest('hex');
}
