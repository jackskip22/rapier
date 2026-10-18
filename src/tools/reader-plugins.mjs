// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pluginPackFiles, PLUGIN_ORIGIN} from './stage-plugin-pack.mjs';

export {PLUGIN_ORIGIN};

const digest = bytes => createHash('sha384').update(bytes).digest();

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
	return {key, version, file, bytes: bytes.length, sri: sum.toString('base64'), sha384: sum.toString('hex'), url: PLUGIN_ORIGIN + PLUGINS[key].folder + '/' + file, ...PLUGINS[key]};
}

const replaceOnce = (text, from, to, what) => {
	if (text.split(from).length !== 2) throw new Error('Reader plug-ins: shell/plugin-loader.js no longer has ' + what + '; the reader\'s own plug-ins cannot be placed');
	return text.replace(from, () => to);
};

export function readerPluginLoader(loader, built) {
	const definition = plugin => [
		'\t// ---- ' + plugin.name + '. One file, pinned by the build that wrote this page.',
		'\t_rapierVerifiedFiles({',
		'\t\tkey: ' + JSON.stringify(plugin.key) + ', noun: ' + JSON.stringify(plugin.noun) + ', dash: \' \\u2014 \',',
		'\t\tversion: ' + JSON.stringify(plugin.version) + ',',
		'\t\tfiles: [' + JSON.stringify({name: plugin.file, file: plugin.file, url: plugin.url, bytes: plugin.bytes, sri: plugin.sri}) + '],',
		'\t\tmissing: ' + JSON.stringify('The ' + plugin.noun + ' loaded but is incomplete \u2014 removed') + ',',
		'\t\tusable: function () { return ' + plugin.usable + '; },',
		'\t});',
		'',
	].join('\n');
	return replaceOnce(loader, '\twindow.RapierPluginLoader = Object.freeze({files: _rapierVerifiedFiles, portable});', built.map(definition).join('') + '\twindow.RapierPluginLoader = Object.freeze({files: _rapierVerifiedFiles, portable});', 'the loader\'s export');
}

const entry = ({hostFile, file, bytes, sri, url, manifestUrl}, builds) => ({file: hostFile || file.split('/').pop(), bytes, sha384: Buffer.from(sri, 'base64').toString('hex'), sri, url: manifestUrl || url, ...(builds ? {builds} : {})});
const BUILDS = ['reader', 'full'];

export function builtFromManifest(manifest) {
	return ['flowchart', 'docx', 'pdf'].map(key => {
		const file = manifest.plugins?.find(plugin => plugin.name === key)?.files?.[0];
		if (!file) throw new Error('the manifest has no ' + key + ' plug-in file');
		return {key, ...file};
	});
}

export async function pluginManifest({root, version, loader, built}) {
	const files = await pluginPackFiles({root, loader});
	const {OCR_MODEL} = await import(pathToFileURL(resolve(root, 'images/ocr.mjs')).href), {LETTER_SETS} = await import(pathToFileURL(resolve(root, 'draw/letters.mjs')).href);
	const {BORDER_PINS, ELEMENT_PINS} = await import(pathToFileURL(resolve(root, 'presets/pins.mjs')).href);
	const shared = name => files.filter(file => file.plugin === name).map(file => entry(file));
	const own = (key, builds) => ({name: key, adds: PLUGINS[key].adds, builds, files: [entry(built.find(plugin => plugin.key === key))]});
	const plugins = [
		own('flowchart', ['reader']),
		own('docx', ['reader']),
		{name: 'math', adds: 'Typesets TeX math ($...$ and $$...$$) as SVG.', builds: BUILDS, files: shared('math')},
		{name: 'diagrams', adds: 'Draws every other Mermaid diagram: sequence, class, state, ER, Gantt, pie and more.', builds: BUILDS, files: shared('diagrams')},
		{name: 'pdf', adds: PLUGINS.pdf.adds, builds: BUILDS, files: [entry(built.find(plugin => plugin.key === 'pdf'), ['reader']),
			...shared('pdf')]},
		{name: 'ocr', adds: 'Reads the words in pictures on the device (' + OCR_MODEL + ' on ONNX Runtime Web), so search finds them. About 21 MB.', builds: BUILDS, files: shared('ocr')},
		{name: 'font-subset', adds: 'Keeps the used characters in fonts embedded in exported pages.', builds: ['full'],
			files: shared('font-subset')},
		{name: 'letters', adds: 'Draw\'s ornamental letter sets: ' + LETTER_SETS.map(set => set.name).join(', ') + '.', builds: ['full'],
			files: shared('letters')},
		{name: 'templates', adds: 'Starters\' traced page borders: ' + BORDER_PINS.length + ' borders from the ornament book.', builds: ['full'], files: shared('templates')},
		{name: 'elements', adds: 'The Elements sheet\'s traced ornaments: ' + ELEMENT_PINS.reduce((sum, pack) => sum + pack.items, 0).toLocaleString('en-US') + ' pieces from the ornament book.', builds: ['full'], files: shared('elements')},
	];
	for (const plugin of plugins) for (const file of plugin.files) if (!file.file || file.file.startsWith('/') || file.file.includes('..')) throw new Error('Reader plug-ins: ' + plugin.name + ' names a file that cannot sit in a directory: ' + file.file);
	const names = plugins.flatMap(plugin => plugin.files.map(file => file.file));
	const twice = names.find((name, at) => names.indexOf(name) !== at);
	if (twice) throw new Error('Reader plug-ins: two plug-in files are both named ' + twice + ' in the directory');
	return {schema: 1, release: version, directory: 'Put every file in one directory, keeping each file\'s folder, and give the page its address with `plugins`. The reader and the full editor read the same directory; `builds` says which use a plug-in.', plugins};
}
