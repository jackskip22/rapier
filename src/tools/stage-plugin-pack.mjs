// SPDX-License-Identifier: AGPL-3.0-only
// Shared native resources for Android's Play pack and Windows' executable: the plug-ins the page otherwise downloads from
// jsDelivr (Mermaid and the text in pictures reader's ten files, fetched here at build time from their pins; maths and
// Draw's letter sets, read from this tree), refused on any byte that is not the pinned one. The pins are the page's
// own (shell/plugin-loader.js, images/ocr.mjs and draw/letters.mjs), so the page holds the pack's bytes to the same SHA-384 it
// holds a download's. Each file is written under its resource id (the
// id the page asks RapierPlatform.resources for); nothing fetched is committed (repo/.gitignore). The app never fetches:
// Google Play delivers Android's pack; Windows bundles it at build time. node tools/stage-plugin-pack.mjs <out-dir>
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mermaidResourceFiles} from './mermaid-resources.mjs';
import {fontSubsetResourceFiles} from './font-subset-resources.mjs';
import {OCR_FILES} from '../images/ocr.mjs';
import {LETTER_SETS} from '../draw/letters.mjs';
import {PDF_JS_VERSION} from '../interchange/pdf-resources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The bundles' pins, read from the loader that verifies them (one owner of each pin).
function bundlePin(loader, key, versionName) {
	const version = new RegExp(versionName + " = '([^']+)'").exec(loader)?.[1];
	const block = new RegExp("key: '" + key + "'[\\s\\S]*?cdn: '([^']+)' \\+ " + versionName + " \\+ '([^']+)'[\\s\\S]*?bytes: (\\d+),[\\s\\S]*?sri: '([^']+)'").exec(loader);
	if (!version || !block) throw new Error('the ' + key + ' pin is not readable in shell/plugin-loader.js');
	return {id: 'rapier-' + key, url: block[1] + version + block[2], version, sri: block[4], bytes: Number(block[3])};
}

// The PDF reader's pdfjs-dist files (interchange/pdf-pins.json): id 'rapier-pdf-' + path with '/' as '-', the page's own ids.
function pdfFiles(pins) {
	if (pins.version !== PDF_JS_VERSION) throw new Error('interchange/pdf-pins.json is not the pinned pdfjs-dist version');
	return pins.files.map(([path, bytes, sri]) => ({id: 'rapier-pdf-' + path.replaceAll('/', '-'),
		url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + pins.version + '/' + path, sri, bytes}));
}

// Every file the pack carries: its id, where it is fetched from (a letter set: its file in this tree), its SHA-384 and
// (where pinned) its length.
export async function pluginPackFiles() {
	const loader = await readFile(join(root, 'shell/plugin-loader.js'), 'utf8');
	const math = bundlePin(loader, 'math', 'MATH_VERSION');
	math.path = join(root, 'shell/vendor', new URL(math.url).pathname.split('/').at(-1));
	return [math, ...mermaidResourceFiles(root), ...fontSubsetResourceFiles(root),
		...OCR_FILES.map(file => ({id: 'rapier-ocr-' + file.name, url: file.url, sri: file.sri, bytes: file.bytes})),
		...LETTER_SETS.map(set => ({id: 'rapier-letters-' + set.id, path: join(root, 'draw/letters', set.id + '.json'), sri: set.sha384, bytes: set.bytes})),
		...pdfFiles(JSON.parse(await readFile(join(root, 'interchange/pdf-pins.json'), 'utf8')))];
}

const sha384 = bytes => createHash('sha384').update(bytes).digest('base64');
const exact = (file, bytes) => sha384(bytes) === file.sri && (file.bytes == null || bytes.length === file.bytes);

// Native packs and the built-in editor resource take exactly the same pinned bytes.
export async function readPluginFile(file, path) {
	const held = path ? await readFile(path).catch(() => null) : null;
	if (held && exact(file, held)) return {bytes: held, fetched: false};
	const response = file.path ? null : await fetch(file.url, {redirect: 'follow'});
	if (response && !response.ok) throw new Error('plugin pack: HTTP ' + response.status + ' for ' + file.url);
	const bytes = response ? Buffer.from(await response.arrayBuffer()) : await readFile(file.path);
	if (!exact(file, bytes)) {
		if (path) await rm(path, {force: true});
		throw new Error('plugin pack: ' + (file.url || file.path) + ' is not the pinned file (SHA-384 ' + sha384(bytes) + ', ' + bytes.length + ' bytes); refused, nothing written');
	}
	if (path) {
		await mkdir(dirname(path), {recursive: true});
		await writeFile(path + '.part', bytes);
		await rename(path + '.part', path);
	}
	return {bytes, fetched: true};
}

export async function stagePluginPack(out) {
	const files = await pluginPackFiles();
	await mkdir(out, {recursive: true});
	// Only the pack's own files stay in its directory.
	const wanted = new Set(files.map(file => file.id));
	for (const name of await readdir(out)) if (!wanted.has(name)) await rm(join(out, name), {force: true});
	let fetched = 0, total = 0;
	for (const file of files) {
		const result = await readPluginFile(file, join(out, file.id));
		fetched += Number(result.fetched); total += result.bytes.length;
	}
	return {files: files.length, fetched, bytes: total};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const out = process.argv[2];
	if (!out) { console.error('usage: node tools/stage-plugin-pack.mjs <out-dir>'); process.exit(2); }
	stagePluginPack(resolve(out)).then(r => console.log('plugin pack: ' + r.files + ' files, ' + r.bytes + ' bytes, ' + r.fetched + ' fetched and verified'),
		error => { console.error(String(error && error.message || error)); process.exit(1); });
}
