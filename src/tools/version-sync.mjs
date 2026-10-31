// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, stat, writeFile} from 'node:fs/promises';
import {withPluginTable} from './embed-plugin-table.mjs';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION, CDN_TAG} from '../version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VERSIONED_FILES = ['.claude-plugin/plugin.json', 'packages/rapier-embed/package.json', 'skills/rapier-html/package.json', 'kit/package.json', 'server/package.json',
	'skills/README.md', 'skills/embed-rapier/SKILL.md', 'skills/rapier-agent-door/SKILL.md',
	'skills/rapier-html/SKILL.md', 'skills/rapier-html/README.md', 'skills/rapier-markdown/SKILL.md',
	'images/jxl/public/skills/rapier-jxl-photography/SKILL.md', 'images/jxl/public/skills/rapier-jxl-single-file-app/SKILL.md'];
export const ROUTE_FILES = ['draw/draw.js', 'editor/composer.js', 'shell/parts.js', 'shell/plugin-loader.js', 'interchange/pdf-plugin.js',
	'shell/font-subset-resources.json', 'shell/mermaid-resources.json', 'images/ocr.mjs'];
const ROUTE = /(https:\/\/cdn\.jsdelivr\.net\/gh\/jackskip22\/rapier-plugins@)[^/'"\s]+/g;

const EMBED_README_HEAD = `Put Rapier's Markdown editor or reader in your web app, each one offline HTML file.

Try the editor at [rapier.website](https://rapier.website).
Install: \`npm install rapier-embed\`.

`;

export async function syncVersion({check = false, absent = 'refuse', root = ROOT, artifacts = true} = {}) {
	const drifted = [], missing = [], problems = [], locations = {};
	const read = async rel => {
		try { return await readFile(resolve(root, rel), 'utf8'); }
		catch (error) {
			if (!check) throw error;
			problems.push({path: rel, line: 1, message: error.message}); return null;
		}
	};
	const location = (rel, text, next) => {
		const after = next.split('\n');
		locations[rel] = Math.max(1, text.split('\n').findIndex((line, at) => line !== after[at]) + 1);
	};
	for (const rel of VERSIONED_FILES) {
		const path = resolve(root, rel);
		if (absent === 'skip' && !existsSync(path)) { missing.push(rel); continue; }
		const text = await read(rel); if (text === null) continue;
		const next = rel.endsWith('.json') ? text.replace(/("version"\s*:\s*")[^"]*(")/, (all, open, close) => open + VERSION + close)
			: text.replace(/\b((?:npx(?:[ \t]+--)?|npm[ \t]+install)[ \t]+rapier-(?:html|embed|markdown-kit))(?:@[^\s`"']+)?/g, (_, command) => command + '@' + VERSION);
		if (rel.endsWith('.json') && !/"version"\s*:/.test(text)) {
			if (!check) throw new Error(rel + ' has no "version" field to write');
			problems.push({path: rel, line: 1, message: 'No version field'}); continue;
		}
		if (next === text) continue;
		drifted.push(rel); location(rel, text, next);
		if (!check) await writeFile(path, next);
	}
	for (const rel of ROUTE_FILES) {
		const path = resolve(root, rel);
		if (absent === 'skip' && !existsSync(path)) { missing.push(rel); continue; }
		const text = await read(rel); if (text === null) continue;
		for (const [at, line] of text.split('\n').entries()) if (/https:\/\/cdn\.jsdelivr\.net\/gh\/jackskip22\/rapier@/.test(line))
			problems.push({path: rel, line: at + 1, message: 'A jsDelivr route names rapier@, whose tree jsDelivr refuses as over 50 MB; name rapier-plugins@'});
		const next = text.replace(ROUTE, (_, route) => route + CDN_TAG);
		if (next === text) continue;
		drifted.push(rel); location(rel, text, next);
		if (!check) await writeFile(path, next);
	}
	{
		const rel = 'packages/rapier-embed/embed.mjs', path = resolve(root, rel);
		if (absent !== 'skip' || existsSync(path)) {
			const text = await read(rel);
			if (text !== null) {
				if (!/const PACKAGE_VERSION = '[^']*';/.test(text)) problems.push({path: rel, line: 1, message: 'No PACKAGE_VERSION'});
				const next = text.replace(/(const PACKAGE_VERSION = ')[^']*(';)/, (_, open, close) => open + VERSION + close);
				if (next !== text) { drifted.push(rel); location(rel, text, next); if (!check) await writeFile(path, next); }
			}
		}
	}
	const skill = resolve(root, 'skills/embed-rapier/SKILL.md'), readme = resolve(root, 'packages/rapier-embed/README.md');
	if (existsSync(skill)) {
		const authored = await readFile(skill, 'utf8');
		const manifest = artifacts ? await readFile(resolve(root, 'packages/rapier-embed/rapier-plugins.json'), 'utf8').then(JSON.parse).catch(() => null) : null;
		const reader = artifacts ? await stat(resolve(root, 'rapier-reader.html')).then(info => info.size).catch(() => 0) : 0;
		const tabled = artifacts ? withPluginTable(authored, manifest && {...manifest, release: VERSION}, reader) : authored;
		if (tabled !== authored) { drifted.push('skills/embed-rapier/SKILL.md'); location('skills/embed-rapier/SKILL.md', authored, tabled); if (!check) await writeFile(skill, tabled); }
		if (absent !== 'skip' || existsSync(readme)) {
			const body = tabled.replace(/^---\n[\s\S]*?\n---\n\s*/, '').replace(/^(# [^\n]*\n\n)/, (_, title) => title + EMBED_README_HEAD);
			const current = existsSync(readme) ? await readFile(readme, 'utf8') : '';
			if (current !== body) { drifted.push('packages/rapier-embed/README.md'); location('packages/rapier-embed/README.md', current, body); if (!check) await writeFile(readme, body); }
		}
	}
	return {version: VERSION, files: VERSIONED_FILES.length + ROUTE_FILES.length, drifted, absent: missing, problems, locations};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const check = process.argv.includes('--check');
	const result = await syncVersion({check, artifacts: !process.argv.includes('--source-only')});
	console.log(JSON.stringify({law: 'one version', ...result, mode: check ? 'check' : 'write'}));
	if (result.problems.length) { for (const row of result.problems) console.error(row.path + ':' + row.line + ': ' + row.message); process.exit(1); }
	if (check && result.drifted.length) { console.error('version drift: ' + result.drifted.join(', ') + ' do not say ' + VERSION); process.exit(1); }
}
