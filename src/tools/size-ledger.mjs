// Byte measurements, never removals: each omission is a throwaway build in its own copy of one frozen source. node tools/size-ledger.mjs
// [--profile=full|document] [--packing=release|fast] (tools/build.mjs --ledger). Unmeasurable is BLOCKED and fails. Only a release run of
// both profiles writes the published ledger.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, cp, mkdtemp, rm, stat, utimes, readdir} from 'node:fs/promises';
import {openSync, closeSync, readFileSync, statSync} from 'node:fs';
import {gzipSync, gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve, dirname, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import acorn from '../agent/vendor/acorn.mjs';
import {decodeBase124} from './base124.mjs';
import {decodeTextPack} from './text-pack.mjs';
import {restoreSymbols} from './runtime-symbols.mjs';
import {buildJPEGXLArtifact} from '../images/codec-build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT = {full: 'rapier.html', document: 'rapier-document.html'};
const RECEIPT = {release: {mode: 'release', packing: 'zopfli'}, fast: {mode: 'development', packing: 'fast (zlib; not a release)'}};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const n = x => x == null ? '—' : x.toLocaleString('en-US');

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
const parse = (source, sourceType = 'module') => acorn.parse(source, {ecmaVersion: 'latest', sourceType});
function find(source, test) { const found = []; walk(parse(source), node => { if (test(node)) found.push(node); }); return found; }
function one(found, what) { assert.equal(found.length, 1, 'expected exactly one ' + what); return found[0]; }
function edits(source, ranges) {
  for (const [start, end, text] of ranges.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + text + source.slice(end);
  return source;
}

// --- The omissions: each edits its syntax anchors exactly once in a copy. The encoder row measures the encoder, not the worker. ---
export function omitEncoder(source) {
  const call = one(find(source, n => n.type === 'CallExpression' && n.callee.name === 'buildJPEGXLArtifact'), 'JPEG XL worker build');
  assert.equal(call.arguments[1]?.type, 'ObjectExpression', 'the worker build takes its profile as an options object');
  return edits(source, [[call.arguments[1].start, call.arguments[1].end, "{profile: 'document'}"]]);
}
export function omitQR(source) {
  const node = one(find(source, n => n.type === 'ImportDeclaration' && n.source.value === './qr-code.mjs'), 'QR encoder import');
  return edits(source, [[node.start, node.end, "const encodeQR = () => { throw new Error('qr omitted'); }, qrDrawing = () => null;"]]);
}
export function omitLoader(source, path) {
  const found = [];
  walk(parse(source), node => {
    if (node.type !== 'ArrayExpression') return;
    const at = node.elements.findIndex(e => e?.type === 'ArrayExpression' && e.elements[1]?.value === path);
    if (at < 0) return;
    assert(node.elements.length > 1, 'the loader list must keep its other platform entries');
    found.push(at < node.elements.length - 1 ? [node.elements[at].start, node.elements[at + 1].start, ''] : [node.elements[at - 1].end, node.elements[at].end, '']);
  });
  return edits(source, [one(found, 'platform entry for ' + path)]);
}
// Keep vendor derivation and parser inputs intact; the full profile's build-derived search-cache
// identity still changes, as for other omissions. The selected packed element alone is omitted.
export function omitVendor(source, id) {
  const node = one(find(source, n => n.type === 'AwaitExpression' &&
    n.argument.callee?.name === 'packedSpans' && n.argument.arguments[0]?.name === 'id' &&
    n.argument.arguments[1]?.value === 'text/rapier-vendor'), 'vendor packing call');
  return edits(source, [[node.start, node.end, `id === ${JSON.stringify(id)} ? '' : ${source.slice(node.start, node.end)}`]]);
}
export function omitPdf(source) {
  const calls = [], props = [];
  walk(parse(source), node => {
    if (node.type === 'ExpressionStatement' && node.expression.type === 'AwaitExpression') {
      const call = node.expression.argument;
      if (call.type === 'CallExpression' && call.callee.name === 'bundle' && call.arguments[0]?.value === 'interchange/pdf.mjs') calls.push([node.start, node.end, '']);
    }
    if (node.type === 'VariableDeclarator' && node.id?.name === 'globals' && node.init?.type === 'ObjectExpression') {
      const ps = node.init.properties, i = ps.findIndex(p => (p.key?.value || p.key?.name) === 'RapierPdf');
      if (i >= 0) props.push(i < ps.length - 1 ? [ps[i].start, ps[i + 1].start, ''] : [ps[i - 1].end, ps[i].end, '']);
    }
  });
  return edits(source, [one(calls, 'PDF bundle call'), one(props, 'RapierPdf global')]);
}
export const fontRules = css => [...css.matchAll(/@font-face\{[^}]*\}/g)].filter(m => /font-family:["']?Geist(?: Mono)?["']?;/.test(m[0]));
// The faces are authored in shell/fonts/fonts.css and ship inside the packed stylesheet record
// (tools/build.mjs inlines the two WOFF2 files it names); the omission takes them out of that sheet.
export function omitFonts(css) {
  const found = fontRules(css);
  assert.equal(found.length, 2, 'expected the two Geist font faces');
  return edits(css, found.map(m => [m.index, m.index + m[0].length, '']));
}
const packedStyles = a => JSON.parse(a.text('rapier-styles.json') || '[]').map(row => row.css).join('\n');
const styleRecords = a => {
  const paint = JSON.parse(a.text('rapier-styles.json') || '[]');
  const rest = a.spans.has('rapier-styles-rest.json') ? JSON.parse(a.text('rapier-styles-rest.json') || '[]') : [];
  return [...paint, ...rest];
};
// Diagnostic only: every draw/ module gone (the artifact cannot run). Each blanking lands in the scope that declares what it names.
export function drawModuleEdits(source) {
  const bundle = one(find(source, n => n.type === 'FunctionDeclaration' && n.id?.name === 'bundle'), 'bundle() declaration');
  assert.equal(bundle.params[0]?.name, 'path', 'bundle() takes the module path');
  const load = one(find(source, n => n.type === 'ExpressionStatement' && n.expression.type === 'AwaitExpression' &&
    n.expression.argument.callee?.name === 'bundle' && n.expression.argument.arguments[0]?.name === 'dependency'), 'bundle(dependency) import site');
  const assemble = one(find(source, n => n.type === 'FunctionDeclaration' && n.id?.name === 'assemble'), 'assemble() declaration');
  const rewrites = [];
  walk(assemble.body, n => { if (n.type === 'VariableDeclaration' && n.declarations.length === 1 && n.declarations[0].id?.name === 'fields') rewrites.push(n); });
  const rewrite = one(rewrites, "import rewrite in assemble() (the `fields` declaration)");
  const publish = one(find(source, n => n.type === 'ForOfStatement' && source.slice(n.right.start, n.right.end) === 'Object.values(globals)'), 'globals publication loop');
  const notices = one(find(source, n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id?.name === 'sheetNotices')), 'sheetNotices declaration');
  return [
    [notices.end, notices.end, "\nfor (const path of SHEET_NOTICES.keys()) if (path.startsWith('draw/')) withoutSheetNotice(path, await read(path));"],
    [bundle.body.start + 1, bundle.body.start + 1, "\n  if (path.startsWith('draw/')) return;"],
    [load.start, load.start, "if (dependency.startsWith('draw/')) continue;\n    "],
    [rewrite.start, rewrite.start, "if (dependency.startsWith('draw/')) { changes.push({start: node.start, end: node.end, text: ''}); continue; }\n      "],
    [publish.start, publish.start, "for (const [name, path] of Object.entries(globals)) if (path.startsWith('draw/')) delete globals[name];\n"],
  ];
}
export const omitDrawModules = source => edits(source, drawModuleEdits(source));
export {edits as splice};
export function omitDrawScripts(json) {
  const rows = JSON.parse(json), kept = rows.filter(path => !path.startsWith('draw/'));
  assert(kept.length < rows.length, 'editor/scripts.json names no draw/ script');
  return JSON.stringify(kept, null, 2) + '\n';
}
// Every stylesheet row but the fonts sheet.
export const FONTS_SHEET = 'shell/fonts/fonts.css';
export function omitStyles(json) {
  const rows = JSON.parse(json);
  assert(rows.length > 0, 'editor/styles.json has no rows');
  const fonts = rows.filter(row => row.path === FONTS_SHEET);
  assert.equal(fonts.length, 1, 'expected exactly one fonts sheet row (' + FONTS_SHEET + ')');
  assert(rows.length > 1, 'editor/styles.json has no row but the fonts sheet');
  return JSON.stringify(fonts, null, 2) + '\n';
}

// --- Reading an artifact: every element decoded (base124, gunzip) and its spans tiled. ---
export function inspect(html, symbols = {}) {
  const spans = new Map(), elements = [];
  for (const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const group = /\/\* RAPIER_VENDOR_GROUP bytes=(\d+) stored=gzip\+base124([^*]*)\*\/\n([\s\S]*?)\n\/\* RAPIER_VENDOR_GROUP_END \*\//.exec(tag[2]);
    if (!group) continue;
    const id = /\bid="([^"]+)"/.exec(tag[1])?.[1];
    assert(id && !elements.some(e => e.id === id), 'a packed element needs its own id: ' + id);
    // A group packed with the words prefilter (tools/text-pack-build.mjs) is expanded by the one
    // bounded expander the shell carries, before the length and the spans are read.
    const prefilter = group[2].trim();
    assert(group[2] === ' ' || group[2] === ' prefilter=words2 ', id + ': unknown packed text prefilter or metadata');
    const gzip = Buffer.from(decodeBase124(group[3])), inflated = gunzipSync(gzip);
    const bytes = prefilter ? Buffer.from(decodeTextPack(inflated, Number(group[1]))) : inflated, names = [];
    assert.equal(bytes.length, Number(group[1]), id + ': decoded length');
    let cursor = 0;
    for (const s of tag[2].matchAll(/\/\* RAPIER_VENDOR_SPAN (\S+) offset=(\d+) bytes=(\d+) \*\//g)) {
      assert.equal(Number(s[2]), cursor, s[1] + ': spans must be contiguous');
      const part = bytes.subarray(cursor, cursor + Number(s[3]));
      assert.equal(part.length, Number(s[3]), s[1] + ': span runs past its element');
      assert(!spans.has(s[1]), 'duplicate span ' + s[1]);
      spans.set(s[1], part); names.push(s[1]); cursor += part.length;
    }
    assert(names.length && cursor === bytes.length, id + ': its spans must cover every packed byte');
    elements.push({id, start: tag.index, end: tag.index + tag[0].length, storedBytes: Buffer.byteLength(tag[0]), gzipBytes: gzip.length, decodedBytes: bytes.length, spans: names});
  }
  assert(elements.length, 'no packed elements: an artifact is read, never the source');
  const restored = new Map();
  for (const [name, map] of Object.entries(symbols)) if (spans.has(name)) restored.set(name, restoreSymbols(spans.get(name).toString('utf8'), map));
  return {html, sha256: hash(html), spans, elements, restored, text: name => spans.get(name)?.toString('utf8') ?? ''};
}
// What is read out of a decoded span is kept on that span: each is parsed once however often asked.
const cached = new WeakMap();
function once(span, kind, make) {
  if (!span) return make();
  const row = cached.get(span) || cached.set(span, new Map()).get(span);
  if (!row.has(kind)) row.set(kind, make());
  return row.get(kind);
}
// The module factories a span defines, by id (the module's path), read from its syntax: the editor
// also spells `modules[...]` inside the strings its export layout builds.
function factories(a, name) {
  return once(a.spans.get(name), 'factories', () => {
    const ids = new Set();
    walk(parse(a.text(name), 'script'), node => {
      const l = node.left;
      if (node.type === 'AssignmentExpression' && l?.type === 'MemberExpression' && l.object.name === 'modules' && typeof l.property.value === 'string') ids.add(l.property.value);
    });
    return ids;
  });
}
export function modules(a) {
  const ids = factories(a, 'rapier-shared.js');
  assert(ids.size, 'the shared runtime defines no module factories');
  return ids;
}
// Private names are shortened. Read the declarations after restoring this exact span's names from
// the build's SHA-bound symbol record; raw spelling silently missed both classic Draw scripts.
const functions = a => once(a.spans.get('rapier-editor.js'), 'functions', () => {
  assert(a.restored.has('rapier-editor.js'), 'the ledger needs the editor span\'s verified runtime symbol record');
  const names = new Set();
  walk(parse(a.restored.get('rapier-editor.js'), 'script'), node => { if (node.type === 'FunctionDeclaration') names.add(node.id.name); });
  return names;
});
export function scriptFunctions(source) {
  return parse(source, 'script').body.filter(node => node.type === 'FunctionDeclaration').map(node => node.id.name);
}

// The file cut into what occupies it: each packed element, the inline font faces, and the rest
// (shell markup, boot script, policy, separators). Disjoint, so the parts add up exactly.
export function partition(a) {
  const fonts = fontRules(a.html), total = Buffer.byteLength(a.html);
  const ranges = [...a.elements.map(e => [e.start, e.end]), ...fonts.map(m => [m.index, m.index + m[0].length])].sort((x, y) => x[0] - y[0]);
  ranges.forEach((r, i) => assert(!i || ranges[i - 1][1] <= r[0], 'overlapping parts would count bytes twice'));
  const fontBytes = fonts.reduce((sum, m) => sum + Buffer.byteLength(m[0]), 0);
  const otherBytes = total - fontBytes - a.elements.reduce((sum, e) => sum + e.storedBytes, 0);
  assert(otherBytes >= 0, 'the parts exceed the file');
  const carries = e => e.spans.map(name => {
    const count = name.endsWith('.js') && a.text(name).includes('modules[') ? factories(a, name).size : 0;
    return name + (count ? ` (${count} module factories)` : name === 'rapier-styles.json' || name === 'rapier-styles-rest.json' ? ` (${JSON.parse(a.text(name)).length} stylesheets)` : '');
  }).join(', ');
  return {totalBytes: total, elements: a.elements.map(e => ({id: e.id, storedBytes: e.storedBytes, gzipBytes: e.gzipBytes, decodedBytes: e.decodedBytes, carries: carries(e)}))
    .sort((x, y) => y.storedBytes - x.storedBytes), fontFaces: fonts.length + fontRules(packedStyles(a)).length, fontBytes, otherBytes};
}

// --- The measured payloads. ---
const SCRIPTS = 'editor/scripts.json', STYLES = 'editor/styles.json';
export const GROUPS = [
  {id: 'qr', name: 'QR encoder (the selectable device code and sheet stay)', edits: {'notes/sync-session.mjs': omitQR},
    inputs: () => ['notes/qr-code.mjs'], carries: a => modules(a).has('notes/qr-code.mjs')},
  {id: 'jxl', name: 'JPEG XL encoder (the worker, its adapter and its refusal stay)', edits: {'tools/build.mjs': omitEncoder},
    inputs: (a, ctx) => ctx.jxlModules,
    carries: a => a.jxl?.modules.includes('images/jxl/rapier.mjs') === true,
    leaves: (a, ctx) => hash(a.text('rapier-jxl-worker.js')) === ctx.documentWorkerSha256},
  {id: 'fonts', name: 'Geist + Geist Mono (the two wght400–700 faces, inside the packed stylesheet record)', edits: {'shell/fonts/fonts.css': omitFonts},
    inputs: () => ['shell/fonts/fonts.css', 'shell/fonts/Geist.wght400-700.woff2', 'shell/fonts/GeistMono.wght400-700.woff2'],
    carries: a => fontRules(packedStyles(a)).length > 0 || fontRules(a.html).length > 0},
  {id: 'draw', name: 'Draw + Paint (both classic scripts, every draw/ module)', edits: {'tools/build.mjs': omitDrawModules, [SCRIPTS]: omitDrawScripts},
    inputs: (a, ctx) => [...ctx.drawScripts.filter(s => s.functions.every(f => functions(a).has(f))).map(s => s.path), ...[...modules(a)].filter(id => id.startsWith('draw/')).sort()],
    carries: (a, ctx) => [...modules(a)].some(id => id.startsWith('draw/')) || ctx.drawScripts.some(s => s.functions.some(f => functions(a).has(f))),
    leaves: a => a.text('rapier-ui.html').includes('perfect-freehand') && a.text('rapier-ui.html').includes('rough.js generator')},
  {id: 'plugins', name: 'Plug-in loader, MathJax and Mermaid manifests (not the engines it fetches)', edits: {'tools/build.mjs': s => omitLoader(s, 'shell/plugin-loader.js')},
    inputs: () => ['shell/plugin-loader.js'], carries: a => a.spans.has('rapier-plugin-loader.js')},
  {id: 'pdf', name: 'PDF plug-in + resources', edits: {'tools/build.mjs': omitPdf},
    inputs: () => ['interchange/pdf.mjs', 'interchange/pdf-resources.mjs'],
    carries: a => modules(a).has('interchange/pdf.mjs') || modules(a).has('interchange/pdf-resources.mjs')},
  {id: 'styles', name: 'Styles (every editor/styles.json row but the fonts sheet, which is the fonts row)', edits: {[STYLES]: omitStyles},
    inputs: (a, ctx) => styleRecords(a).map(row => one(ctx.styles.filter(s => s.id === row.id), 'style row ' + row.id).path).filter(path => path !== FONTS_SHEET),
    carries: a => styleRecords(a).some(row => fontRules(row.css).length === 0)},
  ...[
    ['lib-markdownit', 'Markdown-it and its shipped extensions'],
    ['lib-gpu-lexer', 'GPU syntax lexer'],
    ['lib-acorn', 'Acorn JavaScript parser (the browser derivation)'],
    ['lib-dompurify', 'DOMPurify HTML sanitizer'],
    ['lib-turndown', 'Turndown HTML-to-Markdown reader (the browser derivation)'],
  ].map(([id, name]) => ({id, name, edits: {'tools/build.mjs': source => omitVendor(source, id)},
    inputs: (a, ctx) => ctx.vendors[id].map(name => 'shell/vendor/' + name),
    carries: a => a.elements.some(element => element.id === id)})),
];
export async function context(root) {
  const scripts = JSON.parse(await readFile(join(root, SCRIPTS), 'utf8')).filter(path => path.startsWith('draw/'));
  const buildSource = await readFile(join(root, 'tools/build.mjs'), 'utf8');
  const vendors = one(find(buildSource, node => node.type === 'VariableDeclarator' && node.id?.name === 'VENDOR_GROUPS'), 'vendor groups').init;
  assert.equal(vendors.type, 'ObjectExpression', 'vendor groups are an explicit inventory');
  const [completeWorker, documentWorker] = await Promise.all([buildJPEGXLArtifact(root), buildJPEGXLArtifact(root, {profile: 'document'})]);
  return {jxlModules: completeWorker.modules.map(name => 'images/jxl/' + name), documentWorkerSha256: documentWorker.sha256, vendors: Object.fromEntries(vendors.properties.map(row => [row.key.value, row.value.elements.map(node => node.value)])),
    styles: JSON.parse(await readFile(join(root, STYLES), 'utf8')),
    drawScripts: await Promise.all(scripts.map(async path => ({path, functions: scriptFunctions(await readFile(join(root, path), 'utf8'))})))};
}
// What a without-build must show before its bytes count: the payload gone, every other payload the
// baseline carries still there. A payload this profile does not ship measures zero, byte for byte.
export function proveOmission(group, baseline, without, ctx) {
  for (const other of GROUPS) if (other !== group && other.carries(baseline, ctx))
    assert(other.carries(without, ctx), group.id + ': the omission also took ' + other.id);
  if (!group.carries(baseline, ctx)) {
    assert.equal(without.sha256, baseline.sha256, group.id + ': this profile ships none of it, yet the omission changed the file');
    return 'not in this profile: the omission build is byte-identical';
  }
  assert(!group.carries(without, ctx), group.id + ': the omission build still carries it');
  if (group.leaves) assert(group.leaves(without, ctx), group.id + ': the omission build lost what it must keep');
  return 'decoded: absent from the omission build, every other payload still present';
}

export function verifyBuild(dir, profile, packing, started) {
  const path = join(dir, OUTPUT[profile]), receiptPath = join(dir, 'dist/BUILD.json');
  const html = readFileSync(path), receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  // The previous output is aged before a build, so only a build that writes it reads as fresh.
  assert(statSync(path).mtimeMs >= started - 2000 && statSync(receiptPath).mtimeMs >= started - 2000, 'stale artifact or receipt: an exit status is not a build');
  assert(Date.parse(receipt.builtAt) >= started - 2000, 'stale build time');
  assert.equal(receipt.profile, profile, 'receipt profile');
  assert.equal(receipt.mode, RECEIPT[packing].mode, 'receipt mode');
  assert.equal(receipt.packing, RECEIPT[packing].packing, 'receipt packing');
  assert.equal(receipt.editor?.path, OUTPUT[profile], 'receipt artifact');
  assert.equal(receipt.editor.bytes, html.length, 'receipt bytes');
  assert.equal(receipt.editor.sha256, hash(html), 'receipt SHA-256');
  return {jxl: receipt.jxl ?? null, html: html.toString('utf8'), bytes: html.length, sha256: receipt.editor.sha256, builtAt: receipt.builtAt, node: receipt.node, canonical: receipt.toolchain?.canonical === true};
}
async function build(dir, profile, packing, log) {
  // A full build reads its previous output as the shell, so the file is aged, never removed.
  await utimes(join(dir, OUTPUT[profile]), new Date(0), new Date(0)).catch(() => {});
  await rm(join(dir, 'dist/BUILD.json'), {force: true});
  const started = Date.now(), fd = openSync(log, 'w');
  let result;
  try { result = spawnSync(process.execPath, ['tools/build.mjs'], {cwd: dir, env: {...process.env, RAPIER_PROFILE: profile, RAPIER_PACK: packing}, stdio: ['ignore', fd, fd], timeout: 900_000}); }
  finally { closeSync(fd); }
  assert(!result.error && result.status === 0, `${profile}/${packing} build failed (${result.error?.message || 'exit ' + result.status}); see ${log}`);
  return {...verifyBuild(dir, profile, packing, started), elapsedMs: Date.now() - started};
}
export async function applyEdits(dir, group) {
  for (const [path, change] of Object.entries(group.edits)) {
    const file = join(dir, path), before = await readFile(file, 'utf8'), after = change(before);
    assert.notEqual(after, before, group.id + ': the omission changed nothing in ' + path);
    await writeFile(file, after);
  }
}
// Entry by entry: the work directory lives under dist/, and cp refuses a tree into itself.
async function copyTree(from, to) {
  const kept = path => !['dist', '.git', 'node_modules'].includes(basename(path));
  await mkdir(to, {recursive: true});
  for (const entry of (await readdir(from)).filter(kept)) await cp(join(from, entry), join(to, entry), {recursive: true, filter: kept});
}

async function measureProfile(frozen, work, profile, packing, logs) {
  const ctx = await context(frozen);
  async function variant(label, group) {
    const dir = join(work, profile + '-' + label);
    await copyTree(frozen, dir);
    try {
      if (group) await applyEdits(dir, group);
      console.log(`[size-ledger] ${profile} ${label} (${packing})`);
      const built = await build(dir, profile, packing, join(logs, `${profile}-${label}.log`));
      const symbols = JSON.parse(await readFile(join(dir, 'dist/runtime-symbols-' + profile + '.json'), 'utf8'));
      const artifact = {...inspect(built.html, symbols), jxl: built.jxl};
      if (built.jxl) assert.equal(hash(artifact.text('rapier-jxl-worker.js')), built.jxl.worker.sha256, 'the receipt describes the decoded worker');
      return {...built, artifact};
    } finally { await rm(dir, {recursive: true, force: true}); }
  }
  const baseline = await variant('baseline'), groups = [];
  for (const group of GROUPS) {
    const row = {id: group.id, name: group.name, marginalBytes: null};
    try {
      const paths = group.carries(baseline.artifact, ctx) ? group.inputs(baseline.artifact, ctx) : [];
      const inputs = await Promise.all(paths.map(async path => ({path, bytes: await readFile(join(frozen, path))})));
      row.inputs = inputs.map(({path, bytes}) => ({path, bytes: bytes.length, sha256: hash(bytes)}));
      row.authoredBytes = inputs.reduce((sum, f) => sum + f.bytes.length, 0);
      row.ownCompressedBytes = inputs.length ? gzipSync(Buffer.concat(inputs.map(f => f.bytes)), {level: 9}).length : 0;
      const without = await variant('without-' + group.id, group);
      row.proof = proveOmission(group, baseline.artifact, without.artifact, ctx);
      Object.assign(row, {withoutBytes: without.bytes, withoutSha256: without.sha256, marginalBytes: baseline.bytes - without.bytes, elapsedMs: without.elapsedMs});
    } catch (error) { row.blocked = String(error.message || error).split('\n')[0]; }
    groups.push(row);
    console.log(`[size-ledger] ${profile} ${group.id}: ` + (row.blocked ? 'BLOCKED -- ' + row.blocked : `marginal ${row.marginalBytes} of ${baseline.bytes}`));
  }
  const {html, artifact, ...identity} = baseline;
  return {profile, file: OUTPUT[profile], baseline: identity, groups, partition: partition(artifact)};
}
export async function inventories(root) {
  const read = async manifest => (await Promise.all(JSON.parse(await readFile(join(root, manifest), 'utf8')).map(async row => {
    const path = typeof row === 'string' ? row : row.path;
    return {path, bytes: (await stat(join(root, path))).size};
  }))).sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  return {[SCRIPTS]: await read(SCRIPTS), [STYLES]: await read(STYLES), engineBytes: (await stat(join(root, 'editor/engine.js'))).size};
}

// A row is measured (an integer and its proof) or BLOCKED (its reason); never empty. The partition
// must add up to the baseline it describes.
export function validate(r) {
  for (const p of r.profiles) {
    assert.deepEqual(p.groups.map(g => g.id), GROUPS.map(g => g.id), p.profile + ': every payload, once, in order');
    for (const g of p.groups) {
      if (g.blocked) { assert(g.marginalBytes === null && typeof g.blocked === 'string' && g.blocked.trim(), g.id + ': a blocked row carries its reason and no number'); continue; }
      for (const key of ['marginalBytes', 'withoutBytes', 'authoredBytes', 'ownCompressedBytes']) assert(Number.isSafeInteger(g[key]), `${p.profile}/${g.id}: ${key} must be measured`);
      assert(g.proof, g.id + ': a measurement needs its proof');
    }
    const q = p.partition;
    assert.equal(q.totalBytes, p.baseline.bytes, p.profile + ': the partition describes this baseline');
    assert.equal(q.elements.reduce((sum, e) => sum + e.storedBytes, 0) + q.fontBytes + q.otherBytes, q.totalBytes, p.profile + ': the parts add up');
  }
}
export function report(r) {
  validate(r);
  const cell = text => String(text).replace(/\|/g, '/').replace(/\s+/g, ' ');
  const lines = [`# Size ledger — ${r.packing === 'release' ? 'release/Zopfli packing' : 'fast/zlib packing, NOT a release measurement'}`, '',
    `Generated by \`repo/tools/size-ledger.mjs\` (${r.profiles.map(p => p.profile).join(' and ')}). Every marginal is the baseline minus a separate build of the same frozen source, same profile and packing, with exactly that payload omitted; each build is admitted by its own fresh receipt (time, profile, packing, bytes, SHA-256) and its decoded payloads. The omission builds are diagnostic files, not products, and no figure here is permission to remove a capability.`, '',
    `Measured ${r.measuredAt}; Node ${r.node}; canonical Node ${r.expectedNode}: **${r.canonical ? 'yes' : 'no'}**.`, ''];
  for (const p of r.profiles) {
    const q = p.partition;
    lines.push(`## ${p.profile} profile: ${p.file}`, '', `Baseline **${n(p.baseline.bytes)} bytes**, SHA-256 \`${p.baseline.sha256}\`.`, '',
      '| Payload | Input bytes | gzip -9 proxy | Marginal bytes | Without it | Proof |', '| --- | ---: | ---: | ---: | ---: | --- |',
      ...p.groups.map(g => `| ${g.name} | ${n(g.authoredBytes)} | ${n(g.ownCompressedBytes)} | ${g.blocked ? '**BLOCKED**' : n(g.marginalBytes)} | ${n(g.withoutBytes)} | ${cell(g.blocked || g.proof)} |`), '',
      `Where every byte of ${p.file} is (physical and exact: the rows add up to the file):`, '',
      '| Part | Bytes in the file | gzip | Decoded | Carries |', '| --- | ---: | ---: | ---: | --- |',
      ...q.elements.map(e => `| \`${e.id}\` | ${n(e.storedBytes)} | ${n(e.gzipBytes)} | ${n(e.decodedBytes)} | ${cell(e.carries)} |`),
      `| Font faces | ${n(q.fontBytes)} | | | ${q.fontFaces} \`@font-face\` rules${q.fontBytes ? ' with their base64 payloads inline in the shell' : ', carried inside the packed stylesheet record (counted in its element)'} |`,
      `| Shell, boot script, policy, separators | ${n(q.otherBytes)} | | | everything outside the parts above |`,
      `| **Total** | **${n(q.totalBytes)}** | | | |`, '', 'Inputs each omission takes out of this build:', '',
      ...p.groups.filter(g => g.inputs).map(g => `- ${g.name}: ` + (g.inputs.map(f => `\`${f.path}\` ${n(f.bytes)}`).join('; ') || 'none in this profile') + '.'), '');
  }
  const m = r.manifests, top = [...m[SCRIPTS], ...m[STYLES]].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 20);
  lines.push('## Authored files, largest first', '', 'The top twenty of `editor/scripts.json` and `editor/styles.json` together:', '',
    '| Rank | File | Bytes |', '| ---: | --- | ---: |', ...top.map((f, i) => `| ${i + 1} | \`${f.path}\` | ${n(f.bytes)} |`), '');
  for (const manifest of [SCRIPTS, STYLES]) lines.push(`Every row of \`${manifest}\`: ` + m[manifest].map(f => `\`${f.path}\` ${n(f.bytes)}`).join('; ') + '.', '');
  lines.push(`\`editor/engine.js\` is ${n(m.engineBytes)} authored bytes and not a \`${SCRIPTS}\` row: the build splices its satellites, \`editor/share.js\` and every script row into it.`, '',
    '## Reading it', '',
    '- Marginals do not add up: payloads share compression with their neighbours, and the build-derived search-cache identity moves with any edit to the build inputs. A negative marginal would mean growth.',
    '- The partition does add up, and it is the only table that does. A payload that crosses parts -- Draw lives in the editor runtime and the shared runtime -- is not another part to add to them.',
    '- The encoder build ships the worker the document profile ships (adapter and refusal, no encoder); the Draw build drops both classic scripts and every draw/ factory and keeps their callers, the Draw CSS and the notices; the styles build keeps the critical boot style and the fonts sheet; the PDF build drops the module and its global, not the export caller; the plug-in loader is the loader and its two manifests, not the MathJax and Mermaid engines fetched on demand.',
    '- A zero where a profile ships none of a payload (the document profile has no encoder) is a measurement: that omission build is byte-identical to its baseline.',
    '- Each vendor omission removes its packed element after the normal pinned derivation; the parser identities used by the search cache and all callers stay. The input column names the upstream files; the marginal measures the shipped derivation, not the upstream source size.',
    '- The gzip -9 column concatenates the listed inputs in the listed order: a proxy, not an allocation of the file.',
    '- Prior dated receipts are in [size-ledger-history.md](size-ledger-history.md); they describe their own trees and packings.', '');
  return lines.join('\n');
}

export function options(args) {
  const out = {profiles: ['document', 'full'], packing: 'release'};
  for (const arg of args) {
    let m;
    if (arg === '--ledger') continue;
    if ((m = /^--profile=(full|document)$/.exec(arg))) out.profiles = [m[1]];
    else if ((m = /^--packing=(release|fast)$/.exec(arg))) out.packing = m[1];
    else throw new Error('usage: node tools/size-ledger.mjs [--profile=full|document] [--packing=release|fast]; not ' + JSON.stringify(arg));
  }
  return {...out, publishes: out.packing === 'release' && out.profiles.length === 2};
}
export async function main(args = process.argv.slice(2)) {
  const opts = options(args), out = join(ROOT, 'dist/size-ledger'), name = [opts.packing, ...opts.profiles].join('-');
  const logs = join(out, 'logs-' + name);
  await mkdir(logs, {recursive: true});
  const work = await mkdtemp(join(out, 'work-')), frozen = join(work, 'frozen');
  try {
    await copyTree(ROOT, frozen);
    const toolchain = JSON.parse(await readFile(join(frozen, 'tools/toolchain.json'), 'utf8'));
    const profiles = [];
    for (const profile of opts.profiles) profiles.push(await measureProfile(frozen, work, profile, opts.packing, logs));
    const receipt = {measuredAt: new Date().toISOString(), node: process.version, expectedNode: toolchain.node.version,
      canonical: profiles.every(p => p.baseline.canonical), packing: opts.packing, profiles, manifests: await inventories(frozen)};
    await writeFile(join(out, name + '.json'), JSON.stringify(receipt, null, 2) + '\n');
    const markdown = report(receipt);
    await writeFile(join(out, name + '.md'), markdown);
    if (opts.publishes) await writeFile(join(ROOT, '../docs/size-ledger.md'), markdown);
    console.log(`[size-ledger] wrote dist/size-ledger/${name}.{json,md}` + (opts.publishes ? ' and docs/size-ledger.md' : ' (docs/size-ledger.md is written only by a release run of both profiles)') + '; build logs in dist/size-ledger/logs-' + name);
    const blocked = profiles.flatMap(p => p.groups.filter(g => g.blocked).map(g => `${p.profile}/${g.id}`));
    if (blocked.length) { console.error('[size-ledger] BLOCKED: ' + blocked.join(', ')); process.exitCode = 1; }
    return receipt;
  } finally { await rm(work, {recursive: true, force: true}); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
