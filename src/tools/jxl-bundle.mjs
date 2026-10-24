// SPDX-License-Identifier: AGPL-3.0-only
// Shared package and application builder. Generated workers carry the encoder's MIT license.
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import vm from 'node:vm';
import acorn from '../agent/vendor/acorn.mjs';
const require = createRequire(import.meta.url);
const {minify_sync} = require('./vendor/terser/bundle.min.js');
export const TERSER = require('./vendor/terser/package.json').version;
export const PRIVATE_PROPERTIES = new RegExp('^(' + [
	'alphabetSize|lengths|codes|simple|treeSelect|splitToken|msb|lsb|contextMap|histograms',
	'predictor|multiplier|context|splitval|property|offset|left|right|channel',
	'acc|pending|at|bitLength|grow|zeroPadToByte|writeU32|append|finish|write',
	'small|large|totals|contexts|tokens|cost|bucketOf|contextOf|nonZero|zeroDensityOffset|thresholds|numDc|numCtxs|freqs',
	'hshift|vshift|residual|component|inPlace|horizontal|beginC|numC|rctType|nbColors|nbDeltas|useGlobalTree|streamId|pieces|rect',
	'minSymbol|minLength|lengthConfig',
	'params|type|leaf|groupsX|groupsY|dcGroupsX|dcGroupsY|single',
	'config|bits|sym|tree|count|parts|lz77|transforms',
].join('|') + ')$');

export function graph(texts, roots) {
	const order = [], seen = new Set();
	const visit = name => {
		if (seen.has(name)) return;
		seen.add(name);
		for (const [, dependency] of texts[name].matchAll(/^import [^\n]* from '\.\/([\w-]+)\.mjs';$/gm)) visit(dependency);
		order.push(name);
	};
	for (const root of roots) visit(root);
	return order;
}

function scopedModules(texts, names, bindings, {classic = false, suffix = ''} = {}) {
  const ids = new Map(names.map((name, i) => [name, 'module' + i]));
  const asts = new Map(names.map(name => [name, acorn.parse(texts[name], {ecmaVersion: 'latest', sourceType: 'module'})]));
  const needed = new Map(names.map(name => [name, new Set()]));
  for (const [name, module] of Object.entries(bindings)) needed.get(module).add(name);
  for (const ast of asts.values()) for (const node of ast.body) if (node.type === 'ImportDeclaration')
    for (const specifier of node.specifiers) {
      if (specifier.type !== 'ImportSpecifier') throw new Error('Unsupported combined import');
      needed.get(node.source.value.slice(2, -4)).add(specifier.imported.name);
    }
  const declared = pattern => pattern.type === 'Identifier' ? [pattern.name]
    : pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(p => declared(p.value || p.argument))
    : pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(declared)
    : declared(pattern.left || pattern.argument);
  const modules = names.map(name => {
    const source = texts[name], ast = asts.get(name), edits = [], exports = [];
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        const dependency = node.source.value.slice(2, -4), id = ids.get(dependency);
        if (!id || node.specifiers.some(s => s.type !== 'ImportSpecifier')) throw new Error('Unsupported combined import in ' + name);
        const fields = node.specifiers.map(s => s.imported.name + ':' + s.local.name).join(',');
        edits.push([node.start, node.end, 'const {' + fields + '}=' + id + ';']);
      } else if (node.type === 'ExportNamedDeclaration') {
        if (node.source) throw new Error('Unsupported combined re-export in ' + name);
        if (node.declaration) {
          const d = node.declaration, locals = d.type === 'VariableDeclaration' ? d.declarations.flatMap(v => declared(v.id)) : [d.id.name];
          exports.push(...locals.filter(local => needed.get(name).has(local)).map(local => local + ':' + local)); edits.push([node.start, d.start, '']);
        } else {
          exports.push(...node.specifiers.filter(s => needed.get(name).has(s.exported.name)).map(s => s.exported.name + ':' + s.local.name)); edits.push([node.start, node.end, '']);
        }
      }
    }
    let body = source;
    for (const [start, end, text] of edits.reverse()) body = body.slice(0, start) + text + body.slice(end);
    return 'const ' + ids.get(name) + '=(()=>{' + body + '\nreturn {' + exports.join(',') + '};})();';
  });
  return modules.join('\n') + '\n' + Object.entries(bindings).map(([name, module], i) => classic
    ? 'const ' + name + '=' + ids.get(module) + '.' + name + ';'
    : 'const public' + i + '=' + ids.get(module) + '.' + name + ';export {public' + i + ' as ' + name + '};').join('\n') +
    (classic ? '\n' + suffix : '');
}

export function bundleNameClashes(texts, names) {
	const owner = new Map(), clashes = [];
	const declare = (id, name) => {
		if (!id) return;
		if (id.type === 'Identifier') {
			const first = owner.get(id.name);
			if (first && first !== name) clashes.push(id.name + ' (' + first + ', ' + name + ')'); else owner.set(id.name, name);
		} else if (id.type === 'ObjectPattern') for (const p of id.properties) declare(p.type === 'RestElement' ? p.argument : p.value, name);
		else if (id.type === 'ArrayPattern') for (const e of id.elements) declare(e && (e.type === 'RestElement' ? e.argument : e), name);
		else if (id.type === 'AssignmentPattern') declare(id.left, name);
	};
	for (const name of names) {
		for (let node of acorn.parse(texts[name], {ecmaVersion: 'latest', sourceType: 'module'}).body) {
			if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') node = node.declaration;
			if (!node) continue;
			if (node.type === 'VariableDeclaration') for (const d of node.declarations) declare(d.id, name);
			else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') declare(node.id, name);
		}
	}
	if (clashes.length) throw new Error('refused: modules bundled in one scope declare the same name: ' + clashes.join(', '));
}

export function bundle(texts, names, exportsList, banner, {classic = false, suffix = "", scoped = null, reserved = []} = {}) {
	if (!scoped) bundleNameClashes(texts, names);
	const code = scoped ? scopedModules(texts, names, scoped, {classic, suffix}) : names.map(name => texts[name].replace(/^import .*;\n/gm, '').replace(/^export \{[^\n]+\};\n/gm, '').replace(/^export /gm, '')).join('\n') + (classic ? '\n' + suffix : '\nexport {' + exportsList.join(', ') + '};\n');
	let best = null;
	for (const compress of [{passes: 2}, {passes: 2, inline: 1}, {passes: 2, hoist_funs: true, hoist_vars: true}]) {
		const properties = {regex: PRIVATE_PROPERTIES, reserved};
		const out = minify_sync(code, {module: true, compress, mangle: {properties}, format: {comments: false}});
		if (out.error) throw out.error;
		const bytes = Buffer.from(banner + (classic ? "'use strict';\n" : '') + out.code + '\n'), gzip = gzipSync(bytes, {level: 9});
		if (!best || gzip.length < best.gzip.length || (gzip.length === best.gzip.length && bytes.length < best.bytes.length)) best = {bytes, gzip, compress};
	}
	const brotli = brotliCompressSync(best.bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT}});
	return {bytes: best.bytes, gzip: best.gzip.length, brotli: brotli.length, compress: best.compress};
}


export async function jxlModuleTexts(directory) {
  const names = (await readdir(directory)).filter(file => file.endsWith('.mjs')).sort();
  return Object.fromEntries(await Promise.all(names.map(async file => [file.slice(0, -4),
    (await readFile(join(directory, file), 'utf8')).replaceAll('MIT (images/jxl/LICENSE)', 'MIT (LICENSE)')])));
}
export const RAPIER_WORKERS = Object.freeze({
	still: Object.freeze({root: 'rapier-core', encoder: 'rapier-still', format: 'format-still'}),
	complete: Object.freeze({root: 'rapier', encoder: 'rapier-encoder', format: 'format-worker'}),
});
export async function buildRapierWorker(directory, {encoder = true, still = false} = {}) {
  const texts = await jxlModuleTexts(directory), full = encoder !== false;
  const root = full ? RAPIER_WORKERS[still ? 'still' : 'complete'].root : 'worker';
  const modules = graph(texts, [root]);
  if (still) for (const entry of [RAPIER_WORKERS.complete.encoder, RAPIER_WORKERS.complete.format])
    if (modules.includes(entry)) throw new Error('The still worker reaches the complete-only ' + entry + '.mjs');
  const {version} = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const license = (await readFile(join(directory, 'LICENSE'), 'utf8')).trim().replace(/\s+/g, ' ');
  const banner = '/*! Rapier JXL ' + version + ' | ' + license + ' */\n';
  const built = bundle(texts, modules, [], banner, {classic: true, ...(full ? {scoped: {installWorker: root}} : {}),
    suffix: full ? 'installWorker();\n' : 'installJPEGXLWorker({encoderFactory:undefined});\n'});
  new vm.Script(built.bytes.toString('utf8'), {filename: 'rapier-worker.js'});
  return {...built, version, modules: modules.map(name => name + '.mjs'),
    sha256: createHash('sha256').update(built.bytes).digest('hex')};
}
