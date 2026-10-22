// SPDX-License-Identifier: AGPL-3.0-only
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
import {entitiesVendor} from './entities-vendor.mjs';
import {fillMermaidResources} from './mermaid-resources.mjs';
import {readerPluginLoader, pluginManifest} from './reader-plugins.mjs';
import {fillMathLicense} from './build-math.mjs';
import {SIZE_BUDGETS, checkProfileSize} from './profile-budgets.mjs';
import {readBuildNotice, buildReceiptTimestamp, buildTimingNow} from './build-reuse.mjs';
import {squeezed, mitNotice} from './reader-build-shared.mjs';
import {buildReaderPlugins} from './reader-plugin-generator.mjs';

const {minify} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const KIT = {
	'render-sanitize': ['kit/render-sanitize.mjs', 'createRenderSanitizer'],
	'render-markdown': ['kit/render-markdown.mjs', 'createMarkdownRenderer'],
	'render': ['kit/render.mjs', 'createRenderer'],
};
const MODULES = {
	RapierMarkdownSpec: 'agent/markdown-spec.mjs', RapierMarkdownLayout: 'layout/markdown.mjs', RapierImageAssets: 'images/assets.mjs',
	RapierTypography: 'layout/typography.mjs',
	RapierOcr: 'images/ocr.mjs', RapierPictureMarks: 'images/picture-marks.mjs',
	RapierPreferenceDefinitions: 'shell/preferences.mjs', RapierEmbedContract: 'packages/rapier-embed/contract.mjs',
	RapierImageLayout: 'layout/model.mjs', RapierMdLayoutSpec: 'spec/md-layout.mjs',
	RapierTextPreparation: 'layout/preparation.mjs',
	RapierHtmlBlocks: 'spec/html-blocks.mjs',
};
const READ_ALL = new Set(['RapierOcr']);
const PLANNER_EXPORTS = {
	RapierImageLayout: ['alphaProfile', 'boxClearance', 'edgeLines', 'edgeMarks', 'flowLines', 'frameScale', 'imageBox', 'imageOnly', 'lineMetrics', 'linesSlices', 'linesTop', 'mapFragment', 'parseProfile', 'pictureSlices', 'polygonProfile', 'rasterReserved', 'rasterTiltProfile', 'rotatedBoundsRad', 'rotatedRasterAlpha', 'serializeProfile', 'wrapShape'],
	RapierMdLayoutSpec: ['formatLayout', 'objectHeight', 'parseLayout', 'parseLayoutAttribute', 'wrapColumnFloor', 'wrapNeighbour', 'wrapTextBlock'],
	RapierTextPreparation: ['captureFontAuthority', 'createPreparationScope', 'fontReady', 'invalidateRichMetrics', 'paragraphItems', 'prepareRichParagraph', 'supportsRichStyle'],
};
export const READER_CAPABILITIES = Object.freeze(Object.keys(MODULES));
const BROWSER = new Set(('window document globalThis self location navigator history localStorage sessionStorage console performance crypto Node Element HTMLElement HTMLInputElement ' +
	'Range Highlight CSS CSSStyleSheet DOMParser URL URLSearchParams TextEncoder TextDecoder Blob Response FontFace Image Event CustomEvent MessageChannel DecompressionStream CompressionStream AbortSignal requestIdleCallback ' +
	'NodeFilter ResizeObserver IntersectionObserver MutationObserver matchMedia getComputedStyle requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval ' +
	'queueMicrotask addEventListener removeEventListener postMessage fetch atob btoa structuredClone indexedDB caches isSecureContext DOMException AbortController Promise Math JSON Object ' +
	'Array String Number Boolean Symbol Map Set WeakMap WeakSet WeakRef Error TypeError RangeError SyntaxError Date RegExp Intl Uint8Array Uint16Array Uint32Array Int8Array Float32Array ' +
	'Float64Array ArrayBuffer DataView Reflect Proxy parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape undefined NaN Infinity ' +
	'BigInt Function eval OffscreenCanvas ImageData createImageBitmap ImageDecoder Worker SharedWorker WebAssembly speechSynthesis SpeechSynthesisUtterance getSelection devicePixelRatio ' +
	'innerWidth innerHeight scrollX scrollY open close focus blur alert parent top frames opener name length origin visualViewport screen File print').split(' '));

async function read(path) { return readFile(resolve(here, path), 'utf8'); }

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
async function sharedUnits(file) { return scriptUnits(await read(file), {iife: false, file}); }

async function renderWorkUnits() {
	const file = 'kit/render-work.mjs', source = await read(file);
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
	const text = ast.body.map(node => {
		if (node.type === 'ExportNamedDeclaration' && node.declaration) return source.slice(node.declaration.start, node.declaration.end);
		if (/^Import|^Export/.test(node.type)) throw new Error(file + ': unexpected module dependency');
		return source.slice(node.start, node.end);
	}).join('\n');
	return scriptUnits(text, {file});
}

async function renderFactorySlice(file, factory, names) {
	let source = await read(file);
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'}), unpooled = [];
	const exportImports = new Set(['../spec/md-marks.mjs', '../spec/document-fonts.mjs',
		'./export-fonts.mjs', '../spec/document-settings.mjs', '../layout/typography.mjs', '../layout/model.mjs', '../layout/preparation.mjs',
		'./print-capitals.mjs', './render-ink.mjs', '../spec/template-page.mjs']);
	for (const node of ast.body.filter(node => node.type === 'ImportDeclaration').reverse()) {
		if (node.source.value === '../spec/md-marks.mjs' && node.specifiers.length &&
			node.specifiers.every(row => row.type === 'ImportSpecifier' && row.imported.name === 'typography' && row.local.name === 'typography')) {
			source = source.slice(0, node.start) + 'const typography = globalThis.RapierMarkdownSpec.typography;' + source.slice(node.end);
			continue;
		}
		if (node.source.value === '../spec/html-blocks.mjs' && node.specifiers.every(row => row.type === 'ImportSpecifier')) {
			const names = node.specifiers.map(row => row.imported.name + ':' + row.local.name).join(',');
			source = source.slice(0, node.start) + 'const {' + names + '} = globalThis.RapierHtmlBlocks;' + source.slice(node.end);
			continue;
		}
		const pooled = node.source.value === './render-work.mjs';
		if (!pooled && !(file === 'kit/render.mjs' && exportImports.has(node.source.value)) || !node.specifiers.length ||
			node.specifiers.some(row => row.type !== 'ImportSpecifier' || row.imported.name !== row.local.name)) {
			throw new Error(file + ': a factory import has no reader source pool: ' + node.source.value);
		}
		if (!pooled) unpooled.push(...node.specifiers.map(row => row.local.name));
		source = source.slice(0, node.start) + source.slice(node.start, node.end).replace(/[^\n]/g, ' ') + source.slice(node.end);
	}
	const cut = sliceFactory(source, factory, names, {file});
	const free = scriptUnits(cut.text, {file}).free;
	const missing = unpooled.filter(name => free.has(name));
	if (missing.length) throw new Error(file + ': a factory import has no reader source pool: ' + missing.join(', '));
	return cut;
}

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

async function kitExports() {
	const exports = {};
	for (const [kind, [file, factory]] of Object.entries(KIT)) {
		const node = acorn.parse(await read(file), {ecmaVersion: 'latest', sourceType: 'module'}).body.find(row => row.type === 'FunctionDeclaration' && row.id.name === factory);
		const returned = node.body.body.findLast(row => row.type === 'ReturnStatement').argument;
		exports[kind] = new Set(returned.properties.filter(row => row.key).map(row => row.key.name));
	}
	return exports;
}

function renderModuleSource(slices, exports) {
	const cases = Object.entries(slices).map(([kind, slice]) => {
		const ports = slice.ports.map(name => {
			const owner = Object.keys(exports).find(other => other !== kind && exports[other].has(name));
			return name + ': ' + (owner ? "(...args) => _rapierRenderModule('" + owner + "')." + name + '(...args)' : 'typeof ' + name + " === 'undefined' ? undefined : " + name);
		});
		return "\t\tcase '" + kind + "': return " + slice.factory + '({' + ports.join(', ') + '});';
	});
	return 'const _rapierRenderModules = {};\nfunction _rapierRenderModule(kind) {\n\tif (_rapierRenderModules[kind]) return _rapierRenderModules[kind];\n\tswitch (kind) {\n' +
		cases.map(row => row.replace('\t\tcase', '\tcase').replace('return ', 'return _rapierRenderModules[kind] = ')).join('\n') + "\n\t\tdefault: throw new Error('Unknown render owner');\n\t}\n}\n";
}

const wrapModule = (factory, text) => 'const ' + factory + ' = (() => {\n' + text + '\nreturn ' + factory + ';\n})();';

export async function buildReader({root = here, unchecked = [], toolchainCanonical = false} = {}) {
	const started = buildTimingNow(), report = {};
	const ui = await fillMathLicense(await read('editor/ui.html'), {root});
	const {markup: blocks, licenses, sprite} = readerBlocks(ui);

	const fragment = async path => '/* ' + path + ' */\n' + await read(path);
	const hostText = await fragment('reader/host.js'), ownText = hostText + '\n' + await fragment('reader/embed.js') + '\n' + await fragment('images/ocr.js') + '\n' + await fragment('reader/picture-find.js') + '\n' + await fragment('reader/app.js') + '\n' + await fragment('layout/typography-browser.js');
	const {built, files, flowRegistry, pdfRegistry} = await buildReaderPlugins({root, minify: process.env.RAPIER_READER_NOMINIFY !== '1'});
	const loaderSource = await read('shell/plugin-loader.js');
	const pluginParts = (await read('shell/bundle-io.js')) + '\n' + readerPluginLoader(fillMermaidResources(loaderSource), built);

	const pools = [await platformUnits(), await sharedUnits('editor/pop.js'), await sharedUnits('editor/sheet-gesture.js'), await sharedUnits('editor/plugins.js'), await renderWorkUnits(), await engineUnits()];
	const kit = {}, exports = await kitExports();
	let keep = Object.fromEntries(Object.keys(KIT).map(kind => [kind, new Set()])), linked = null, slices = null, ownScript = '';
	const forbid = ['rapier', '_rapierUi', 'showToast', 'rapierConfirm', 'renderBlock', '_rapierEmbedPublishState'];
	for (let round = 0; round < 8; round++) {
		slices = {};
		for (const [kind, [file, factory]] of Object.entries(KIT)) {
			const names = [...keep[kind]].sort();
			if (!names.length) continue;
			const cut = await renderFactorySlice(file, factory, names);
			const ports = [...cut.text.matchAll(/\{([^{}]*)\} = runtime;/g)].flatMap(match => match[1].split(',').map(part => part.trim().split(':').pop().trim()).filter(Boolean));
			slices[kind] = {factory, ports, text: wrapModule(factory, cut.text)};
			kit[kind] = cut;
		}
		ownScript = [hostText, pluginParts, Object.values(slices).map(slice => slice.text).join('\n'), renderModuleSource(slices, exports), ownText.slice(hostText.length)].join('\n');
		linked = link({own: ownScript, pools, forbid});
		const uses = kitUses(linked.text + '\n' + ownScript);
		let grew = false;
		for (const [kind, names] of uses) for (const name of names) if (!keep[kind].has(name)) { keep[kind].add(name); grew = true; }
		if (!grew && round > 0) break;
	}
	report.unresolved = linked.unresolved.filter(name => !BROWSER.has(name));
	const PROVIDED = ['DOMPurify', 'IDBKeyRange', 'URIError', 'RapierImageAssets', 'RapierPictureMarks', 'RapierPluginLoader', 'RapierUnpack', 'modules'];
	const GUARDED = ['_rapierDrawReadSVGRecipe', '_rapierDrawShapeProfileFor', 'RapierBundledPlugins'];
	const UNREACHED = ['RapierLedgerCarried'];
	const known = new Set([...PROVIDED, ...GUARDED, ...UNREACHED]);
	const missing = report.unresolved.filter(name => !known.has(name));
	if (missing.length) throw new Error('rapier-reader.html uses names it does not carry: ' + missing.join(', ') + ' (tools/reader-build.mjs: carry them, guard them with typeof, or list them)');

	const used = new Map();
	const everything = linked.text + '\n' + ownScript;
	for (const global of Object.keys(MODULES)) {
		const read = READ_ALL.has(global) ? null : readNames(everything, global);
		if (read && PLANNER_EXPORTS[global]) for (const name of PLANNER_EXPORTS[global]) read.add(name);
		used.set(global, read);
	}
	const registry = await bundleModules({root, entries: MODULES, used});
	const script = "'use strict';\n" + registry.text + '\n' + everything;
	new vm.Script('(()=>{' + script + '})', {filename: 'rapier-reader.js'});
	const scriptPackage = process.env.RAPIER_READER_NOMINIFY === '1' ? '(() => {\n' + script + '\n})();' : await squeezed('(() => {\n' + script + '\n})();', {
		compress: {passes: 2, ecma: 2022}, mangle: true, ecma: 2022,
		format: {comments: (_, row) => /@license|@preserve|SPDX-License-Identifier|^!/.test(row.value), ascii_only: false},
	});
	report.plugins = Object.fromEntries(built.map(plugin => [plugin.key, {file: plugin.file, bytes: plugin.bytes, gzip: gzipSync(files[plugin.file], {level: 9}).length}]));
	report.used = Object.fromEntries([...used].map(([name, names]) => [name, names ? [...names].sort() : null]));
	report.script = {linked: everything.length, modules: registry.text.length, minified: scriptPackage.length, sizes: registry.sizes, kept: linked.kept.length};

	const provenance = JSON.parse(await read('shell/vendor/PROVENANCE.json'));
	const vendor = async names => {
		const parts = [];
		for (const name of names) {
			const bytes = await readFile(resolve(here, 'shell/vendor', name)), record = provenance.files[name];
			if (!record || record.bytes !== bytes.length || record.sha256 !== sha256(bytes)) throw new Error('Vendor file ' + name + ' does not match shell/vendor/PROVENANCE.json');
			const source = bytes.toString('utf8');
			parts.push(entitiesVendor(name, source)?.source ?? source);
		}
		return parts.join('\n');
	};
	const markdownIt = await vendor(['markdown-it-15.0.2.es2022.umd.js', 'markdown-it-task-lists-2.1.1.min.js', 'markdown-it-footnote-4.0.0.min.js', 'markdown-it-mark-4.0.0.min.js',
		'markdown-it-sup-2.0.0.min.js', 'markdown-it-emoji-3.1.0-light.min.js', 'markdown-it-abbr-2.0.0.min.js', 'markdown-it-ins-4.0.0.min.js', 'markdown-it-deflist-4.0.0.min.js']);
	const purify = await vendor(['dompurify-3.4.16.es2024.min.js']);

	const carriesPretext = /agent\/vendor\/pretext\/|Pretext bac1774/.test(scriptPackage);
	const lazy = licensesSheet(licenses, carriesPretext ? await read('agent/vendor/pretext/LICENSE') : '', await mitNotice(here), carriesPretext);
	const sprites = spriteFor(sprite, blocks, lazy, scriptPackage.replace(/['"]#(i-[a-z0-9-]+)['"]/g, 'href="#$1"'));
	const markup = sprites + '\n' + blocks.replace(/\n\s*\n+/g, '\n');
	const words = text => new Set(text.match(/[A-Za-z_][\w-]*/g) || []);
	const vocabulary = new Set([...words(scriptPackage), ...words(markup), ...words(markdownIt), ...words(purify), ...words(lazy)]);
	const css = await readerStyles({vocabulary, tokens: readerTokenCss(), reader: await read('reader/reader.css')});
	report.css = css.report;

	const core = [['css', 'rapier-reader-style', css.text], ['html', 'markup', markup], ['js', 'markdown-it.js', markdownIt], ['js', 'dompurify.js', purify], ['js', 'reader.js', scriptPackage]];
	const packedCore = await pack('rapier-pack', core), packedLicenses = await pack('rapier-pack-licenses', [['html', 'licenses', lazy]]);
	const base124 = (await read('tools/base124.mjs')).replace(/^export /gm, '');
	const decoder = dropFunction(base124, 'encodeBase124');
	const loader = await squeezed(decoder + '\n' + await read('reader/loader.js'), {compress: {passes: 2}, mangle: {reserved: ['RapierUnpack']}, format: {comments: false}});
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
	await mkdir(resolve(root, 'dist/plugins'), {recursive: true});
	for (const [file, bytes] of Object.entries(files)) await writeFile(resolve(root, 'dist/plugins', file), bytes);
	const manifest = await pluginManifest({root, version: VERSION, loader: loaderSource, built});
	await writeFile(resolve(root, 'dist/plugins/rapier-plugins.json'), JSON.stringify(manifest, null, 2) + '\n');
	if (!FAST_PACK) await writeFile(resolve(root, 'packages/rapier-embed/rapier-plugins.json'), JSON.stringify(manifest, null, 2) + '\n');

	const bytes = Buffer.byteLength(html), gz = gzipSync(html, {level: 9}).length;
	const budget = SIZE_BUDGETS.reader;
	if (FAST_PACK) console.warn('RAPIER_PACK=fast: zlib packing for iteration only; ' + bytes + ' bytes is not a release measurement');
	checkProfileSize('reader', bytes);
	await mkdir(resolve(root, 'dist'), {recursive: true});
	let receipt = null;
	try { receipt = JSON.parse(await readFile(resolve(root, 'dist/BUILD.json'), 'utf8')); } catch (_) {}
	const record = {path: 'rapier-reader.html', bytes, sha256: sha256(html), gzip: gz, budget, builtAt: buildReceiptTimestamp(), node: process.version, mode: FAST_PACK ? 'development' : 'release',
		packing: FAST_PACK ? 'fast (zlib; not a release)' : 'zopfli', canonical: toolchainCanonical === true, parts: {core: packedCore.stored, licenses: packedLicenses.stored}};
	await writeFile(resolve(root, 'dist/BUILD.json'), JSON.stringify({...(receipt || {release: VERSION}), release: VERSION, profiles: {...(receipt?.profiles || {}), reader: record}}, null, 2) + '\n');
	report.parts = {core: packedCore, licenses: packedLicenses, markup: markup.length, css: css.text.length, markdownIt: markdownIt.length, purify: purify.length, script: scriptPackage.length, loader: loader.length};
	console.log(JSON.stringify({file: 'rapier-reader.html', bytes, gzip: gz, spans: packedCore.spans, licenseSpans: packedLicenses.spans, seconds: (buildTimingNow() - started) / 1000, unresolved: report.unresolved, used: report.used, plugins: report.plugins,
		script: {...report.script, sizes: undefined}, css: report.css, parts: {core: packedCore.stored, licenses: packedLicenses.stored, markup: markup.length, css: css.text.length, markdownIt: markdownIt.length, purify: purify.length, loader: loader.length}}, null, 1));
	if (process.env.RAPIER_READER_SIZES) {
		const cost = async text => { const code = (await minify('(() => {\n' + text + '\n;globalThis.__kept = [' + [...text.matchAll(/^(?:function|const|let|class) ([A-Za-z_$][\w$]*)/gm)].map(match => match[1]).join(',') + '];})();', {compress: {passes: 1}, mangle: true})).code; return [code.length, gzipSync(code, {level: 9}).length]; };
		const parts = {};
		for (const [path, size] of Object.entries(registry.sizes)) parts['module ' + path] = [size, ...(await cost(registry.blocks[path]))];
		for (const [path, size] of Object.entries(flowRegistry.sizes)) parts['flowchart module ' + path] = [size, ...(await cost(flowRegistry.blocks[path]))];
		for (const [path, size] of Object.entries(pdfRegistry.sizes)) parts['pdf module ' + path] = [size, ...(await cost(pdfRegistry.blocks[path]))];
		for (const [kind, cut] of Object.entries(kit)) parts['kit ' + kind] = [cut.text.length, ...(await cost(slices[kind].text))];
		parts['pool (editor units)'] = [linked.text.length, ...(await cost(linked.text))];
		parts['plugin loader'] = [pluginParts.length, ...(await cost(pluginParts))];
		parts['reader code'] = [ownText.length, ...(await cost(ownText))];
		parts['render module'] = [0, ...(await cost(renderModuleSource(slices, exports)))];
		await writeFile(process.env.RAPIER_READER_SIZES, JSON.stringify(Object.fromEntries(Object.entries(parts).map(([name, [raw, min, gz]]) => [name, {raw, minified: min, gzip: gz}])), null, 1));
	}
	if (false) await writeFile(process.env.RAPIER_READER_SIZES, JSON.stringify({sizes: registry.sizes, kept: linked.kept.map(unit => [unit.names.join(','), unit.text.length]), slices: Object.fromEntries(Object.entries(kit).map(([kind, cut]) => [kind, cut.text.length]))}, null, 1));
	return record;
}

// The licences the file carries, as a markup part: the editor's own sheet, cut to the parts this file carries, with the notices of
function licensesSheet(sheet, pretextLicense, notice, includePretext) {
	const drop = /Turndown|gpu-lexer|acorn 8|Geist|AndroidX|Google Play/;
	let text = dropElements(sheet.replace(/<template data-rapier-later>([\s\S]*?)<\/template>/g, '$1'), (row, markup) => /\blicense-(?:entry|row)\b/.test(row.cls) && drop.test(markup.slice(0, 400)));
	text = text.replaceAll('<pre class="license-text" data-license="rapier-mit"></pre>', () => '<pre class="license-text">' + escapeHtml(notice) + '</pre>');
	if (includePretext) {
		const pretext = '<details class="license-entry"><summary><span class="license-name">Pretext bac1774c · Unreleased</span><span class="license-id">MIT · BSD · Unicode · ICU</span></summary><pre class="license-text">' + escapeHtml(pretextLicense.trim()) + '</pre></details>\n';
		text = text.replace('<div class="licenses-list">', () => '<div class="licenses-list">\n' + pretext);
	}
	text = text.replace(/<button type="button" class="licenses-link" data-action="licenses-source">source<\/button>/, '<a class="licenses-link" href="https://github.com/jackskip22/rapier" target="_blank" rel="noopener noreferrer">source</a>');
	text = text.replace('<strong id="licenses-app-title">Rapier ·', () => '<strong id="licenses-app-title">Rapier v' + VERSION + ' ·');
	// Blank lines between tags go; the licence texts keep theirs.
	return text.split(/(<pre[\s\S]*?<\/pre>)/).map((part, at) => at % 2 ? part : part.replace(/\n\s*\n+/g, '\n')).join('');
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
	try { shell = await readBuildNotice(here); } catch (_) { return; }
	const body = text => text.split('\n').slice(3).filter(line => !/^\t(?:Vendored third-party|Full license)/.test(line)).join('\n');
	const house = /^<!DOCTYPE html>\n<!--\n[\s\S]*?-->\n/.exec(shell)?.[0];
	if (house && body(house) !== body(notice)) throw new Error('reader/shell.html: the licence notice differs from the one rapier.html carries');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildReader();
