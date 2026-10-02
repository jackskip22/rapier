// SPDX-License-Identifier: AGPL-3.0-only
// One version, one owner: version.mjs. Every file that must carry the number as a literal (the Claude plugin's
// manifest, skill packages, kit and package commands in the skills) is written from it here, by the build (tools/build.mjs) and by hand
// (`node tools/version-sync.mjs`); `--check` refuses a file that drifted (tools/check-plugin.mjs runs it).
import {readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION} from '../version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VERSIONED_FILES = ['.claude-plugin/plugin.json', 'packages/rapier-embed/package.json', 'skills/rapier-html/package.json', 'kit/package.json',
	'skills/README.md', 'skills/embed-rapier/SKILL.md',
	'skills/rapier-html/SKILL.md', 'skills/rapier-html/README.md', 'skills/rapier-markdown/SKILL.md'];

// `absent: 'skip'` (the build) leaves a file the tree does not carry unwritten and names it: the public source cut
// (tools/stage-public.mjs) omits package and skill files, and its rebuild must still be the root page's bytes.
export async function syncVersion({check = false, absent = 'refuse'} = {}) {
	const drifted = [], missing = [];
	for (const rel of VERSIONED_FILES) {
		const path = resolve(root, rel);
		if (absent === 'skip' && !existsSync(path)) { missing.push(rel); continue; }
		const text = await readFile(path, 'utf8');
		const next = rel.endsWith('.json') ? text.replace(/("version"\s*:\s*")[^"]*(")/, (all, open, close) => open + VERSION + close)
			: text.replace(/\b((?:npx(?:[ \t]+--)?|npm[ \t]+install)[ \t]+rapier-(?:html|embed|markdown-kit))(?:@[^\s`"']+)?/g, (_, command) => command + '@' + VERSION);
		if (rel.endsWith('.json') && !/"version"\s*:/.test(text)) throw new Error(rel + ' has no "version" field to write');
		if (next === text) continue;
		drifted.push(rel);
		if (!check) await writeFile(path, next);
	}
	// One authored embed text serves the installed skill and its npm README.
	const skill = resolve(root, 'skills/embed-rapier/SKILL.md'), readme = resolve(root, 'packages/rapier-embed/README.md');
	if (existsSync(skill) && (absent !== 'skip' || existsSync(readme))) {
		const body = (await readFile(skill, 'utf8')).replace(/^---\n[\s\S]*?\n---\n\s*/, '');
		const current = existsSync(readme) ? await readFile(readme, 'utf8') : '';
		if (current !== body) { drifted.push('packages/rapier-embed/README.md'); if (!check) await writeFile(readme, body); }
	}
	return {version: VERSION, files: VERSIONED_FILES.length, drifted, absent: missing};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const check = process.argv.includes('--check');
	const result = await syncVersion({check});
	console.log(JSON.stringify({law: 'one version', ...result, mode: check ? 'check' : 'write'}));
	if (check && result.drifted.length) { console.error('version drift: ' + result.drifted.join(', ') + ' do not say ' + VERSION); process.exit(1); }
}
