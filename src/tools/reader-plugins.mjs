// SPDX-License-Identifier: AGPL-3.0-only
// The plug-ins. A plug-in is a file the page fetches on demand, pinned by its length and SHA-384 and verified from the bytes it holds
// (shell/plugin-loader.js). A page reads each from its pinned address, or, when its host names a directory with `plugins`
// (shell/bundle-io.js `pluginUrl`), from that directory alone. This module gives the reader's copy of the loader the plug-ins only the reader
// has, and writes the one manifest a host's agent reads to fetch exactly the files a build uses (`npx rapier-embed plugins`).
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Where the pinned files are published (the address each pin names). A release publishes the files this build writes under these names.
export const PLUGIN_ORIGIN = 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@main/';

const digest = bytes => createHash('sha384').update(bytes).digest();

// Plug-ins this build makes: one file each, pinned by the bytes the build wrote, so the loader and the manifest name the file as it is.
//   flowchart: Rapier's own drawing of Mermaid flowcharts.
//   pdf: the PDF reader's own part (the page reading and the checked set of pdf.js files, which it fetches itself).
const PLUGINS = {
	flowchart: {noun: 'flowchart', name: 'the flowchart renderer', folder: 'flowchart', adds: 'Draws Mermaid flowcharts and graphs natively, in the editor\'s own style.',
		usable: "!!(window.RapierFlowchart && typeof window.RapierFlowchart.renderFlowchart === 'function' && typeof window.RapierFlowchart.parseFlowchart === 'function')"},
	docx: {noun: 'Word reader', name: 'the Word reader', folder: 'docx', adds: 'Opens a Word document (.docx) as a Markdown document: headings, lists, tables, pictures and comments.',
		usable: "!!(window.RapierDocxReader && typeof window.RapierDocxReader.read === 'function')"},
	pdf: {noun: 'PDF reader', name: 'the PDF reader', folder: 'pdf', adds: 'Opens a PDF as a Markdown document: its text layer, or each page as a picture. Fetches the pdf.js files itself.',
		usable: "!!(window.RapierPdfReader && window.RapierPdfReader.plugin && typeof window.RapierPdfReader.read === 'function')"},
};
export function builtPlugin(key, bytes, version) {
	const file = 'rapier-' + key + '-' + version + '.js', sum = digest(bytes);
	return {key, version, file, bytes: bytes.length, sri: sum.toString('base64'), sha384: sum.toString('hex'), url: PLUGIN_ORIGIN + PLUGINS[key].folder + '/' + file, cacheKey: 'rapier-' + key + '-v' + version, ...PLUGINS[key]};
}

const replaceOnce = (text, from, to, what) => {
	if (text.split(from).length !== 2) throw new Error('Reader plug-ins: shell/plugin-loader.js no longer has ' + what + '; the reader\'s own plug-ins cannot be placed');
	return text.replace(from, () => to);
};

// The reader's copy of the plug-in loader: the editor's loader, and the plug-ins only the reader has (the flowchart, the PDF reader and the
// Word reader) defined beside the ones it shares. The `plugins` setting is the loader's own (shell/bundle-io.js `pluginUrl`).
export function readerPluginLoader(loader, built) {
	const definition = plugin => [
		'\t// ---- ' + plugin.name + '. One file, pinned by the build that wrote this page.',
		'\t_rapierVerifiedPlugin({',
		'\t\tkey: ' + JSON.stringify(plugin.key) + ', noun: ' + JSON.stringify(plugin.noun) + ', name: ' + JSON.stringify(plugin.name) + ', dash: \' \\u2014 \',',
		'\t\tversion: ' + JSON.stringify(plugin.version) + ',',
		'\t\tcdn: ' + JSON.stringify(plugin.url) + ',',
		'\t\tfile: ' + JSON.stringify(plugin.file) + ',',
		'\t\tbytes: ' + plugin.bytes + ',',
		'\t\tsri: ' + JSON.stringify(plugin.sri) + ',',
		'\t\tcacheKey: ' + JSON.stringify(plugin.cacheKey) + ',',
		'\t\tmissing: ' + JSON.stringify('The ' + plugin.noun + ' loaded but is incomplete \u2014 removed') + ',',
		'\t\tusable: function () { return ' + plugin.usable + '; },',
		'\t\trender: function () { throw new Error(\'this plug-in is not a renderer\'); },',
		'\t});',
		'',
	].join('\n');
	return replaceOnce(loader, '\twindow.RapierPluginLoader = Object.freeze({ files: _rapierVerifiedFiles });', built.map(definition).join('') + '\twindow.RapierPluginLoader = Object.freeze({ files: _rapierVerifiedFiles });', 'the loader\'s export');
}

// The names RapierStorage keeps these plug-ins' copies under, beside the editor's (the plug-in loader reads `<key>Db` and `<key>LocalPrefix`).
export const BUILT_STORES = {flowchartDb: 'rapier:cache:flowchart', flowchartLocalPrefix: 'rapier:cache:flowchart:', pdfDb: 'rapier:cache:pdf', pdfLocalPrefix: 'rapier:cache:pdf:', docxDb: 'rapier:cache:docx', docxLocalPrefix: 'rapier:cache:docx:'};

// The pins the loader holds for maths, read from the loader itself.
function mathPlugin(loader) {
	const block = /key: 'math'[\s\S]*?cacheKey/.exec(loader)?.[0] || '', field = (name, pattern) => { const found = pattern.exec(block); if (!found) throw new Error('Reader plug-ins: the loader no longer pins the maths ' + name); return found[1]; };
	const version = /var MATHJAX_VERSION = '([^']+)'/.exec(loader)?.[1];
	if (!version) throw new Error('Reader plug-ins: the loader no longer names the MathJax version');
	const file = 'mathjax-' + version + '.offline-svg.js', sri = field('SHA-384', /sri: '([A-Za-z0-9+/=]+)'/);
	return {file, bytes: Number(field('length', /bytes: (\d+)/)), sri, url: PLUGIN_ORIGIN + 'math/' + file};
}

const entry = ({file, bytes, sri, url}, builds) => ({file: file.split('/').pop(), bytes, sha384: Buffer.from(sri, 'base64').toString('hex'), sri, url, ...(builds ? {builds} : {})});
const BUILDS = ['reader', 'document', 'full'];

// The three files the release build writes, as a manifest already names them (for checking the rest of a manifest against the sources).
export function builtFromManifest(manifest) {
	return ['flowchart', 'docx', 'pdf'].map(key => {
		const file = manifest.plugins?.find(plugin => plugin.name === key)?.files?.[0];
		if (!file) throw new Error('the manifest has no ' + key + ' plug-in file');
		return {key, ...file};
	});
}

// The manifest: every plug-in file a page can ask for, as it pins it. A file is named by its last path segment, which is where a page looks for
// it under the host's directory (the PDF reader's pdf.js set keeps its `pdfjs-dist-<version>/` folder). `builds` says which pages use a
// plug-in (a file's own `builds` narrows its plug-in's): the reader, the document editor and the full editor.
export async function pluginManifest({root, version, loader, built}) {
	const mermaid = JSON.parse(await readFile(resolve(root, 'shell/mermaid-resources.json'), 'utf8')), pdfjs = JSON.parse(await readFile(resolve(root, 'interchange/pdf-pins.json'), 'utf8'));
	const {OCR_FILES, OCR_MODEL} = await import(pathToFileURL(resolve(root, 'notes/ocr.mjs')).href), {LETTER_SETS} = await import(pathToFileURL(resolve(root, 'draw/letters.mjs')).href);
	const lettersAt = /const RAPIER_DRAW_LETTERS_URL = '([^']+)'/.exec(await readFile(resolve(root, 'draw/draw.js'), 'utf8'))?.[1];
	if (lettersAt !== PLUGIN_ORIGIN + 'letters/') throw new Error('Reader plug-ins: draw/draw.js fetches the letter sets from ' + lettersAt + ', not ' + PLUGIN_ORIGIN + 'letters/');
	const own = (key, builds) => ({name: key, adds: PLUGINS[key].adds, builds, files: [entry(built.find(plugin => plugin.key === key))]});
	const plugins = [
		own('flowchart', ['reader']),
		own('docx', ['reader']),
		{name: 'math', adds: 'Typesets TeX maths ($...$ and $$...$$) as SVG.', builds: BUILDS, files: [entry(mathPlugin(loader))]},
		{name: 'diagrams', adds: 'Draws every other Mermaid diagram: sequence, class, state, ER, Gantt, pie and more.', builds: BUILDS, files: mermaid.files.map(file => entry({file: file.file, bytes: file.bytes, sri: file.sri, url: file.url}))},
		// The PDF reader: the reader's own page reading (a file of its own), and the pdf.js files every build fetches from the
		// `pdfjs-dist-<version>` directory (each file in its folder).
		{name: 'pdf', adds: PLUGINS.pdf.adds, builds: BUILDS, files: [entry(built.find(plugin => plugin.key === 'pdf'), ['reader']),
			...pdfjs.files.map(([path, bytes, sri]) => ({file: 'pdfjs-dist-' + pdfjs.version + '/' + path, bytes, sha384: Buffer.from(sri, 'base64').toString('hex'), sri, url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + pdfjs.version + '/' + path}))]},
		// Text in pictures (Notes): the model and its runtime, run in a worker with no network of its own.
		{name: 'ocr', adds: 'Reads the words in pictures on the device (' + OCR_MODEL + ' on ONNX Runtime Web), so search finds them. About 21 MB.', builds: ['full'], files: OCR_FILES.map(file => entry({file: file.flat, bytes: file.bytes, sri: file.sri, url: file.url}))},
		// Draw's letter sets: ornamental capitals, a file a set.
		{name: 'letters', adds: 'Draw\'s ornamental letter sets: ' + LETTER_SETS.map(set => set.name).join(', ') + '.', builds: ['full'],
			files: LETTER_SETS.map(set => entry({file: 'letters-' + set.id + '.json', bytes: set.bytes, sri: set.sha384, url: PLUGIN_ORIGIN + 'letters/' + set.id + '.json'}))},
	];
	for (const plugin of plugins) for (const file of plugin.files) if (!file.file || file.file.startsWith('/') || file.file.includes('..')) throw new Error('Reader plug-ins: ' + plugin.name + ' names a file that cannot sit in a directory: ' + file.file);
	const names = plugins.flatMap(plugin => plugin.files.map(file => file.file));
	const twice = names.find((name, at) => names.indexOf(name) !== at);
	if (twice) throw new Error('Reader plug-ins: two plug-in files are both named ' + twice + ' in the directory');
	return {schema: 1, release: version, directory: 'Put every file in one directory, keeping each file\'s folder, and give the page its address with `plugins`. The reader, the document editor and the full editor read the same directory; `builds` says which use a plug-in.', plugins};
}
