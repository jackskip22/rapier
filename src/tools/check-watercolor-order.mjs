// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WATER_PIGMENTS} from '../draw/water-data.mjs';
import {WATERCOLOR_FIRST} from '../draw/watercolor-order.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['draw', 'editor', 'agent', 'mcp', 'shell', 'notes', 'windows', 'android', 'presets'];
const OWNERS = new Set(['draw/watercolor-order.mjs', 'draw/water-pigments.mjs']);
const ids = WATER_PIGMENTS.map(row => row.id).join('|').replace(/[-]/g, '\\-');
const LIST = new RegExp('[\'"`](' + ids + ')[\'"`]\\s*[,:]\\s*[\'"`](' + ids + ')[\'"`]');

function* sources(dir) {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name.startsWith('.')) continue;
		const path = join(dir, name), info = statSync(path);
		if (info.isDirectory()) yield* sources(path);
		else if (/\.(?:m?js|kt|cpp|h)$/.test(name)) yield path;
	}
}

export function watercolorOrderProblems(base = root) {
	const problems = [];
	for (const id of WATERCOLOR_FIRST) if (!WATER_PIGMENTS.some(row => row.id === id)) problems.push('draw/watercolor-order.mjs names ' + id + ', which the pigment table does not hold');
	for (const dir of DIRS) {
		let start; try { start = join(base, dir); statSync(start); } catch { continue; }
		for (const path of sources(start)) {
			const file = relative(base, path).replaceAll('\\', '/');
			if (OWNERS.has(file)) continue;
			const text = readFileSync(path, 'utf8'), match = LIST.exec(text);
			if (match) problems.push(file + ' lists watercolor colors of its own (' + match[0].slice(0, 60) + '): read draw/watercolor-order.mjs');
		}
	}
	return problems;
}

export function checkWatercolorOrder() {
	const problems = watercolorOrderProblems();
	if (problems.length) throw new Error('One watercolor color order (draw/watercolor-order.mjs):\n  ' + problems.join('\n  '));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const problems = watercolorOrderProblems();
	console.log(problems.length ? problems.join('\n') : 'one watercolor color order: draw/watercolor-order.mjs, no other list');
	process.exitCode = problems.length ? 1 : 0;
}
