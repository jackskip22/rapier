// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
export function searchCacheVersion(parts) {
	const hash = createHash('sha256');
	for (const [name, source] of parts) {
		if (typeof name !== 'string' || typeof source !== 'string') throw new TypeError('cache version needs named source strings');
		hash.update(JSON.stringify([name, source])); hash.update('\n');
	}
	return hash.digest('hex');
}
