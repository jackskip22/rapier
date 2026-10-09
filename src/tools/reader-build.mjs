// SPDX-License-Identifier: AGPL-3.0-only
// Builds rapier-reader.html: the shared Markdown renderer, a small interface and the editor's own helpers, in one offline file. It
// reads the editor's sources and keeps what the reader calls (tools/reader-slice.mjs); it copies none of them. Called by
// tools/build.mjs for RAPIER_PROFILE=reader; node tools/reader-build.mjs runs it alone.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';
import acorn from '../agent/vendor/acorn.mjs';
import {VERSION} from '../version.mjs';
import {csp} from '../security/csp.mjs';
import {satelliteSlots} from './engine-slots.mjs';
import {scriptUnits, link, sliceFactory} from './reader-slice.mjs';
import {bundleModules, readNames} from './reader-modules.mjs';
import {readerBlocks, spriteFor, dropElements, readerTokenCss, checkReaderPackage} from './reader-profile.mjs';
import {readerStyles} from './reader-css.mjs';
import {zopfliGzip, FAST_PACK} from './zopfli.mjs';
import {encodeBase124} from './base124.mjs';
import {minifyVendor, BROWSER_MINIFY} from './minify-vendor.mjs';
import {entitiesVendor} from './entities-vendor.mjs';
import {fillMermaidResources} from './mermaid-resources.mjs';
import {builtPlugin, readerPluginLoader, pluginManifest, BUILT_STORES} from './reader-plugins.mjs';
import {SIZE_BUDGETS} from './profile-budgets.mjs';

const {minify} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');

// The renderer's factories (kit/render*.mjs), each cut to the parts a reader calls: [file, factory, [names the reader keeps]].
// `_rapierRenderModule` is written from what the linked text asks of each, so this table grows only when the reader does.
const KIT = {
	'render-sanitize': ['kit/render-sanitize.mjs', 'createRenderSanitizer'],
	'render-markdown': ['kit/render-markdown.mjs', 'createMarkdownRenderer'],
	'render': ['kit/render.mjs', 'createRenderer'],
};
// The editor's published modules the reader keeps, by the global they are read through; null reads every export.
const MODULES = {
	RapierMarkdownSpec: 'agent/markdown-spec.mjs', RapierMarkdownLayout: 'layout/markdown.mjs', RapierImageAssets: 'spec/md-assets.mjs',
	RapierPreferenceDefinitions: 'shell/preferences.mjs', RapierEmbedContract: 'packages/rapier-embed/contract.mjs',
	RapierImageLayout: 'layout/model.mjs', RapierMdLayoutSpec: 'spec/md-layout.mjs', RapierPretext: 'agent/vendor/pretext/rich-inline.js',
};
const READ_ALL = new Set(['RapierImageLayout', 'RapierMdLayoutSpec', 'RapierPretext']);
// The globals the reader page publishes from its module table; tools/check-shipped-capabilities.mjs requires every one in the built page.
export const READER_CAPABILITIES = Object.freeze(Object.keys(MODULES));
// The native flowchart is a plug-in file: Draw's SVG builder with the flowchart reader, fetched the first time a document holds a flowchart
// (tools/reader-plugins.mjs). It is built here because its pin goes into the page's loader.
const FLOWCHART_MODULES = {RapierFlowchart: 'draw/flowchart.mjs'};
const FLOWCHART_READS = new Set(['parseFlowchart', 'renderFlowchart']);
// The PDF reader plug-in carries the editor's own PDF reading and holds the pdf.js files (see reader/pdf.js).
const PDF_MODULES = {RapierPdf: 'interchange/pdf.mjs'};
// The Word reader plug-in carries the editor's Word importer and the Turndown writer (see reader/docx.js).
const DOCX_MODULES = {RapierDocxImport: 'interchange/docx.mjs'};
const DOCX_READS = new Set(['readDocx', 'finishDocxMarkdown']);
// What the linked text may read that no source gives it: the browser's own names and the optional plug-ins' publications.
const BROWSER = new Set(('window document globalThis self location navigator history localStorage sessionStorage console performance crypto Node Element HTMLElement HTMLInputElement ' +
	'Range Highlight CSS CSSStyleSheet DOMParser URL URLSearchParams TextEncoder TextDecoder Blob Response FontFace Image Event CustomEvent MessageChannel DecompressionStream ' +
	'NodeFilter ResizeObserver IntersectionObserver MutationObserver matchMedia getComputedStyle requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval ' +
	'queueMicrotask addEventListener removeEventListener postMessage fetch atob btoa structuredClone indexedDB caches isSecureContext DOMException AbortController Promise Math JSON Object ' +
	'Array String Number Boolean Symbol Map Set WeakMap WeakSet WeakRef Error TypeError RangeError SyntaxError Date RegExp Intl Uint8Array Uint16Array Uint32Array Int8Array Float32Array ' +
	'Float64Array ArrayBuffer DataView Reflect Proxy parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape undefined NaN Infinity ' +
	'BigInt Function eval OffscreenCanvas ImageData createImageBitmap ImageDecoder Worker SharedWorker WebAssembly speechSynthesis SpeechSynthesisUtterance getSelection devicePixelRatio ' +
	'innerWidth innerHeight scrollX scrollY open close focus blur alert parent top frames opener name length origin visualViewport screen File print').split(' '));

async function read(path) { return readFile(resolve(here, path), 'utf8'); }

// ── The editor's own source as units to link against: the engine with its satellites in their slots, and the platform stage.
async function engineUnits() {
	let text = await read('editor/engine.js');
	const modules = new Map();
	for (const [slot, path, selected] of satelliteSlots) {
		if (!modules.has(path)) { const source = await read(path); modules.set(path, {source, tree: acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'})}); }
		const {source, tree} = modules.get(path);
		const names = node => node.type === 'FunctionDeclaration' ? [node.id.name] : node.type === 'VariableDeclaration' ? node.declarations.map(row => row.id.name) : [];
		const kept = tree.body.filter(node => names(node).length && (!selected || names(node).some(name => selected.includes(name))));
		if (!kept.length) throw new Error('Engine slot ' + slot + ' names nothing in ' + path);
		const marker = '/* RAPIER_' + slot + '_MODULE */';
		if (text.split(marker).length !== 2) throw new Error('editor/engine.js must carry ' + marker + ' once');
		text = text.replace(marker, () => source.slice(kept[0].start, kept.at(-1).end));
	}
	return scriptUnits(text, {iife: true, file: 'editor/engine.js'});
}

async function platformUnits() { return scriptUnits(await read('shell/platform.js'), {iife: false, file: 'shell/platform.js'}); }
// The pop-ups' one layout (editor/pop.js): the editor's own file, whose arrangement a reader's prompts share.
async function popUnits() { return scriptUnits(await read('editor/pop.js'), {iife: false, file: 'editor/pop.js'}); }

// RapierStorage as the plug-in loader reads it: the names of the stores the editor and the reader share for plug-ins (a person who
// installed one in the editor has it here). Read from shell/platform.js, never typed again.
async function storageSource() {
	const ast = acorn.parse(await read('shell/platform.js'), {ecmaVersion: 'latest', sourceType: 'script'});
	let optional = null;
	const find = node => {
		if (!node || typeof node.type !== 'string' || optional) return;
		if (node.type === 'Property' && node.key.name === 'optional' && node.value.type === 'CallExpression') optional = node.value.arguments[0];
		for (const [key, value] of Object.entries(node)) if (key !== 'loc') (Array.isArray(value) ? value : [value]).forEach(child => child && typeof child === 'object' && find(child));
	};
	find(ast);
	if (optional?.type !== 'ObjectExpression') throw new Error('shell/platform.js no longer declares RapierStorage.optional');
	const rows = optional.properties.filter(row => row.value.type === 'Literal' && /^(?:math|mermaid)/.test(row.key.name)).map(row => row.key.name + ': ' + JSON.stringify(row.value.value));
	if (rows.length < 4) throw new Error('shell/platform.js RapierStorage.optional lost the math or diagram stores');
	rows.push(...Object.entries(BUILT_STORES).map(([name, value]) => name + ': ' + JSON.stringify(value)));
	return 'const RapierStorage = Object.freeze({optional: Object.freeze({' + rows.join(', ') + '})});';
}

// What each factory is asked for, from the linked text: `_rapierRenderModule('kind').name`, `const {a} = _rapierRenderModule('kind')`, and
// the same through a variable that holds the call.
function kitUses(text) {
	const ast = acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'script'}), uses = new Map(Object.keys(KIT).map(kind => [kind, new Set()])), aliases = new Map();
	const isCall = node => node?.type === 'CallExpression' && node.callee.name === '_rapierRenderModule' && node.arguments[0]?.type === 'Literal' && uses.has(node.arguments[0].value);
	const walk = (node, parent) => {
		if (!node || typeof node.type !== 'string') return;
		if (isCall(node)) {
			const kind = node.arguments[0].value;
			if (parent?.type === 'MemberExpression' && parent.object === node && !parent.computed) uses.get(kind).add(parent.property.name);
			else if (parent?.type === 'VariableDeclarator' && parent.init === node) {
				if (parent.id.type === 'Identifier') aliases.set(parent.id.name, kind);
				else if (parent.id.type === 'ObjectPattern') parent.id.properties.forEach(row => uses.get(kind).add(row.key.name));
			}
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end') continue;
			if (Array.isArray(value)) value.forEach(child => walk(child, node)); else if (value && typeof value === 'object') walk(value, node);
		}
	};
	walk(ast, null);
	const aliasWalk = node => {
		if (!node || typeof node.type !== 'string') return;
		if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && aliases.has(node.object.name)) uses.get(aliases.get(node.object.name)).add(node.property.name);
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end') continue;
			if (Array.isArray(value)) value.forEach(aliasWalk); else if (value && typeof value === 'object') aliasWalk(value);
		}
	};
	if (aliases.size) aliasWalk(ast);
	return uses;
}

// `_rapierRenderModule`, written from the ports each cut factory asks for. A port is passed by its name when anything in the linked
// text declares it, and as undefined otherwise: the factories were written for hosts that supply some and not others.
function renderModuleSource(slices) {
	const cases = Object.entries(slices).map(([kind, slice]) => {
		const ports = slice.ports.map(name => name + ': typeof ' + name + " === 'undefined' ? undefined : " + name);
		return "\t\tcase '" + kind + "': return " + slice.factory + '({' + ports.join(', ') + '});';
	});
	return 'const _rapierRenderModules = {};\nfunction _rapierRenderModule(kind) {\n\tif (_rapierRenderModules[kind]) return _rapierRenderModules[kind];\n\tswitch (kind) {\n' +
		cases.map(row => row.replace('\t\tcase', '\tcase').replace('return ', 'return _rapierRenderModules[kind] = ')).join('\n') + "\n\t\tdefault: throw new Error('Unknown render owner');\n\t}\n}\n";
}

const wrapModule = (factory, text) => 'const ' + factory + ' = (() => {\n' + text + '\nreturn ' + factory + ';\n})();';

// ── The page.
export async function buildReader({root = here, unchecked = []} = {}) {
	const started = Date.now(), report = {};
	const ui = await read('editor/ui.html');
	const {markup: blocks, licenses, sprite} = readerBlocks(ui);

	// 1. Fragments the reader writes, and the optional plug-in loader as the editor ships it.
	const fragment = async path => '/* ' + path + ' */\n' + await read(path);
	const hostText = await fragment('reader/host.js'), ownText = hostText + '\n' + await fragment('reader/embed.js') + '\n' + await fragment('reader/app.js');
	// The plug-in files this build makes (tools/reader-plugins.mjs): each is minified, then pinned by its bytes.
	const squeeze = async text => process.env.RAPIER_READER_NOMINIFY === '1' ? text : (await minify(text, {compress: {passes: 2, ecma: 2022}, mangle: true, ecma: 2022, format: {comments: (_, row) => /@license|@preserve|SPDX-License-Identifier|^!/.test(row.value), ascii_only: false}})).code;
	const flowRegistry = await bundleModules({root, entries: FLOWCHART_MODULES, used: new Map([['RapierFlowchart', FLOWCHART_READS]])});
	const flowText = "(() => {\n'use strict';\n" + flowRegistry.text + '\n})();';
	new vm.Script(flowText, {filename: 'rapier-flowchart.js'});
	const flowFile = Buffer.from('/* SPDX-License-Identifier: AGPL-3.0-only. The Rapier flowchart plug-in: Mermaid flowchart syntax drawn by Rapier\'s own SVG engine. */\n' + await squeeze(flowText) + '\n');
	const pdfRegistry = await bundleModules({root, entries: PDF_MODULES, used: new Map([['RapierPdf', null]])});
	const pdfPlugin = await read('interchange/pdf-plugin.js');
	const pdfText = "(() => {\n'use strict';\n" + pdfRegistry.text + '\n' + pdfPlugin + '\n' + await read('reader/pdf.js') + '\n})();';
	new vm.Script(pdfText, {filename: 'rapier-pdf.js'});
	const pdfFile = Buffer.from('/* SPDX-License-Identifier: AGPL-3.0-only. The Rapier PDF reader plug-in: opens a PDF as a Markdown document. */\n' + await squeeze(pdfText) + '\n');
	const docxRegistry = await bundleModules({root, entries: DOCX_MODULES, used: new Map([['RapierDocxImport', DOCX_READS]])});
	const turndownText = (await read('shell/vendor/turndown-7.2.4.lib.turndown.browser.umd.js'));
	// Turndown's UMD wrapper publishes on `self` when it finds no module system.
	const docxText = "(() => {\n'use strict';\n" + turndownText + '\n' + docxRegistry.text + '\n' + await read('reader/docx.js') + '\n})();';
	new vm.Script(docxText, {filename: 'rapier-docx.js'});
	const turndownNotice = await mitNotice(entry => /Turndown|collapse-whitespace/.test(entry));
	const docxFile = Buffer.from('/* SPDX-License-Identifier: AGPL-3.0-only. The Rapier Word reader plug-in: opens a .docx as a Markdown document.\n   It carries Turndown, under this notice:\n\n' + turndownNotice.replaceAll('*/', '* /') + '\n*/\n' + await squeeze(docxText) + '\n');
	const built = [builtPlugin('flowchart', flowFile, VERSION), builtPlugin('pdf', pdfFile, VERSION), builtPlugin('docx', docxFile, VERSION)], [flowchart, pdf, docx] = built;
	const files = {[flowchart.file]: flowFile, [pdf.file]: pdfFile, [docx.file]: docxFile};
	const loaderSource = await read('shell/plugin-loader.js');
	const pluginParts = (await read('shell/bundle-io.js')) + '\n' + readerPluginLoader(fillMermaidResources(loaderSource), built);
	const storage = await storageSource();

	// 2. Link: the pools, the cut factories and `_rapierRenderModule` settle together (what a factory is asked for may be asked by the
	// editor code its ports pull in).
	// Emitted in this order: the platform stage first, as the page runs it before the engine.
	const pools = [await platformUnits(), await popUnits(), await engineUnits()];
	const kit = {};
	let keep = Object.fromEntries(Object.keys(KIT).map(kind => [kind, new Set()])), linked = null, slices = null, ownScript = '';
	const forbid = ['rapier', '_rapierUi', 'showToast', 'rapierConfirm', 'renderBlock', '_rapierEmbedPublishState'];
	for (let round = 0; round < 8; round++) {
		slices = {};
		for (const [kind, [file, factory]] of Object.entries(KIT)) {
			const names = [...keep[kind]].sort();
			if (!names.length) continue;
			const cut = sliceFactory(await read(file), factory, names, {file});
			const ports = [...cut.text.matchAll(/\{([^{}]*)\} = runtime;/g)].flatMap(match => match[1].split(',').map(part => part.trim().split(':').pop().trim()).filter(Boolean));
			slices[kind] = {factory, ports, text: wrapModule(factory, cut.text)};
			kit[kind] = cut;
		}
		ownScript = [hostText, storage, pluginParts, Object.values(slices).map(slice => slice.text).join('\n'), renderModuleSource(slices), ownText.slice(hostText.length)].join('\n');
		linked = link({own: ownScript, pools, forbid});
		const uses = kitUses(linked.text + '\n' + ownScript);
		let grew = false;
		for (const [kind, names] of uses) for (const name of names) if (!keep[kind].has(name)) { keep[kind].add(name); grew = true; }
		if (!grew && round > 0) break;
	}
	report.unresolved = linked.unresolved.filter(name => !BROWSER.has(name));

	// 3. The editor's published modules, each cut to what the linked text reads.
	const used = new Map();
	const everything = linked.text + '\n' + ownScript;
	for (const global of Object.keys(MODULES)) used.set(global, READ_ALL.has(global) ? null : readNames(everything, global));
	const registry = await bundleModules({root, entries: MODULES, used});
	const script = "'use strict';\n" + registry.text + '\n' + everything;
	new vm.Script('(()=>{' + script + '})', {filename: 'rapier-reader.js'});
	const scriptPackage = process.env.RAPIER_READER_NOMINIFY === '1' ? '(() => {\n' + script + '\n})();' : (await minify('(() => {\n' + script + '\n})();', {
		compress: {passes: 2, ecma: 2022}, mangle: true, ecma: 2022,
		format: {comments: (_, row) => /@license|@preserve|SPDX-License-Identifier|^!/.test(row.value), ascii_only: false},
	})).code;
	report.plugins = Object.fromEntries(built.map(plugin => [plugin.key, {file: plugin.file, bytes: plugin.bytes, gzip: gzipSync(files[plugin.file], {level: 9}).length}]));
	report.used = Object.fromEntries([...used].map(([name, names]) => [name, names ? [...names].sort() : null]));
	report.script = {linked: everything.length, modules: registry.text.length, minified: scriptPackage.length, sizes: registry.sizes, kept: linked.kept.length};

	// 4. The vendor libraries as the editor ships them (pinned, checked, minified as pinned).
	const provenance = JSON.parse(await read('shell/vendor/PROVENANCE.json'));
	const vendor = async names => {
		const parts = [];
		for (const name of names) {
			const bytes = await readFile(resolve(here, 'shell/vendor', name)), record = provenance.files[name];
			if (!record || record.bytes !== bytes.length || record.sha256 !== sha256(bytes)) throw new Error('Vendor file ' + name + ' does not match shell/vendor/PROVENANCE.json');
			const source = bytes.toString('utf8'), minified = minifyVendor(name, source), reencoded = entitiesVendor(name, source);
			parts.push(reencoded?.source ?? (minified === null ? source : minified));
		}
		return parts.join('\n');
	};
	const markdownIt = await vendor(['markdown-it-15.0.2.umd.min.js', 'markdown-it-task-lists-2.1.1.min.js', 'markdown-it-footnote-4.0.0.min.js', 'markdown-it-mark-4.0.0.min.js',
		'markdown-it-sub-2.0.0.min.js', 'markdown-it-sup-2.0.0.min.js', 'markdown-it-emoji-3.1.0-light.min.js', 'markdown-it-abbr-2.0.0.min.js', 'markdown-it-ins-4.0.0.min.js', 'markdown-it-deflist-4.0.0.min.js']);
	const purify = await vendor(['dompurify-3.4.16.dist.purify.min.js']);

	// 5. Markup and styles, cut to what the script and the markup can reach.
	const lazy = licensesSheet(licenses, await read('agent/vendor/pretext/LICENSE'), await mitNotice());
	const sprites = spriteFor(sprite, blocks, lazy, scriptPackage.replace(/['"]#(i-[a-z0-9-]+)['"]/g, 'href="#$1"'));
	const markup = sprites + '\n' + blocks.replace(/\n\s*\n+/g, '\n');
	const words = text => new Set(text.match(/[A-Za-z_][\w-]*/g) || []);
	const vocabulary = new Set([...words(scriptPackage), ...words(markup), ...words(markdownIt), ...words(purify), ...words(lazy)]);
	const css = await readerStyles({vocabulary, tokens: readerTokenCss(), reader: await read('reader/reader.css')});
	report.css = css.report;

	// 6. Pack and write.
	const core = [['css', 'rapier-reader-style', css.text], ['html', 'markup', markup], ['js', 'markdown-it.js', markdownIt], ['js', 'dompurify.js', purify], ['js', 'reader.js', scriptPackage]];
	const packedCore = await pack('rapier-pack', core), packedLicenses = await pack('rapier-pack-licenses', [['html', 'licenses', lazy]]);
	const base124 = (await read('tools/base124.mjs')).replace(/^export /gm, '');
	const decoder = dropFunction(base124, 'encodeBase124');
	const loader = (await minify(decoder + '\n' + await read('reader/loader.js'), {compress: {passes: 2}, mangle: {reserved: ['RapierUnpack']}, format: {comments: false}})).code;
	let html = await read('reader/shell.html');
	const notice = /^<!DOCTYPE html>\n<!--\n[\s\S]*?-->\n/.exec(html)[0];
	await checkNotice(notice);
	const slots = {'<!-- RAPIER_READER_CSP -->': csp('reader'), '<!-- RAPIER_READER_VERSION -->': VERSION, '<!-- RAPIER_READER_PACK -->': packedCore.element + '\n' + packedLicenses.element, '<!-- RAPIER_READER_LOADER -->': loader.replace(/<\/script/gi, '<\\/script')};
	for (const [slot, value] of Object.entries(slots)) {
		if (html.split(slot).length !== 2) throw new Error('reader/shell.html must carry ' + slot + ' once');
		html = html.replace(slot, () => value);
	}
	checkReaderPackage({script: scriptPackage, markup: markup + lazy, css: css.text, html: html.replace(/<script type="application\/rapier-runtime"[\s\S]*?<\/script>/g, '')});
	await writeFile(resolve(root, 'rapier-reader.html'), html);
	// The plug-in files this page pins, and the manifest that names them for a host that serves them itself.
	await mkdir(resolve(root, 'dist/plugins'), {recursive: true});
	for (const [file, bytes] of Object.entries(files)) await writeFile(resolve(root, 'dist/plugins', file), bytes);
	const manifest = await pluginManifest({root, version: VERSION, loader: loaderSource, built});
	await writeFile(resolve(root, 'dist/plugins/rapier-plugins.json'), JSON.stringify(manifest, null, 2) + '\n');
	// A release build also writes the manifest the rapier-embed package ships (its `plugins` command reads it); a development build leaves the
	// package as it is, so the manifest in the package always names a release's files.
	if (!FAST_PACK) await writeFile(resolve(root, 'packages/rapier-embed/rapier-plugins.json'), JSON.stringify(manifest, null, 2) + '\n');

	// 7. The receipt and the numbers.
	const bytes = Buffer.byteLength(html), gz = gzipSync(html, {level: 9}).length;
	const budget = SIZE_BUDGETS.reader;
	if (FAST_PACK) console.warn('RAPIER_PACK=fast: zlib packing for iteration only; ' + bytes + ' bytes is not a release measurement');
	if (bytes >= budget.warn) console.warn('[build] rapier-reader.html is ' + bytes + ' bytes: over the reader\'s ' + budget.warn + '-byte release budget (reported, not refused)');
	await mkdir(resolve(root, 'dist'), {recursive: true});
	let receipt = null;
	try { receipt = JSON.parse(await readFile(resolve(root, 'dist/BUILD.json'), 'utf8')); } catch (_) {}
	const record = {path: 'rapier-reader.html', bytes, sha256: sha256(html), gzip: gz, budget, builtAt: new Date().toISOString(), node: process.version, mode: FAST_PACK ? 'development' : 'release',
		packing: FAST_PACK ? 'fast (zlib; not a release)' : 'zopfli', canonical: false, parts: {core: packedCore.stored, licenses: packedLicenses.stored}};
	await writeFile(resolve(root, 'dist/BUILD.json'), JSON.stringify({...(receipt || {release: VERSION}), release: VERSION, profiles: {...(receipt?.profiles || {}), reader: record}}, null, 2) + '\n');
	report.parts = {core: packedCore, licenses: packedLicenses, markup: markup.length, css: css.text.length, markdownIt: markdownIt.length, purify: purify.length, script: scriptPackage.length, loader: loader.length};
	console.log(JSON.stringify({file: 'rapier-reader.html', bytes, gzip: gz, spans: packedCore.spans, licenseSpans: packedLicenses.spans, seconds: (Date.now() - started) / 1000, unresolved: report.unresolved, used: report.used, plugins: report.plugins,
		script: {...report.script, sizes: undefined}, css: report.css, parts: {core: packedCore.stored, licenses: packedLicenses.stored, markup: markup.length, css: css.text.length, markdownIt: markdownIt.length, purify: purify.length, loader: loader.length}}, null, 1));
	if (process.env.RAPIER_READER_SIZES) {
		// Each part alone, minified and gzipped: a ranking, not an exact share (one stream shares words across parts).
		const cost = async text => { const code = (await minify('(() => {\n' + text + '\n;globalThis.__kept = [' + [...text.matchAll(/^(?:function|const|let|class) ([A-Za-z_$][\w$]*)/gm)].map(match => match[1]).join(',') + '];})();', {compress: {passes: 1}, mangle: true})).code; return [code.length, gzipSync(code, {level: 9}).length]; };
		const parts = {};
		for (const [path, size] of Object.entries(registry.sizes)) parts['module ' + path] = [size, ...(await cost(registry.blocks[path]))];
		for (const [path, size] of Object.entries(flowRegistry.sizes)) parts['flowchart module ' + path] = [size, ...(await cost(flowRegistry.blocks[path]))];
		for (const [path, size] of Object.entries(pdfRegistry.sizes)) parts['pdf module ' + path] = [size, ...(await cost(pdfRegistry.blocks[path]))];
		for (const [kind, cut] of Object.entries(kit)) parts['kit ' + kind] = [cut.text.length, ...(await cost(slices[kind].text))];
		parts['pool (editor units)'] = [linked.text.length, ...(await cost(linked.text))];
		parts['plugin loader'] = [pluginParts.length, ...(await cost(pluginParts))];
		parts['reader code'] = [ownText.length, ...(await cost(ownText))];
		parts['render module + storage'] = [0, ...(await cost(renderModuleSource(slices) + storage))];
		await writeFile(process.env.RAPIER_READER_SIZES, JSON.stringify(Object.fromEntries(Object.entries(parts).map(([name, [raw, min, gz]]) => [name, {raw, minified: min, gzip: gz}])), null, 1));
	}
	if (false) await writeFile(process.env.RAPIER_READER_SIZES, JSON.stringify({sizes: registry.sizes, kept: linked.kept.map(unit => [unit.names.join(','), unit.text.length]), slices: Object.fromEntries(Object.entries(kit).map(([kind, cut]) => [kind, cut.text.length]))}, null, 1));
	return record;
}

// The licences the file carries, as a markup part: the editor's own sheet, cut to the parts this file carries, with the notices of
// what only the reader brings (the layout reflow's Pretext).
function licensesSheet(sheet, pretextLicense, notice) {
	const drop = /Turndown|gpu-lexer|acorn 8|jsdiff|Geist|ONNX|PP-OCR|libjxl|AndroidX|Google Play/;
	let text = dropElements(sheet, (row, markup) => /\blicense-(?:entry|row)\b/.test(row.cls) && drop.test(markup.slice(0, 400)));
	const pretext = '<details class="license-entry"><summary><span class="license-name">Pretext 0.0.9</span><span class="license-id">MIT</span></summary><pre class="license-text">' + escapeHtml(pretextLicense.trim()) + '</pre></details>\n';
	text = text.replaceAll('<pre class="license-text" data-license="rapier-mit"></pre>', () => '<pre class="license-text">' + escapeHtml(notice) + '</pre>');
	text = text.replace('<div class="licenses-list">', () => '<div class="licenses-list">\n' + pretext);
	text = text.replace(/<button type="button" class="licenses-link" data-action="licenses-source">source<\/button>/, '<a class="licenses-link" href="https://github.com/jackskip22/rapier" target="_blank" rel="noopener noreferrer">source</a>');
	text = text.replace('<strong id="licenses-app-title">Rapier ·', () => '<strong id="licenses-app-title">Rapier v' + VERSION + ' ·');
	// Blank lines between tags go; the licence texts keep theirs.
	return text.split(/(<pre[\s\S]*?<\/pre>)/).map((part, at) => at % 2 ? part : part.replace(/\n\s*\n+/g, '\n')).join('');
}
// The notice the editor writes into its MIT entries, cut to the components this file carries: each component is its lines up to its
// copyright line.
async function mitNotice(keep = entry => !/gpu-lexer|acorn|Turndown|collapse-whitespace/.test(entry)) {
	const found = /const RAPIER_MIT_NOTICE = `([^`$\\]*)`;/.exec(await read('editor/engine.js'));
	if (!found) throw new Error('editor/engine.js has no RAPIER_MIT_NOTICE the licences sheet can carry');
	const notice = found[1], mark = 'copyright notice:\n\n', start = notice.indexOf(mark) + mark.length, end = notice.indexOf('\n\nPermission is hereby');
	if (start < mark.length || end < start) throw new Error('editor/engine.js: RAPIER_MIT_NOTICE no longer has a header, a list and the terms');
	const entries = [];
	let current = [];
	for (const line of notice.slice(start, end).split('\n')) { current.push(line); if (/^\tCopyright/.test(line)) { entries.push(current.join('\n')); current = []; } }
	if (current.length) throw new Error('editor/engine.js: RAPIER_MIT_NOTICE lists a component with no copyright line');
	return notice.slice(0, start) + entries.filter(keep).join('\n') + notice.slice(end);
}
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function pack(id, spans) {
	const buffers = spans.map(([, , text]) => Buffer.from(text));
	const combined = Buffer.concat(buffers), gzip = await zopfliGzip(combined), encoded = encodeBase124(gzip);
	const header = JSON.stringify({bytes: combined.length, spans: spans.map(([kind, name], at) => [kind, name, buffers[at].length])});
	return {element: '<script type="application/rapier-runtime" id="' + id + '">' + header + '\n' + encoded + '</script>', stored: {raw: combined.length, gzip: gzip.length, base124: encoded.length}, spans: spans.map(([kind, name], at) => ({name, bytes: buffers[at].length, gzip: gzipSync(buffers[at], {level: 9}).length}))};
}

function dropFunction(text, name) {
	const start = text.indexOf('function ' + name + '(');
	if (start < 0) throw new Error('tools/base124.mjs has no ' + name);
	const docStart = text.lastIndexOf('/**', start), head = docStart >= 0 && !text.slice(docStart, start).includes('\n\n') ? docStart : start;
	const end = text.indexOf('\n}\n', start);
	return text.slice(0, head) + text.slice(end + 3);
}

// The licence notice at the head of the page is the one every Rapier page carries, but for its first line and the way to the source.
async function checkNotice(notice) {
	let shell = null;
	try { shell = await read('rapier.html'); } catch (_) { return; }
	const body = text => text.split('\n').slice(3).filter(line => !/^\t(?:Vendored third-party|Full licence)/.test(line)).join('\n');
	const house = /^<!DOCTYPE html>\n<!--\n[\s\S]*?-->\n/.exec(shell)?.[0];
	if (house && body(house) !== body(notice)) throw new Error('reader/shell.html: the licence notice differs from the one rapier.html carries');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildReader();
