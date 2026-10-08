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

// Entry points can expose the same name with different algorithms. Scope combined entries separately.
function scopedModules(texts, names, bindings) {
  const ids = new Map(names.map((name, i) => [name, 'module' + i]));
  const declared = pattern => pattern.type === 'Identifier' ? [pattern.name]
    : pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(p => declared(p.value || p.argument))
    : pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(declared)
    : declared(pattern.left || pattern.argument);
  const modules = names.map(name => {
    const source = texts[name], ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'}), edits = [], exports = [];
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
          exports.push(...locals.map(local => local + ':' + local)); edits.push([node.start, d.start, '']);
        } else {
          exports.push(...node.specifiers.map(s => s.exported.name + ':' + s.local.name)); edits.push([node.start, node.end, '']);
        }
      }
    }
    let body = source;
    for (const [start, end, text] of edits.reverse()) body = body.slice(0, start) + text + body.slice(end);
    return 'const ' + ids.get(name) + '=(()=>{' + body + '\nreturn {' + exports.join(',') + '};})();';
  });
  return modules.join('\n') + '\n' + Object.entries(bindings).map(([name, module], i) =>
    'const public' + i + '=' + ids.get(module) + '.' + name + ';export {public' + i + ' as ' + name + '};').join('\n');
}

export function bundle(texts, names, exportsList, banner, {classic = false, suffix = "", scoped = null} = {}) {
	const code = scoped ? scopedModules(texts, names, scoped) : names.map(name => texts[name].replace(/^import .*;\n/gm, '').replace(/^export \{[^\n]+\};\n/gm, '').replace(/^export /gm, '')).join('\n') + (classic ? '\n' + suffix : '\nexport {' + exportsList.join(', ') + '};\n');
	let best = null;
	for (const compress of [{passes: 2}, {passes: 2, inline: 1}, {passes: 2, hoist_funs: true, hoist_vars: true}]) {
		const properties = {regex: PRIVATE_PROPERTIES};
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
export async function buildRapierWorker(directory, {profile = 'full'} = {}) {
  const texts = await jxlModuleTexts(directory), full = profile !== 'document';
  const modules = graph(texts, [full ? 'rapier' : 'worker']);
  const {version} = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const license = (await readFile(join(directory, 'LICENSE'), 'utf8')).trim().replace(/\s+/g, ' ');
  const banner = '/*! Rapier JXL ' + version + ' | ' + license + ' */\n';
  const built = bundle(texts, modules, [], banner, {classic: true,
    suffix: full ? 'installWorker();\n' : 'installJPEGXLWorker({encoderFactory:undefined});\n'});
  new vm.Script(built.bytes.toString('utf8'), {filename: 'rapier-worker.js'});
  return {...built, version, modules: modules.map(name => name + '.mjs'),
    sha256: createHash('sha256').update(built.bytes).digest('hex')};
}
