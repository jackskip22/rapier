// SPDX-License-Identifier: AGPL-3.0-only
// Inspect executable syntax, not comments, license notices or document strings.
import {readFile, readdir} from 'node:fs/promises';
import {resolve, dirname, join, relative, isAbsolute} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import acorn from '../agent/vendor/acorn.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAMED_HELPERS = /^(?:_classCallCheck|_createClass|_defineProperty|_inherits(?:Loose)?|_asyncToGenerator|_createForOfIteratorHelper(?:Loose)?|_toConsumableArray|_slicedToArray|_objectSpread\d*|_objectWithoutProperties(?:Loose)?|_classPrivateField(?:Get|Set|InitSpec)\d*|_classPrivateMethodInitSpec|_assertClassBrand|_checkPrivateRedeclaration|__assign|__awaiter|__generator|__extends|__read|__values|__spread(?:Array|Arrays|Values|Props)?|__classPrivateField(?:Get|Set|In)|__private(?:Add|Get|Set|Method)|__publicField|__defNormalProp|__accessCheck|__async(?:Generator)?|__forAwait|regeneratorRuntime)$/;
const BUILT_INS = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'Function', 'Symbol', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Reflect', 'Math', 'JSON', 'RegExp', 'Date']);
const STANDARD_METHODS = new Set(['assign', 'hasOwn', 'entries', 'values', 'keys', 'fromEntries', 'getOwnPropertyDescriptors', 'isArray', 'from', 'of', 'forEach', 'map', 'filter', 'every', 'some', 'reduce', 'reduceRight', 'indexOf', 'lastIndexOf', 'includes', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap', 'at', 'toSorted', 'toReversed', 'toSpliced', 'with', 'codePointAt', 'fromCodePoint', 'startsWith', 'endsWith', 'repeat', 'padStart', 'padEnd', 'trim', 'trimStart', 'trimEnd', 'replaceAll', 'bind', 'finally', 'allSettled', 'any', 'withResolvers', 'isFinite', 'isNaN', 'isInteger', 'isSafeInteger', 'sign', 'trunc', 'imul', 'fround', 'clz32', 'matchAll']);
const RUNTIME_IMPORTS = /^(?:core-js(?:-pure)?|regenerator-runtime|tslib)(?:\/|$)|^@babel\/runtime(?:-corejs[23])?\/(?:helpers|regenerator)(?:\/|$)/;
const NATIVE_GLOBALS = new Set([...BUILT_INS, 'ImageData', 'TextEncoder', 'TextDecoder', 'URL', 'URLSearchParams', 'AbortController', 'AbortSignal', 'queueMicrotask', 'structuredClone']);
const RUNTIME_DIRECTORIES = ['agent', 'bench', 'draw', 'editor', 'images', 'interchange', 'jxl', 'kernel', 'kit', 'layout', 'math', 'notes', 'presets', 'reader', 'security', 'shell', 'spec', 'workspace'];
const RUNTIME_ENTRY_POINTS = ['tools/startup-release.js', 'tools/startup-rescue.js', 'tools/runtime-loader.js',
  'tools/text-pack.mjs', 'tools/packed-header.mjs', 'tools/base124.mjs',
  'packages/rapier-embed/contract.mjs', 'skills/rapier-html/wrap.mjs', 'skills/rapier-html/return-address.mjs'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'test', 'tests', 'examples']);
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const children = node => Object.entries(node).filter(([key]) => !['loc', 'range'].includes(key)).flatMap(([, value]) =>
  Array.isArray(value) ? value.filter(child => child && typeof child.type === 'string') : value && typeof value.type === 'string' ? [value] : []);
const property = node => node?.type === 'MemberExpression' ? node.computed ? node.property.value : node.property.name : null;
const identifier = (node, name) => node?.type === 'Identifier' && node.name === name;
const member = (node, owner, name) => property(node) === name && identifier(node.object, owner);
const staticText = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value
  : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
const descend = (node, visit) => {
  const pending = [node];
  while (pending.length) { const current = pending.pop(); visit(current); pending.push(...children(current)); }
};

export function scanModernSource(source, path = '<source>') {
  let tree;
  try { tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true}); }
  catch (moduleError) {
    try { tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script', locations: true}); }
    catch { return {path, bytes: Buffer.byteLength(source), classes: 0, fields: 0, findings: [{path, line: moduleError.loc?.line || 1, kind: 'syntax', detail: moduleError.message}]}; }
  }
  const nodes = [], strings = new Map(), aliases = new Map([['defineProperty', new Set()], ['defineProperties', new Set()]]);
  descend(tree, node => nodes.push(node));
  for (const node of nodes) if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
    if (staticText(node.init) !== null) strings.set(node.id.name, staticText(node.init));
    for (const [name, names] of aliases) if (member(node.init, 'Object', name)) names.add(node.id.name);
  }
  const calls = (node, name) => node.type === 'CallExpression' &&
    (member(node.callee, 'Object', name) || node.callee.type === 'Identifier' && aliases.get(name).has(node.callee.name));
  const findings = [], seen = new Set();
  const report = (node, kind, detail) => {
    const key = kind + ':' + node.start;
    if (!seen.has(key)) { seen.add(key); findings.push({path, line: node.loc.start.line, column: node.loc.start.column + 1, kind, detail}); }
  };
  for (const node of nodes) {
    const imported = ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) ? staticText(node.source)
      : node.type === 'CallExpression' && identifier(node.callee, 'require') ? staticText(node.arguments[0]) : null;
    if (imported && RUNTIME_IMPORTS.test(imported)) report(node, 'compatibility-import', imported);
    if ((node.type === 'FunctionDeclaration' || node.type === 'VariableDeclarator') && NAMED_HELPERS.test(node.id?.name || ''))
      report(node, 'transpiler-helper', node.id.name);
    if (node.type === 'Identifier' && node.name === 'regeneratorRuntime') report(node, 'generator-runtime', 'regeneratorRuntime');
    if (node.type === 'ThrowStatement') {
      const message = staticText(node.argument?.arguments?.[0]);
      if (message && /^(?:Generator is already running\.?$|Cannot call a class as a function$|Invalid attempt to (?:destructure|iterate|spread)\b)/.test(message))
        report(node, 'transpiler-runtime', message.split('\n')[0]);
    }
    if (node.type === 'MemberExpression' && node.computed &&
        (staticText(node.property) ?? strings.get(node.property.name)) === '__core-js_shared__')
      report(node, 'polyfill-runtime', '__core-js_shared__');
    if (node.type === 'LogicalExpression' && node.operator === '||' && node.left.type === 'MemberExpression' &&
        BUILT_INS.has(node.left.object?.name) &&
        (FUNCTION_TYPES.has(node.right.type) || node.right.type === 'AssignmentExpression'))
      report(node, 'intrinsic-fallback', node.left.object.name + '.' + property(node.left));
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
      let target = node.left;
      while (target.object?.type === 'MemberExpression') target = target.object;
      if (BUILT_INS.has(target.object?.name) && STANDARD_METHODS.has(property(node.left)))
        report(node, 'intrinsic-patch', 'assignment to ' + target.object.name + '.' + property(node.left));
      if (['globalThis', 'window', 'self'].includes(node.left.object?.name) && NATIVE_GLOBALS.has(property(node.left)))
        report(node, 'native-global-patch', 'assignment to ' + node.left.object.name + '.' + property(node.left));
    }
    if (calls(node, 'defineProperty') && STANDARD_METHODS.has(staticText(node.arguments[1]))) {
      const target = node.arguments[0], owner = property(target) === 'prototype' ? target.object?.name : target?.name;
      if (BUILT_INS.has(owner)) report(node, 'intrinsic-patch', 'defineProperty on ' + owner + '.' + staticText(node.arguments[1]));
    }
    if (calls(node, 'defineProperties') && property(node.arguments[0]) === 'prototype' && node.arguments[1]?.type === 'Identifier') {
      const descriptors = node.arguments[1].name;
      const writesGetter = nodes.some(item => item.type === 'AssignmentExpression' && ['get', 'set'].includes(property(item.left)) &&
        item.left.object?.type === 'MemberExpression' && identifier(item.left.object.object, descriptors) && FUNCTION_TYPES.has(item.right.type));
      if (writesGetter) report(node, 'downlevel-accessors', 'getter/setter descriptors installed on a constructor prototype');
    }
    if (!FUNCTION_TYPES.has(node.type) || node.params.length < 2 || node.end - node.start > 4000) continue;
    const ids = new Set(node.params.filter(param => param.type === 'Identifier').map(param => param.name));
    const inside = [];
    descend(node.body, item => inside.push(item));
    const promiseFallback = inside.some(item => item.type === 'LogicalExpression' && item.operator === '||' &&
      item.right.type === 'AssignmentExpression' && identifier(item.right.right, 'Promise'));
    if (promiseFallback && ['next', 'throw', 'done', 'value'].every(name => inside.some(item => property(item) === name)))
      report(node, 'downlevel-async', 'Promise-driven generator async helper');
    if (node.end - node.start > 1600) continue;
    for (const test of inside.filter(item => item.type === 'BinaryExpression' && item.operator === 'in' &&
      ids.has(item.left.type === 'AssignmentExpression' ? item.left.left.name : item.left.name) && ids.has(item.right.name))) {
      const key = test.left.type === 'AssignmentExpression' ? test.left.left.name : test.left.name, receiver = test.right.name;
      const assignment = inside.some(item => item.type === 'AssignmentExpression' && item.left.type === 'MemberExpression' && item.left.computed &&
        identifier(item.left.object, receiver) && identifier(item.left.property, key));
      const descriptor = inside.some(item => calls(item, 'defineProperty') && identifier(item.arguments[0], receiver) &&
        identifier(item.arguments[1], key) && item.arguments[2]?.type === 'ObjectExpression' &&
        ['enumerable', 'configurable', 'writable', 'value'].every(name => item.arguments[2].properties.some(row => (row.key?.name ?? row.key?.value) === name)));
      if (assignment && descriptor) report(node, 'downlevel-fields', 'per-field defineProperty helper');
    }
  }
  return {path, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
    classes: nodes.filter(node => node.type === 'ClassDeclaration' || node.type === 'ClassExpression').length,
    fields: nodes.filter(node => node.type === 'PropertyDefinition').length,
    findings: findings.sort((a, b) => a.line - b.line || a.column - b.column || a.kind.localeCompare(b.kind))};
}

export function assertModernSources(sources) {
  const files = sources.map(({path, source}) => scanModernSource(source, path));
  const findings = files.flatMap(file => file.findings);
  if (findings.length) throw new Error('Modern JavaScript foundations: ' + findings.map(row => row.path + ':' + row.line + ' ' + row.kind + ' (' + row.detail + ')').join('; '));
  return files;
}

export function reviewedBrowserHostBranches(scanned, resource) {
  if (resource?.id !== 'rapier-ocr-jxl' || resource.url !== 'https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.3.0/codec/dec/jxl_dec.js' ||
      resource.sri !== 'OVUtDrf9Am51biP6vZWJC1BeSlKKo6nQQPjlB+KF9eWNuazANiijG+IBV4RDRUMA' ||
      scanned.bytes !== 36091 || scanned.sha256 !== '418c583da1f045926cf58fba58bb9ab323bde2552ce6a8e37b839c5c8b52434f') return [];
  return scanned.findings.filter(row => row.line === 8 && row.column === 579 && row.kind === 'native-global-patch' &&
    row.detail === 'assignment to globalThis.ImageData').map(row => ({...row, id: resource.id, sha256: scanned.sha256,
      reason: 'Published Node/Cloudflare host adapter; predicate false in the supported browser worker; native ImageData remains unchanged.',
      review: 'mail/engine-foundations/20261021-1441Z-lead-jsquash.md',
      probe: 'tools/probes/foundation-jxl-decoder.mjs'}));
}

export async function checkModernFoundations({root = ROOT} = {}) {
  const paths = [];
  async function visit(directory) {
    for (const entry of await readdir(resolve(root, directory), {withFileTypes: true})) {
      if (entry.isDirectory()) { if (!SKIP_DIRECTORIES.has(entry.name) && directory + '/' + entry.name !== 'shell/vendor/source') await visit(directory + '/' + entry.name); }
      else if (/\.(?:mjs|cjs|js)$/.test(entry.name) && !/\.(?:test|spec)\.[cm]?js$/.test(entry.name)) paths.push(directory + '/' + entry.name);
    }
  }
  for (const directory of RUNTIME_DIRECTORIES) await visit(directory);
  const runtimeEntries = new Set(), pending = [...RUNTIME_ENTRY_POINTS];
  while (pending.length) {
    const path = pending.pop();
    if (runtimeEntries.has(path)) continue;
    runtimeEntries.add(path);
    const source = await readFile(resolve(root, path), 'utf8');
    let tree;
    try { tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'}); }
    catch { tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script'}); }
    descend(tree, node => {
      if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) return;
      const specifier = staticText(node.source);
      if (!specifier?.startsWith('.')) return;
      const dependency = relative(root, resolve(root, dirname(path), specifier));
      if (dependency.startsWith('../') || isAbsolute(dependency)) throw new Error('A runtime import leaves the repository: ' + path + ' -> ' + specifier);
      pending.push(dependency);
    });
  }
  paths.push(...runtimeEntries);
  const files = [];
  for (const path of [...new Set(paths)].sort()) files.push(scanModernSource(await readFile(resolve(root, path), 'utf8'), path));
  const {pluginPackFiles, readPluginFile} = await import('./stage-plugin-pack.mjs');
  const inventory = await pluginPackFiles({root});
  const executable = inventory.filter(file => /\.[cm]?js$/.test(new URL(file.url).pathname));
  const byPath = new Map(files.map(file => [resolve(root, file.path), file]));
  const plugins = [], acceptedHostBranches = [];
  for (const resource of executable) {
    let bytes;
    try { ({bytes} = await readPluginFile(resource, resource.path ? null : join(root, 'dist/plugin-cache', resource.id))); }
    catch (cause) { throw new Error('Modern foundation resource could not be verified: ' + resource.id + ' (' + resource.url + ')', {cause}); }
    const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    if (!Buffer.from(source).equals(bytes)) throw new Error('An executable plug-in is not exact UTF-8: ' + resource.id);
    let scanned = resource.path && byPath.get(resolve(resource.path));
    if (scanned) {
      if (scanned.sha256 !== createHash('sha256').update(bytes).digest('hex'))
        throw new Error('A foundation changed during the scan: ' + resource.path);
    } else {
      scanned = scanModernSource(source, 'plugin:' + resource.id);
      files.push(scanned);
    }
    plugins.push({id: resource.id, url: resource.url, bytes: bytes.length, sri: resource.sri,
      sha256: scanned.sha256, scannedPath: scanned.path});
    acceptedHostBranches.push(...reviewedBrowserHostBranches(scanned, resource));
  }
  const findings = files.flatMap(file => file.findings).filter(row => !acceptedHostBranches.some(accepted =>
    accepted.path === row.path && accepted.line === row.line && accepted.column === row.column && accepted.kind === row.kind));
  return {ok: findings.length === 0, files, plugins, acceptedHostBranches, runtimeEntryClosure: [...runtimeEntries].sort(),
    resourceInventory: {total: inventory.length, javascript: executable.length, nonJavaScript: inventory.length - executable.length}, findings};
}

export async function assertModernFoundations(root = ROOT) {
  const report = await checkModernFoundations({root});
  for (const row of report.acceptedHostBranches) console.log('Modern foundations: reviewed host branch ' + row.path + ':' + row.line +
    ' SHA-256 ' + row.sha256 + ' — ' + row.reason);
  if (!report.ok) throw new Error('Modern JavaScript foundations: ' + report.findings.map(row =>
    row.path + ':' + row.line + ' ' + row.kind + ' (' + row.detail + ')').join('; '));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), json = args.includes('--json'), named = args.filter(arg => arg !== '--json');
  const report = named.length ? {files: await Promise.all(named.map(async path => scanModernSource(await readFile(path, 'utf8'), path)))}
    : await checkModernFoundations();
  if (named.length) { report.findings = report.files.flatMap(file => file.findings); report.ok = report.findings.length === 0; }
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const row of report.findings) console.error(row.path + ':' + row.line + ' ' + row.kind + ': ' + row.detail);
    for (const row of report.acceptedHostBranches || []) console.log('Reviewed host branch: ' + row.path + ':' + row.line + ' ' + row.sha256 + ' — ' + row.reason);
    console.log('Modern foundations: ' + report.files.length + ' files, ' + report.findings.length + ' refusals, ' +
      (report.acceptedHostBranches?.length || 0) + ' reviewed nonbrowser host branches');
  }
  process.exitCode = report.ok ? 0 : 1;
}
