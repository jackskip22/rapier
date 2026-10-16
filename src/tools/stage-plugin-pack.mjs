// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {mermaidResourceFiles} from './mermaid-resources.mjs';
import {fontSubsetResourceFiles} from './font-subset-resources.mjs';
import {cdnOrigin} from '../version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN_ORIGIN = cdnOrigin('rapier-plugins');

function bundlePin(loader, key, versionName) {
	const version = new RegExp(versionName + " = '([^']+)'").exec(loader)?.[1];
	const block = new RegExp("key: '" + key + "'[\\s\\S]*?bytes: (\\d+),[\\s\\S]*?sri: '([^']+)'[\\s\\S]*?url: '([^']+)'").exec(loader);
	if (!version || !block) throw new Error('the ' + key + ' pin is not readable in shell/plugin-loader.js');
	return {id: 'rapier-' + key, url: block[3], version, sri: block[2], bytes: Number(block[1])};
}

function pdfFiles(pins, version, root) {
	if (pins.version !== version) throw new Error('interchange/pdf-pins.json is not the pinned pdfjs-dist version');
	return pins.files.map(([path, bytes, sri]) => ({id: 'rapier-pdf-' + path.replaceAll('/', '-'),
		plugin: 'pdf', hostFile: 'pdfjs-dist-' + pins.version + '/' + path,
		url: path === pins.reader ? PLUGIN_ORIGIN + 'pdfjs-dist-' + pins.version + '/' + path : 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + pins.version + '/' + path,
		...(path === pins.reader ? {path: join(root, 'interchange/pdf-reader.mjs')} : {}), sri, bytes}));
}

export async function pluginPackFiles({root = ROOT, loader = null} = {}) {
	loader ??= await readFile(join(root, 'shell/plugin-loader.js'), 'utf8');
	const {OCR_FILES} = await import(pathToFileURL(join(root, 'images/ocr.mjs')).href);
	const {LETTER_SETS} = await import(pathToFileURL(join(root, 'draw/letters.mjs')).href);
	const {PDF_JS_VERSION} = await import(pathToFileURL(join(root, 'interchange/pdf-resources.mjs')).href);
	const lettersAt = /const RAPIER_DRAW_LETTERS_URL = '([^']+)'/.exec(await readFile(join(root, 'draw/draw.js'), 'utf8'))?.[1];
	if (lettersAt !== PLUGIN_ORIGIN + 'letters/') throw new Error('Draw letter-set address disagrees with the resource owner');
	const math = bundlePin(loader, 'math', 'MATH_VERSION');
	math.path = join(root, 'shell/vendor', 'rapier-math-' + math.version + '.js');
	math.plugin = 'math'; math.hostFile = 'rapier-math-' + math.version + '.js';
	math.manifestUrl = PLUGIN_ORIGIN + 'math/' + math.hostFile;
	const host = plugin => file => ({...file, plugin, hostFile: file.file.split('/').pop()});
	return [math, ...mermaidResourceFiles(root).map(host('diagrams')), ...fontSubsetResourceFiles(root).map(host('font-subset')),
		...OCR_FILES.map(file => ({id: 'rapier-ocr-' + file.name, plugin: 'ocr', hostFile: file.flat, url: file.url, sri: file.sri, bytes: file.bytes})),
		...LETTER_SETS.map(set => ({id: 'rapier-letters-' + set.id, plugin: 'letters', hostFile: 'letters-' + set.id + '.json',
			url: lettersAt + set.id + '.json', path: join(root, 'draw/letters', set.id + '.json'), sri: set.sha384, bytes: set.bytes})),
		...pdfFiles(JSON.parse(await readFile(join(root, 'interchange/pdf-pins.json'), 'utf8')), PDF_JS_VERSION, root)];
}

const sha384 = bytes => createHash('sha384').update(bytes).digest('base64');
const exact = (file, bytes) => sha384(bytes) === file.sri && (file.bytes == null || bytes.length === file.bytes);

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
		const part = path + '.' + process.pid + '.part';
		await mkdir(dirname(path), {recursive: true});
		await writeFile(part, bytes);
		await rename(part, path);
	}
	return {bytes, fetched: true};
}

export async function stagePluginPack(out) {
	const files = await pluginPackFiles();
	await mkdir(out, {recursive: true});
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
