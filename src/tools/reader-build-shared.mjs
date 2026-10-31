// SPDX-License-Identifier: AGPL-3.0-only
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {cachedRecord, keepRecord, codeIdentity, runtimeIdentity} from './build-cache.mjs';
import {stripJs} from './strip-comments.mjs';

const {minify} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');
const sha256 = value => createHash('sha256').update(value).digest('hex');
let terser = null;
export async function squeezed(text, options) {
	terser ||= Promise.all([codeIdentity([import.meta.url], {stripComments: true}), runtimeIdentity()]);
	// Public staging removes ordinary comments. Compile the same input in both trees while retaining directives and licenses.
	text = stripJs(text, {module: false});
	const key = sha256(JSON.stringify({terser: await terser, options: JSON.stringify(options, (_, value) => typeof value === 'function' ? String(value) : value), text: sha256(text)}));
	const hit = await cachedRecord(key, record => typeof record.code === 'string' && record.sha256 === sha256(record.code));
	if (hit) return hit.code;
	const {code} = await minify(text, options);
	await keepRecord(key, {code, sha256: sha256(code)});
	return code;
}

// The notice the editor writes into its MIT entries, cut to the components this file carries: each component is its lines up to its
// copyright line.
export async function mitNotice(root, keep = entry => !/gpu-lexer|acorn|Turndown|collapse-whitespace/.test(entry)) {
	const found = /const RAPIER_MIT_NOTICE = `([^`$\\]*)`;/.exec(await readFile(resolve(root, 'editor/engine.js'), 'utf8'));
	if (!found) throw new Error('editor/engine.js has no RAPIER_MIT_NOTICE the licences sheet can carry');
	const notice = found[1], mark = 'copyright notice:\n\n', start = notice.indexOf(mark) + mark.length, end = notice.indexOf('\n\nPermission is hereby');
	if (start < mark.length || end < start) throw new Error('editor/engine.js: RAPIER_MIT_NOTICE no longer has a header, a list and the terms');
	const entries = [];
	let current = [];
	for (const line of notice.slice(start, end).split('\n')) { current.push(line); if (/^\tCopyright/.test(line)) { entries.push(current.join('\n')); current = []; } }
	if (current.length) throw new Error('editor/engine.js: RAPIER_MIT_NOTICE lists a component with no copyright line');
	return notice.slice(0, start) + entries.filter(keep).join('\n') + notice.slice(end);
}
