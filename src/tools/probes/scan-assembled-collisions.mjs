// Two editor/scripts.json files (spliced into engine.js's one IIFE) declaring the same column-0 name are ONE binding; the later file wins
// by hoisting, so the earlier declaration never runs. node tools/probes/scan-assembled-collisions.mjs [--json] [--root=DIR]
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = process.argv.find(a => a.startsWith('--root='))?.slice(7) || '.';
const asJson = process.argv.includes('--json');

const scripts = JSON.parse(readFileSync(join(ROOT, 'editor/scripts.json'), 'utf8'));
const INSIDE = ['editor/engine.js', ...scripts].filter(p => existsSync(join(ROOT, p)));

// Column 0 only. Anything indented is inside a function of its own file and cannot collide.
const DECL = /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

const where = new Map(); // name -> [{file, line}]
for (const rel of INSIDE) {
	const src = readFileSync(join(ROOT, rel), 'utf8');
	for (const m of src.matchAll(DECL)) {
		const line = src.slice(0, m.index).split('\n').length;
		if (!where.has(m[1])) where.set(m[1], []);
		where.get(m[1]).push({file: rel, line});
	}
}

const rows = [];
for (const [name, sites] of where) {
	const files = [...new Set(sites.map(s => s.file))];
	if (files.length < 2) continue;
	// The file spliced LAST wins: engine.js is first, then scripts.json in order.
	const order = name => INSIDE.indexOf(name);
	const winner = files.slice().sort((a, b) => order(b) - order(a))[0];
	rows.push({name, sites, winner, losers: files.filter(f => f !== winner)});
}
rows.sort((a, b) => a.name.localeCompare(b.name));

const total = [...where.values()].reduce((n, s) => n + s.length, 0);
if (asJson) {
	console.log(JSON.stringify({shape: 'assembled-collision', title: 'one name declared at the top level of two files that share the IIFE',
		scanned: INSIDE.length, declarations: total, offenders: rows.length, rows}, null, 2));
} else {
	console.log(`assembled collisions -- ${total} top-level declarations across the ${INSIDE.length} files`);
	console.log(`                       spliced into the editor's one IIFE.\n`);
	for (const row of rows) {
		console.log('  ' + row.name);
		for (const s of row.sites) console.log('      ' + s.file + ':' + s.line + (s.file === row.winner ? '   <- this one wins (spliced last)' : ''));
	}
	if (!rows.length) console.log('  (none: every top-level name in the IIFE is declared exactly once)');
	else console.log(`\n  RED: ${rows.length} name(s). Every caller reaches the winner, including callers in the file whose own declaration lost.`);
}
process.exitCode = rows.length ? 1 : 0;
