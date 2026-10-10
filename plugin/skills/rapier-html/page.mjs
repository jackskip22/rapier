// SPDX-License-Identifier: MIT
import {readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';
import {wrap} from './wrap.mjs';
import {returnAddress, returnExpiresAt} from './return-address.mjs';
export {wrap, unwrap, encodeCarried, decodeCarried} from './wrap.mjs';
// Unknown options, a bare --drawing or --compare and a third name are refused.
const USAGE = 'usage: rapier-html <document.md> [out.html] [--view draw|notes] [--drawing sketch.svg] [--compare original.md [--by <your name>]] [--return <url> --return-expires-at <timestamp>]\n' +
	'  writes <document>.rapier.html beside the file: Rapier with the document inside it, one file, offline.\n' +
	'  It never overwrites: an output that already exists, the document itself included, is refused.\n' +
	'  --view      opens the page on Draw (sketch and paint, the document behind it) or on Notes\n' +
	'  --drawing   carries an SVG drawing alongside the document, opened on Draw as the page boots\n' +
	'  --compare   carries the original text; the page opens showing its diff from the current document\n' +
	'  --by        with --compare: the name shown on the diff with the time the page was made\n' +
	'  --return    carries a one-use return URL from document.create_return; Share offers Send back\n' +
	'  --return-expires-at  carries the same mint\'s expiry; Share offers Save once the return expires\n' +
	'  --          everything after it is a filename, even one that starts with a dash\n' +
	'  --help      this text';
export async function main(argv, pagesDir, {log = console.log} = {}) {
	const names = [];
	let drawingPath = null, basePath = null, by = null, view = null, address = null, expiry = null, onlyNames = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (onlyNames || !arg.startsWith('-')) names.push(arg);
		else if (arg === '--') onlyNames = true;
		else if (arg === '--help') { log(USAGE); return null; }
		else if (arg === '--view') {
			if (view !== null || !['draw', 'notes'].includes(argv[i + 1])) throw new Error('--view takes draw or notes');
			view = argv[++i];
		}
		else if (arg === '--compare') {
			if (basePath !== null || !argv[i + 1] || argv[i + 1].startsWith('-')) throw new Error('--compare takes one text file (write a name that starts with a dash as ./-original.md)');
			basePath = argv[++i];
		}
		else if (arg === '--by') {
			if (by !== null || !argv[i + 1] || argv[i + 1].startsWith('-')) throw new Error('--by takes one name');
			by = argv[++i];
		}
		else if (arg === '--return') {
			if (address !== null || !argv[i + 1] || argv[i + 1].startsWith('-')) throw new Error('--return takes one HTTPS return URL');
			address = returnAddress(argv[++i]);
		}
		else if (arg === '--return-expires-at') {
			if (expiry !== null || !argv[i + 1] || argv[i + 1].startsWith('-')) throw new Error('--return-expires-at takes one ISO timestamp from document.create_return');
			expiry = returnExpiresAt(argv[++i]);
		}
		else if (arg !== '--drawing') throw new Error('unknown option ' + arg + '\n' + USAGE);
		else if (drawingPath !== null || !argv[i + 1] || argv[i + 1].startsWith('-')) throw new Error('--drawing takes one SVG file (write a name that starts with a dash as ./-sketch.svg)');
		else drawingPath = argv[++i];
	}
	if (names.length < 1 || names.length > 2) throw new Error(USAGE);
	const [input, named] = names;
	const text = await readFile(input, 'utf8');
	const page = await readFile(join(pagesDir, 'rapier.html'), 'utf8');
	const name = basename(input);
	const out = named || join(dirname(input), name.replace(/\.(md|markdown|txt)$/i, '') + '.rapier.html');
	const wrapOptions = {};
	if (drawingPath) { wrapOptions.drawing = await readFile(drawingPath, 'utf8'); wrapOptions.drawingName = basename(drawingPath); }
	if (by !== null && !basePath) throw new Error('--by labels a comparison: give its --compare file');
	if (basePath) { wrapOptions.base = await readFile(basePath, 'utf8'); wrapOptions.baseName = basename(basePath); wrapOptions.at = new Date().toISOString(); }
	if (by !== null) { wrapOptions.by = by; wrapOptions.at = new Date().toISOString(); }
	if (view) wrapOptions.view = view;
	if (address) wrapOptions.return = address;
	if (expiry) wrapOptions.return_expires_at = expiry;
	// Always a new file; 'wx' refuses any existing path, links included.
	try { await writeFile(out, wrap(page, text, name, wrapOptions), {flag: 'wx'}); }
	catch (error) { throw error.code === 'EEXIST' ? new Error(out + ' already exists, and rapier-html never overwrites a file: name a new one') : error; }
	log(out + ' (' + name + ', ' + Buffer.byteLength(text) + ' bytes of document' +
		(view ? ', opens on ' + (view === 'draw' ? 'Draw' : 'Notes') : '') + (drawingPath ? ', ' + basename(drawingPath) + ' drawing' : '') + (basePath ? ', its diff from ' + basename(basePath) : '') + ')');
	return out;
}
