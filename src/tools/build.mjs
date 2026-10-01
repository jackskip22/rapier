import {readFile, writeFile, mkdir, cp, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {searchCacheVersion} from './search-cache-version.mjs';
import {zopfliGzip, FAST_PACK} from './zopfli.mjs';
import vm from 'node:vm';
import {scriptMinifier, reflectedNames} from './minify.mjs';
import {buildJPEGXLWorker} from '../images/codec-build.mjs';
import acorn from '../agent/vendor/acorn.mjs';
import parseCSS from './vendor/postcss-parse.cjs';
import {TOOLS, UI_RESOURCE, mcpDescriptors} from '../agent/catalog.mjs';
import {encodeBase124} from './base124.mjs';
import {encodeTextPack} from './text-pack-build.mjs';
import {decodeTextPack} from './text-pack.mjs';
import {minifyVendor, BROWSER_MINIFY} from './minify-vendor.mjs';
import {entitiesVendor} from './entities-vendor.mjs';
import {VERSION} from '../version.mjs';
import {syncVersion} from './version-sync.mjs';
import {checkPurity} from './purity-gate.mjs';
import {csp} from '../security/csp.mjs';
import {checkHtmlSinks} from './html-sinks.mjs';
import {checkToolchain} from './check-toolchain.mjs';
import {SIZE_BUDGETS} from './profile-budgets.mjs';
import {shakeModule} from './tree-shake.mjs';
import {commercialPage} from './commercial-page.mjs';
import {seoSection} from './seo-page.mjs';

// One version: the plugin manifest and the packages carry version.mjs's number, written here before anything reads them.
// A file the tree does not carry (the public source cut) is named in `unchecked` below, never a refusal.
const versionSync = await syncVersion({absent: 'skip'});

// --ledger delegates to tools/size-ledger.mjs and keeps its exit status.
if (process.argv.includes('--ledger')) {
	await import('./size-ledger.mjs').then(m => m.main());
	process.exit();
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Build profiles (docs/build.md, "Build profiles"): `full` is byte-identical with
// RAPIER_PROFILE unset; `document` drops Draw, Paint and the JPEG XL encoder. The only read of the variable.
const RAPIER_PROFILE_RAW = process.env.RAPIER_PROFILE;
if (RAPIER_PROFILE_RAW !== undefined && RAPIER_PROFILE_RAW !== 'full' && RAPIER_PROFILE_RAW !== 'document') {
  throw new Error('RAPIER_PROFILE must be "full" or "document" (docs/build.md, "Build profiles"); got ' + JSON.stringify(RAPIER_PROFILE_RAW));
}
const PROFILE = RAPIER_PROFILE_RAW === 'document' ? 'document' : 'full';
const OUTPUT_FILE = PROFILE === 'document' ? 'rapier-document.html' : 'rapier.html';
// The Node floor comes from tools/toolchain.json; a patch mismatch builds but the receipt says so.
const toolchain = JSON.parse(await readFile(resolve(root, 'tools/toolchain.json'), 'utf8'));
// The build runs on one Node major (Weapon P2-10): the receipt names it, and an older runtime is
// refused here rather than producing a different artifact quietly.
const NODE_MAJOR_MIN = toolchain.nodeFloor.major;
if (Number(process.versions.node.split('.')[0]) < NODE_MAJOR_MIN) throw new Error('Rapier builds on Node ' + NODE_MAJOR_MIN + '+; this is ' + process.version);
const toolchainCanonical = process.version === toolchain.node.version;
// Refuse when a pinned toolchain literal (rapier.yml, build.gradle.kts, Rapier.vcxproj) drifts from tools/toolchain.json.
// A tree absent from the public repository is not compared and is named in `unchecked`; tools/stage-public.mjs proves the rebuild.
const absentFromTree = (...paths) => paths.filter(path => !existsSync(resolve(root, path)));
const unchecked = [];
if (versionSync.absent.length) unchecked.push('one version (tools/version-sync.mjs): ' + versionSync.absent.join(', ') + ' not in this tree');
{
  const absent = absentFromTree('.github/workflows/rapier.yml', 'android', 'windows');
  if (absent.length) unchecked.push('toolchain consistency (tools/check-toolchain.mjs): ' + absent.join(', ') + ' not in this tree');
  else {
    const toolchainDrift = checkToolchain();
    if (toolchainDrift.problems.length) throw new Error('Toolchain consistency: ' + toolchainDrift.problems.join('; '));
  }
}
// HTML sink law (security/html-sinks.json): refused before a byte is assembled.
const htmlSinks = checkHtmlSinks();
if (htmlSinks.problems.length) throw new Error('HTML sink law: ' + htmlSinks.problems.join('; '));
// Two top-level declarations of one name across editor/scripts.json files become one binding here (R87j E01): refused
// (tools/probes/scan-assembled-collisions.mjs).
{
  const collisions = spawnSync(process.execPath, [fileURLToPath(new URL('probes/scan-assembled-collisions.mjs', import.meta.url)), '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  let report = null;
  try { report = JSON.parse(collisions.stdout); } catch (_) {}
  if (!report) throw new Error('assembled-scope law: the collision scanner did not run (' + String(collisions.error?.message || collisions.status) + '); a scanner that did not run is not a scanner that found nothing');
  if (report.offenders) throw new Error('assembled-scope law: ' + report.rows.map(r => r.name + ' declared in ' + r.sites.map(s => s.file + ':' + s.line).join(' and ') + ' (' + r.winner + ' wins by hoisting)').join('; '));
}
const read = path => readFile(resolve(root, path), 'utf8');
const MODULES = new Map();
const EXPORTS = new Map(), bundling = new Set(), DEPS = new Map();
// What each bundled module imports from each other (dependency -> names), and the source each was
// assembled from: the tree-shake below reads both.
const IMPORTED = new Map(), MODULE_SOURCES = new Map();
// Only pretext, model and md-layout are retained into the styled export's factory set; the
// export never carries a drawing recipe or the Draw modules, only numeric wrap polygons.
const retainedModule = path => path.startsWith('agent/vendor/pretext/') || path === 'layout/model.mjs' || path === 'layout/line-plan.mjs' || path === 'spec/md-layout.mjs';
const parse = (source, sourceType = 'script') => acorn.parse(source, {ecmaVersion: 'latest', sourceType});
// A comment ships only when it is a licence notice -- `/*!`, `@license` or `@preserve`, an SPDX line, a
// copyright statement ("Copyright (c)", "Copyright ©" or a year) or a licence grant ("Licensed
// under", "Permission is hereby granted") -- or a `# sourceURL`/`# sourceMappingURL` directive. A
// developer comment that merely mentions a licence does not ship (_page-notices.mjs under profile-seams).
const keepsComment = value => /^(?:!|[#@]\s*source)|@license|@preserve|SPDX-License-Identifier|\bcopyright\s*(?:\(c\)|©|\d{4})|\blicen[sc]ed under\b|\bpermission is hereby granted\b/i.test(value);

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

function identifiers(pattern) {
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(row => identifiers(row.value || row.argument));
  if (pattern.type === 'ArrayPattern') return pattern.elements.filter(Boolean).flatMap(identifiers);
  if (pattern.type === 'AssignmentPattern') return identifiers(pattern.left);
  if (pattern.type === 'RestElement') return identifiers(pattern.argument);
  throw new Error('Unsupported export binding: ' + pattern.type);
}

// --- Decision purity gate (docs/kernel.md, "The gates"): agent/kernel.mjs's real import graph, identifiers resolved to their bindings
// (tools/purity-gate.mjs; vectors in tools/purity-vectors/). ---
const PURITY_ENTRY = 'agent/kernel.mjs';
// No per-file exemption: agent/diff.mjs takes `now` and `schedule` as options.
const purityViolations = await checkPurity(resolve(root, PURITY_ENTRY), {baseDir: root});
if (purityViolations.length) throw new Error(`Decision purity gate: ${PURITY_ENTRY} must receive its clock, randomness, network and DOM facts from its caller, never read them itself, directly or through an import (docs/kernel.md, "The gates"):\n` +
  purityViolations.map(row => '  ' + row).join('\n'));


// --- Convention owner gate: the marker literals appear only in spec/md-marks.mjs, docs and witnesses. ---
const MARK_CONVENTION_LITERALS = ['<!--c ', '<!--/c-->', '<!--md-break:v1', '<!--ink ', '<!--/ink-->'];
const MARK_CONVENTION_OWNER = 'spec/md-marks.mjs';
// tools/build.mjs names the literals below in order to look for them; that is the gate itself,
// not a second implementation of the grammar (it writes nothing and parses nothing with them).
const MARK_CONVENTION_ALLOWED = new Set([MARK_CONVENTION_OWNER, 'tools/build.mjs']);
// skills/ is documentation an agent reads (skills/README.md); it quotes the grammar, as docs/markdown-standard.md does, and parses nothing.
const MARK_CONVENTION_SKIP_DIRS = new Set(['dist', '.git', '.wrangler', 'node_modules', 'tools/witnesses', 'skills']);
const MARK_CONVENTION_SKIP_FILES = new Set(['rapier.html', 'rapier-document.html', 'sw.js', 'AGENT-TOOLS.json']);
const MARK_CONVENTION_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.md']);

async function markConventionViolations(dir = '') {
  const findings = [];
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const relPath = dir ? dir + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (MARK_CONVENTION_SKIP_DIRS.has(relPath) || MARK_CONVENTION_SKIP_DIRS.has(entry.name)) continue;
      findings.push(...await markConventionViolations(relPath));
      continue;
    }
    if (MARK_CONVENTION_ALLOWED.has(relPath) || MARK_CONVENTION_SKIP_FILES.has(relPath)) continue;
    const dot = entry.name.lastIndexOf('.');
    if (dot < 0 || !MARK_CONVENTION_EXTENSIONS.has(entry.name.slice(dot))) continue;
    const text = await readFile(resolve(root, relPath), 'utf8');
    for (const literal of MARK_CONVENTION_LITERALS) {
      if (text.includes(literal)) findings.push(relPath + ': ' + JSON.stringify(literal));
    }
  }
  return findings;
}

const markConventionFindings = await markConventionViolations();
if (markConventionFindings.length) throw new Error('Convention owner gate: only ' + MARK_CONVENTION_OWNER +
  ' may spell out the text-colour/page-break/ink comment markers; every other owner must call it instead ' +
  '(docs/markdown-standard.md, "Text colour", "Page break", "Ink"):\n' + markConventionFindings.map(row => '  ' + row).join('\n'));

// --- MCP descriptor projection law: AGENT-TOOLS.json and mcp/worker.mjs DESCRIPTORS come from one mcpDescriptors call; refuse on the first differing path. ---
const manifestMcp = mcpDescriptors({uiResource: UI_RESOURCE});
if (absentFromTree('mcp/worker.mjs').length) unchecked.push('MCP descriptor projection law: mcp/worker.mjs not in this tree');
else {
  const {DESCRIPTORS: workerDescriptors} = await import('../mcp/worker.mjs');
  const normalize = value => JSON.parse(JSON.stringify(value));
  const firstDiff = (a, b, path) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return path;
      for (let index = 0; index < a.length; index++) {
        const found = firstDiff(a[index], b[index], `${path}[${index}]`);
        if (found) return found;
      }
      return null;
    }
    if ((a && typeof a === 'object') || (b && typeof b === 'object')) {
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return path;
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const found = firstDiff(a[key], b[key], `${path}.${key}`);
        if (found) return found;
      }
      return null;
    }
    return a === b ? null : path;
  };
  const diff = firstDiff(normalize(manifestMcp), normalize(workerDescriptors), 'mcp');
  if (diff) throw new Error('MCP descriptor projection law: AGENT-TOOLS.json\'s mcp entry would differ ' +
    'from mcp/worker.mjs\'s live DESCRIPTORS at ' + diff + ' -- one function (agent/catalog.mjs ' +
    'mcpDescriptors) must produce both, fed the same deployment facts (docs/kernel.md, "The gates").');
}

function apply(source, changes) {
  const sorted = changes.sort((a, b) => b.start - a.start);
  let previous = Infinity;
  for (const row of sorted) {
    if (row.end > previous) throw new Error('Overlapping assembly edits');
    source = source.slice(0, row.start) + row.text + source.slice(row.end);
    previous = row.start;
  }
  return source;
}

// tools/minify.mjs: whitespace out, private names shortened; reflected functions keep their names and free names (checked every build).
// Names are recorded in dist/runtime-symbols-<profile>.json, never the page.
const lean = scriptMinifier(await Promise.all(['editor/engine.js', 'editor/share.js', 'editor/source-store.js', 'editor/lexer.js', ...JSON.parse(await read('editor/scripts.json'))].map(read)), keepsComment);

// Stylesheets: PostCSS tree with whitespace raws emptied. Escaped or commented selectors stay verbatim (the list helper trims).
function packStyleWhitespace(source) {
  const tree = parseCSS(source);
  tree.walk(node => {
    node.raws.before = '';
    if ('after' in node.raws) node.raws.after = '';
    if ('between' in node.raws) node.raws.between = node.type === 'decl' ? ':' : '';
    if (node.type === 'rule' && !node.selector.includes('\\') && !node.selector.includes('/*')) node.selector = node.selectors.join(',');
    if (node.nodes) node.raws.semicolon = false;
  });
  tree.raws.after = '';
  return tree.toString();
}
// A stylesheet's own WOFF2 files (shell/fonts/fonts.css names the two) are inlined as data URLs:
// the page carries exactly those bytes and asks for nothing.
async function inlineFonts(css, path) {
  for (const [url, file] of new Map([...css.matchAll(/url\('([\w.-]+\.woff2)'\)/g)].map(m => [m[0], m[1]])))
    css = css.replaceAll(url, "url('data:font/woff2;base64," + (await readFile(resolve(root, dirname(path), file))).toString('base64') + "')");
  return css;
}
function stripStyleComments(source) {
  const parts = [];
  let cursor = 0, quote = '', url = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') { index++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (url) { if (char === '(') url++; else if (char === ')') url--; continue; }
    if (source.slice(index, index + 4).toLowerCase() === 'url(' && !/[\w-]/.test(source[index - 1] || '')) { url = 1; index += 3; continue; }
    if (char !== '/' || source[index + 1] !== '*') continue;
    const end = source.indexOf('*/', index + 2);
    if (end < 0) throw new Error('Unclosed stylesheet comment');
    if (!keepsComment(source.slice(index + 2, end)) && (!index || end + 2 === source.length || /[ \t\r\n\f]/.test(source[index - 1]) || /[ \t\r\n\f]/.test(source[end + 2]))) {
      parts.push(source.slice(cursor, index));
      cursor = end + 2;
    }
    index = end + 1;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

function stripMarkupComments(source) {
  const parts = [];
  let cursor = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== '<') continue;
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      if (end < 0) throw new Error('Unclosed interface comment');
      const content = source.slice(index + 4, end);
      if (!keepsComment(content) && !/\bRAPIER_[A-Z_]+\b/.test(content)) {
        parts.push(source.slice(cursor, index));
        cursor = end + 3;
      }
      index = end + 2;
      continue;
    }
    const tag = /^<\/?([a-z][a-z0-9:-]*)\b/i.exec(source.slice(index));
    if (!tag) continue;
    let end = index + tag[0].length, quote = '';
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (source[index + 1] !== '/' && /^(?:script|style|textarea|title|xmp|iframe|noembed|noframes|plaintext)$/i.test(tag[1])) {
      const closing = new RegExp('</' + tag[1] + '(?=[\\t\\n\\f\\r />])', 'gi');
      closing.lastIndex = end + 1;
      const close = closing.exec(source);
      if (!close) break;
      index = close.index - 1;
    } else index = end;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

// A notice the Licences sheet shows in full ships once; the module header is left out and the sheet is checked below.
const SHEET_NOTICES = new Map([
  ['draw/freehand.mjs', 'Copyright (c) 2021 Stephen Ruiz Ltd'],
  ['draw/rough.mjs', 'Copyright (c) 2019 Preet Shihn'],
  ['agent/diff.mjs', 'Copyright (c) 2009-2015, Kevin Decker'],
]);
const sheetNotices = new Map();
function withoutSheetNotice(path, source) {
  const notice = /^\/\*!?([\s\S]*?)\*\/\n?/.exec(source);
  if (!notice || !notice[1].includes(SHEET_NOTICES.get(path))) throw new Error('Expected the licence notice at the head of ' + path);
  sheetNotices.set(path, notice[1]);
  return source.slice(notice[0].length);
}
// Markup: leading whitespace runs become the line break alone; <pre>, <code>, <textarea> untouched.
function dropIndentation(markup) {
  const collapse = text => text.replace(/[ \t\f\r]*\n[ \t\n\f\r]*/g, '\n'), parts = [];
  let cursor = 0;
  for (const verbatim of markup.matchAll(/<(pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)) {
    parts.push(collapse(markup.slice(cursor, verbatim.index)), verbatim[0]);
    cursor = verbatim.index + verbatim[0].length;
  }
  return parts.join('') + collapse(markup.slice(cursor));
}

// The page's catalog drops outputSchema (the page never reads it); every served catalog keeps it.
function withoutResultSchemas(source) {
  const found = [];
  walk(parse(source, 'module'), node => { if (node.type === 'Property' && !node.computed && node.key.name === 'outputSchema') found.push(node); });
  if (found.length !== 1) throw new Error('agent/catalog.mjs must build every outputSchema in one place, its tool factory');
  const {source: shaken, removed} = shakeModule(source.slice(0, source.lastIndexOf(',', found[0].start)) + source.slice(found[0].end), ['resultProperties']);
  if (!removed.includes('resultProperties')) throw new Error('agent/catalog.mjs: the result properties did not leave the page\'s copy');
  return shaken;
}

async function bundle(path) {
  if (MODULES.has(path)) return;
  if (path === 'layout/bottom-surfaces.mjs') {
    const {inventory} = await import('../layout/bottom-surfaces.mjs');
    EXPORTS.set(path, new Set(['inventory', 'surfaces']));
    MODULES.set(path, `modules[${JSON.stringify(path)}] = (() => {\nconst inventory = Object.freeze(${JSON.stringify(inventory)});\nconst surfaces = inventory.surfaces;\nreturn {inventory:inventory, surfaces:surfaces};\n})();`);
    return;
  }
  if (bundling.has(path)) throw new Error('Browser module cycle: ' + path);
  bundling.add(path);
  const text = await read(path);
  const source = SHEET_NOTICES.has(path) ? withoutSheetNotice(path, text) : path === 'agent/catalog.mjs' ? withoutResultSchemas(text) : text;
  const tree = parse(source, 'module');
  if (path === 'agent/kernel.mjs') {
    const entries = [];
    walk(tree, node => { if (node.type === 'FunctionDeclaration' && node.id?.name === 'execute') entries.push(node); });
    // The one `switch (name)` inside `execute`, within the finalizer's try.
    const switches = [];
    if (entries.length === 1) walk(entries[0].body, node => { if (node.type === 'SwitchStatement' && node.discriminant.name === 'name') switches.push(node); });
    const dispatch = switches.length === 1 && switches[0];
    const cases = dispatch?.cases.filter(row => row.test).map(row => row.test.value);
    const names = TOOLS.map(row => row.name);
    if (!cases || cases.length !== new Set(cases).size || names.length !== new Set(names).size ||
      cases.toSorted().join('\n') !== names.toSorted().join('\n')) throw new Error('Tool catalog and kernel dispatch differ');
  }
  for (const node of tree.body) if (node.type === 'ImportDeclaration') {
    const dependency = relative(root, resolve(root, dirname(path), node.source.value)).replaceAll('\\', '/');
    (DEPS.get(path) || DEPS.set(path, []).get(path)).push(dependency);
    await bundle(dependency);
    const imported = IMPORTED.get(dependency) || IMPORTED.set(dependency, new Set()).get(dependency);
    for (const row of node.specifiers) {
      if (row.type !== 'ImportSpecifier' || !EXPORTS.get(dependency)?.has(row.imported.name))
        throw new Error('Missing named export in ' + dependency + ' for ' + path + ': ' + (row.imported?.name || row.local.name));
      imported.add(row.imported.name);
    }
  }
  MODULE_SOURCES.set(path, source);
  assemble(path, source);
  bundling.delete(path);
}
// A module's text in the bundle: its imports read from the modules already assembled, its exports
// returned. Re-assembling a module (the tree-shake below) keeps its place, so a factory still runs
// before every module that imports it.
function assemble(path, source) {
  const tree = parse(source, 'module'), changes = [], exported = [];
  for (const node of tree.body) {
    if (node.type === 'ImportDeclaration') {
      const dependency = relative(root, resolve(root, dirname(path), node.source.value)).replaceAll('\\', '/');
      const fields = node.specifiers.map(row => row.imported.name + ':' + row.local.name);
      changes.push({start: node.start, end: node.end, text: `const {${fields.join(',')}} = modules[${JSON.stringify(dependency)}];`});
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.source) throw new Error('Use local named exports in browser modules: ' + path);
      if (node.declaration) {
        const declaration = node.declaration;
        const names = declaration.type === 'VariableDeclaration' ? declaration.declarations.flatMap(row => identifiers(row.id)) : [declaration.id.name];
        exported.push(...names.map(name => name + ':' + name));
        changes.push({start: node.start, end: declaration.start, text: ''});
      } else {
        exported.push(...node.specifiers.map(row => row.exported.name + ':' + row.local.name));
        changes.push({start: node.start, end: node.end, text: ''});
      }
    } else if (node.type === 'ExportDefaultDeclaration') throw new Error('Default exports do not belong in the browser kernel');
  }
  EXPORTS.set(path, new Set(exported.map(row => row.slice(0, row.indexOf(':')))));
  MODULES.set(path, `modules[${JSON.stringify(path)}] = (${retainedModule(path) ? `artifactFactories[${JSON.stringify(path)}] = ` : ''}() => {\n${apply(source, changes)}\nreturn {${exported.join(',')}};\n})();`);
}

await bundle('agent/catalog.mjs');
await bundle('skills/rapier-html/return-address.mjs');
await bundle('agent/kernel.mjs');
await bundle('agent/structure-request.mjs');
await bundle('agent/markdown-spec.mjs');
await bundle('layout/model.mjs');
await bundle('layout/occlusion.mjs');
await bundle('layout/occlusion-viewport.mjs');
await bundle('layout/transient-lifecycle.mjs');
await bundle('layout/bottom-surfaces.mjs');
await bundle('layout/markdown.mjs');
await bundle('images/assets.mjs');
await bundle('images/archive.mjs');
await bundle('interchange/docx.mjs');
await bundle('interchange/pdf.mjs');
await bundle('agent/vendor/pretext/rich-inline.js');
// draw/core.mjs, draw/edit.mjs and draw/font.mjs ship in every profile: the kernel's document.draw imports them.
await bundle('draw/core.mjs');
await bundle('draw/edit.mjs');
await bundle('draw/font.mjs');
if (PROFILE === 'full') {
  await bundle('draw/paint.mjs');
  await bundle('draw/brushes.mjs');
  // R86 Notes model, dropped with notes/notes.js in the document profile.
  await bundle('notes/model.mjs');
  await bundle('notes/audio.mjs');
  await bundle('notes/takeout.mjs');
  await bundle('notes/import-notion.mjs');
  await bundle('notes/import-simplenote.mjs');
  await bundle('notes/import-standardnotes.mjs');
  await bundle('notes/import-joplin.mjs');
  await bundle('notes/import.mjs');
  await bundle('notes/import-pictures.mjs');
  await bundle('notes/import-receipt.mjs');
  await bundle('notes/import-undo-face.mjs');
  await bundle('notes/import-plan.mjs');
  await bundle('notes/import-markdown.mjs');
  await bundle('notes/html-md.mjs');
  await bundle('notes/import-enex.mjs');
  await bundle('notes/import-html.mjs');
  await bundle('notes/zip.mjs');
  await bundle('notes/todo.mjs');
  await bundle('notes/links.mjs');
  await bundle('notes/search.mjs');
  await bundle('notes/ocr.mjs');
  await bundle('notes/restore.mjs'); // also published as a global
  await bundle('notes/trash.mjs');
  await bundle('notes/history.mjs');
  await bundle('notes/owner.mjs');
  await bundle('notes/idb-store.mjs');
  await bundle('notes/opfs.mjs');
  await bundle('notes/folder.mjs');
  await bundle('notes/library-window.mjs');
  await bundle('notes/library-reads.mjs');
}
await bundle('agent/door-identity.mjs');
const globals = {'RapierPageReturnAddress': 'skills/rapier-html/return-address.mjs', 'RapierMarkdownSpec': 'agent/markdown-spec.mjs', 'RapierMarkdownLayout': 'layout/markdown.mjs', 'RapierImageAssets': 'images/assets.mjs', 'RapierImageArchive': 'images/archive.mjs', 'RapierDocxImport': 'interchange/docx.mjs', 'RapierPdf': 'interchange/pdf.mjs', 'RapierAgentCatalog': 'agent/catalog.mjs', 'RapierKernel': 'agent/kernel.mjs', 'RapierJournalRecords': 'editor/journal-records.mjs', 'RapierColourMath': 'editor/colour-math.mjs', 'RapierAgentWill': 'agent/will.mjs', 'RapierAgentMarkdown': 'agent/markdown.mjs', 'RapierStructureRequest': 'agent/structure-request.mjs', 'RapierImageLayout': 'layout/model.mjs', 'RapierOcclusion': 'layout/occlusion.mjs', 'RapierOcclusionViewport': 'layout/occlusion-viewport.mjs', 'RapierTransientLifecycle': 'layout/transient-lifecycle.mjs', 'RapierBottomSurfaces': 'layout/bottom-surfaces.mjs', 'RapierPretext': 'agent/vendor/pretext/rich-inline.js', 'RapierDrawCore': 'draw/core.mjs', 'RapierFlowchart': 'draw/flowchart.mjs', 'RapierDrawEdit': 'draw/edit.mjs', 'RapierDrawFonts': 'draw/font.mjs', 'RapierDrawLetters': 'draw/letters.mjs', ...(PROFILE === 'full' ? {'RapierPersonal': 'notes/personal.mjs', 'RapierDrawPaint': 'draw/paint.mjs', 'RapierDrawBrushes': 'draw/brushes.mjs', 'RapierNotesModel': 'notes/model.mjs', 'RapierNotesLibraryWindow': 'notes/library-window.mjs', 'RapierNotesLibraryReads': 'notes/library-reads.mjs', 'RapierNotesTakeout': 'notes/takeout.mjs', 'RapierNotesImportNotion': 'notes/import-notion.mjs', 'RapierNotesImportSimplenote': 'notes/import-simplenote.mjs', 'RapierNotesImportStandardNotes': 'notes/import-standardnotes.mjs', 'RapierNotesImportJoplin': 'notes/import-joplin.mjs', 'RapierNotesImport': 'notes/import.mjs', 'RapierNotesImportPictures': 'notes/import-pictures.mjs', 'RapierNotesImportReceipt': 'notes/import-receipt.mjs', 'RapierNotesImportUndoFace': 'notes/import-undo-face.mjs', 'RapierNotesImportPlan': 'notes/import-plan.mjs', 'RapierNotesFrontMatter': 'notes/frontmatter.mjs', 'RapierNotesLinks': 'notes/links.mjs', 'RapierNotesSearch': 'notes/search.mjs', 'RapierNotesOcr': 'notes/ocr.mjs', 'RapierNotesSearchCache': 'notes/search-cache.mjs', 'RapierNotesImportMarkdown': 'notes/import-markdown.mjs', 'RapierNotesImportEnex': 'notes/import-enex.mjs', 'RapierNotesImportHtml': 'notes/import-html.mjs', 'RapierNotesRestore': 'notes/restore.mjs', 'RapierNotesTrash': 'notes/trash.mjs', 'RapierNotesHistory': 'notes/history.mjs', 'RapierNotesIntegrity': 'notes/integrity.mjs', 'RapierNotesZip': 'notes/zip.mjs', 'RapierNotesBackup': 'notes/backup.mjs', 'RapierNotesBackupWorker': 'notes/backup-worker.mjs', 'RapierNotesOPFSWorker': 'notes/opfs-worker.mjs', 'RapierNotesOwner': 'notes/owner.mjs', 'RapierNotesOPFS': 'notes/opfs.mjs', 'RapierNotesIdbStore': 'notes/idb-store.mjs', 'RapierNotesFolder': 'notes/folder.mjs', 'RapierNotesTodo': 'notes/todo.mjs', 'RapierNotesAudio': 'notes/audio.mjs', 'RapierNotesAttachments': 'notes/attachments.mjs', 'RapierNotesSync': 'notes/sync.mjs', 'RapierNotesVault': 'notes/vault.mjs', 'RapierNotesMerge': 'notes/merge.mjs', 'RapierNotesSyncSession': 'notes/sync-session.mjs', 'RapierCloudProviders': 'notes/cloud-providers.mjs', 'RapierWebDAVTransport': 'notes/transport-webdav.mjs'} : {}), 'RapierNativeTransport': 'shell/native-transport.mjs', 'RapierDoorIdentity': 'agent/door-identity.mjs', 'RapierDiff': 'agent/diff.mjs'};
// Every published global is a build root: a declared capability whose module was never bundled froze `undefined` (R86m's dead BACKUP).
for (const path of Object.values(globals)) await bundle(path);
// Unconsumed exports are shaken out with the code only they reach (tools/tree-shake.mjs).
// Kept whoever reads it: published modules' exports (docs/intent.md, "Nothing comes out of Rapier"),
// styled-export factories, reflected functions (minify.mjs reflectedNames), `__rapier*` seams and a module SEAMS table.
const shakenExports = {};
{
  const published = new Set(Object.values(globals));
  const classic = await Promise.all(['editor/engine.js', 'editor/share.js', 'editor/source-store.js', ...JSON.parse(await read('editor/scripts.json'))].map(read));
  const reflected = reflectedNames([...classic.map(text => parse(text)), ...[...MODULE_SOURCES.values()].map(text => parse(text, 'module'))]);
  for (const [path, source] of MODULE_SOURCES) {
    if (published.has(path) || retainedModule(path)) continue;
    const used = IMPORTED.get(path) || new Set();
    const drop = [...EXPORTS.get(path)].filter(name => !used.has(name) && !reflected.has(name) && !/^__rapier/.test(name) && name !== 'SEAMS');
    if (!drop.length) continue;
    const shaken = shakeModule(source, drop);
    if (!shaken.unexported.length) continue;
    MODULE_SOURCES.set(path, shaken.source);
    assemble(path, shaken.source);
    shakenExports[path] = shaken.unexported;
  }
}
// Content-address the assembled modules, shell scripts, parser identities and assembly. Vendor files live under shell/vendor/,
// pinned in shell/vendor/PROVENANCE.json: a changed byte without its record refuses. The page is output only.
const VENDOR_GROUPS = {
  'lib-dompurify': ['dompurify-3.4.13.dist.purify.min.js'],
  'lib-turndown': ['turndown-7.2.4.lib.turndown.browser.umd.js'],
  'lib-markdownit': ['markdown-it-15.0.0.umd.min.js', 'markdown-it-task-lists-2.1.1.min.js', 'markdown-it-footnote-4.0.0.min.js',
    'markdown-it-mark-4.0.0.min.js', 'markdown-it-sub-2.0.0.min.js', 'markdown-it-sup-2.0.0.min.js', 'markdown-it-emoji-3.1.0-light.min.js',
    'markdown-it-abbr-2.0.0.min.js', 'markdown-it-ins-4.0.0.min.js', 'markdown-it-deflist-4.0.0.min.js'],
  // The GPU lexer: deflated until WebGPU colours a block; editor/code-tokens.mjs reads the same nine types.
  'lib-gpu-lexer': ['gpu-lexer-0.0.1.js'],
  'lib-acorn': ['acorn-8.18.0.dist.acorn.js'],
};
// Spans derived once per group and reused, so the search-cache key reads this build's parser, never the previous output (#324).
const vendorSpans = new Map();
async function deriveVendorGroup(id) {
  if (vendorSpans.has(id)) return vendorSpans.get(id);
  const provenance = JSON.parse(await read('shell/vendor/PROVENANCE.json')), spans = [];
  for (const name of VENDOR_GROUPS[id]) {
    const bytes = await readFile(resolve(root, 'shell/vendor', name)), record = provenance.files[name];
    if (!record || record.bytes !== bytes.length || record.sha256 !== checksum(bytes)) throw new Error('Vendor file ' + name + ' does not match shell/vendor/PROVENANCE.json');
    // BROWSER-MINIFY.json vendors ship minified (tools/minify-vendor.mjs); markdown-it's entity table re-encoded (tools/entities-vendor.mjs).
    const source = bytes.toString('utf8'), minified = minifyVendor(name, source), reencoded = entitiesVendor(name, source);
    if (minified !== null && reencoded) throw new Error('Vendor file ' + name + ' has two pinned derivations');
    spans.push(reencoded || (minified === null ? {name, source} : {name: BROWSER_MINIFY.vendors.find(row => row.upstream.name === name).derived.name, source: minified}));
  }
  vendorSpans.set(id, spans);
  return spans;
}
if (PROFILE === 'full') {
  const parserSpans = (await deriveVendorGroup('lib-markdownit')).map(({name, source}) => [name, checksum(Buffer.from(source))]);
  if (!parserSpans.length) throw new Error('Search cache needs the parser identities of the spans this build packs');
  const scripts = JSON.parse(await read('editor/scripts.json'));
  const key = searchCacheVersion([
    ...MODULES.entries(),
    ...await Promise.all(['editor/engine.js', 'editor/scripts.json', ...scripts, 'tools/build.mjs', 'tools/minify.mjs', 'tools/text-pack.mjs', 'tools/text-pack-build.mjs', 'tools/runtime-symbols.mjs', 'tools/search-cache-version.mjs'].map(async path => [path, await read(path)])),
    ...parserSpans,
  ]);
  const path = 'notes/search-cache.mjs', marker = '__RAPIER_SEARCH_CACHE_VERSION__';
  if (MODULES.get(path).split(marker).length !== 2) throw new Error('Search cache identity slot must occur once');
  MODULES.set(path, MODULES.get(path).replace(marker, key));
}
// File and backup workers share one retained factory per dependency. Each source projects
// only its own closure, dependencies first; shared hashing/paths are not packed twice.
const workerClosure = entry => { const seen = new Set(); const visit = path => { if (seen.has(path)) return; seen.add(path); for (const dep of DEPS.get(path) || []) visit(dep); }; visit(entry); return [...MODULES.keys()].filter(path => seen.has(path)); };
const workerEntries = [['notes/backup-worker.mjs', 'installBackupWorker'], ['notes/opfs-worker.mjs', 'installOPFSWorker']].filter(([entry]) => MODULES.has(entry));
const workerPaths = new Set(workerEntries.flatMap(([entry]) => workerClosure(entry)));
for (const path of workerPaths) {
  const head = `modules[${JSON.stringify(path)}] = (`;
  if (!MODULES.get(path).startsWith(head)) throw new Error('Worker module is not an ordinary factory: ' + path);
  MODULES.set(path, head + `workerFactories[${JSON.stringify(path)}] = ` + MODULES.get(path).slice(head.length));
}
const workerSource = workerEntries.map(([entry, install]) => `
Object.defineProperty(modules[${JSON.stringify(entry)}], 'workerSource', {value: () => '(() => {\\nconst modules = {};\\n' +
  ${JSON.stringify(workerClosure(entry))}.map(path => 'modules[' + JSON.stringify(path) + '] = (' + workerFactories[path].toString() + ')();').join('\\n') +
  '\\nmodules[${JSON.stringify(entry)}].${install}(self);\\n})();\\n'});`).join('');
const pretextLicense = await read('agent/vendor/pretext/LICENSE');
// Pretext's licence rides once, as the string the styled export writes; the Licences sheet shows it.
const bundleText = await lean('(() => {\nconst modules = {}, artifactFactories = {}' + (workerPaths.size ? ', workerFactories = {}' : '') + ';\n' + [...MODULES.values()].join('\n') + workerSource + '\n' + Object.entries(globals).map(([name, path]) => `globalThis.${name} = Object.freeze(modules[${JSON.stringify(path)}]);`).join('\n') + '\nglobalThis.RapierArtifactLayoutDependencies = Object.freeze({factories:Object.freeze(artifactFactories),license:' + JSON.stringify(pretextLicense) + '});\n})();', 'rapier-shared.js');
new vm.Script(bundleText, {filename: 'rapier-agent-bundle.js'});

let html = await read('rapier.html');
// The shell's licence comment is the notice only, byte for byte, ending at its Licenses line.
{
  const notice = /^<!DOCTYPE html>\n<!--\n[\s\S]*?\tFull licence, no-warranty terms, and exact source download: Settings → Licenses\.\n/.exec(html);
  const close = notice ? html.indexOf('-->', notice[0].length) : -1;
  if (close < 0) throw new Error('The shell must open with its licence notice');
  html = notice[0] + html.slice(close);
}
// The policy is generated from its owner, not inherited from a previous packed artifact.
const policySlot = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/g;
if ([...html.matchAll(policySlot)].length !== 1) throw new Error('The page must have exactly one policy slot');
html = html.replace(policySlot, () => '<meta http-equiv="Content-Security-Policy" content="' + csp('web') + '">');
let ui = await read('editor/ui.html');
// Notes' markup sits between RAPIER_NOTES
// markers in editor/ui.html: dropped in the document profile; the full profile loses only the markers.
const notesMarkup = /<!-- RAPIER_NOTES_BEGIN -->([\s\S]*?)<!-- RAPIER_NOTES_END -->/g, notesRegions = [...ui.matchAll(notesMarkup)];
if (!notesRegions.length || notesRegions.some(([, inner]) => inner.includes('<!-- RAPIER_NOTES_')) ||
  ui.split('<!-- RAPIER_NOTES_').length - 1 !== 2 * notesRegions.length) throw new Error('Notes markup markers are unbalanced');
ui = PROFILE === 'full' ? ui.replace(/<!-- RAPIER_NOTES_(?:BEGIN|END) -->/g, '') : ui.replace(notesMarkup, '');
// The commercial sheet (rapier.website/commercial) is the full profile's only: its checkout slots are filled from
// commercial-checkout.json before anything is packed, the document profile drops it, and the ChatGPT copy is packed
// without it below (no link that starts a purchase rides there). Its markers stay until the interface is assembled.
const commercialMarkup = /<!-- RAPIER_COMMERCIAL_BEGIN -->[\s\S]*?<!-- RAPIER_COMMERCIAL_END -->\n?/g;
if ([...ui.matchAll(commercialMarkup)].length !== 1 || ui.split('<!-- RAPIER_COMMERCIAL_').length !== 3) throw new Error('Commercial sheet markers are unbalanced');
ui = PROFILE === 'full' ? commercialPage(ui, JSON.parse(await read('commercial-checkout.json'))) : ui.replace(commercialMarkup, '');
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const freehandNotice = /^\/\*([\s\S]*?)\*\//.exec(await read('draw/freehand.mjs'))?.[1].replace(/^ {3}/gm, '').trim();
if (!freehandNotice?.includes('MIT License') || !freehandNotice.includes('Copyright (c) 2021 Stephen Ruiz Ltd')) throw new Error('Missing perfect-freehand notice');
const roughNotice = /^\/\*([\s\S]*?)\*\//.exec(await read('draw/rough.mjs'))?.[1].replace(/^ {3}/gm, '').trim();
if (!roughNotice?.includes('MIT License') || !roughNotice.includes('Copyright (c) 2019 Preet Shihn')) throw new Error('Missing rough.js notice');
// The Paint engine is a port of libmypaint (ISC) and the factory brushes are Brien Dieterle's (CC0):
// both notices are read from their own files and shown where a person can read them.
const mypaintNotice = (await read('draw/vendor-notices/libmypaint-COPYING.txt')).trim();
if (!mypaintNotice.includes('Martin Renold') || !mypaintNotice.includes('Permission to use, copy, modify, and/or distribute')) throw new Error('Missing libmypaint ISC notice');
const dieterleNotice = (await read('draw/vendor-notices/dieterle-brushes-CC0.txt')).trim();
if (!dieterleNotice.includes('Brien Dieterle') || !dieterleNotice.includes('CC0')) throw new Error('Missing Dieterle brush pack notice');
// Vendor entries are unbracketed: nothing reads a marker back.
ui = ui.replace('<div class="licenses-list">', () => '<div class="licenses-list">\n' +
  // The document profile ships no JPEG XL encoder, so no notice for it.
    '<details class="license-entry"><summary><span class="license-name">Pretext 0.0.9</span><span class="license-id">MIT</span></summary><pre class="license-text" data-license="pretext"></pre></details>\n' +
  '<details class="license-entry"><summary><span class="license-name">perfect-freehand</span><span class="license-id">MIT</span></summary><pre class="license-text">' + escapeHtml(freehandNotice) + '</pre></details>\n' +
  '<details class="license-entry"><summary><span class="license-name">rough.js generator</span><span class="license-id">MIT</span></summary><pre class="license-text">' + escapeHtml(roughNotice) + '</pre></details>\n' +
  // Nor Paint's engine and presets.
  (PROFILE === 'full' ? '<details class="license-entry"><summary><span class="license-name">libmypaint brush engine (port)</span><span class="license-id">ISC</span></summary><pre class="license-text">' + escapeHtml(mypaintNotice) + '</pre></details>\n' : '') +
  (PROFILE === 'full' ? '<details class="license-entry"><summary><span class="license-name">Dieterle brush pack</span><span class="license-id">CC0 1.0</span></summary><pre class="license-text">' + escapeHtml(dieterleNotice) + '</pre></details>\n' : ''));
{
  // Every SHEET_NOTICES entry is in the sheet in full, compared as text.
  const words = text => text.replace(/\s+/g, ' ');
  const sheet = words(ui.replace(/<[^>]*>/g, ' ').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&'));
  if (sheetNotices.size !== SHEET_NOTICES.size) throw new Error('A notice the sheet carries was not met in the bundle: ' + [...SHEET_NOTICES.keys()].filter(path => !sheetNotices.has(path)).join(', '));
  for (const [path, notice] of sheetNotices) if (!sheet.includes(words(notice.slice(notice.indexOf(SHEET_NOTICES.get(path)))).trim()))
    throw new Error('The Licences sheet does not carry the notice of ' + path + ', which the shared runtime no longer repeats');
}
if (/<script\b/i.test(ui)) throw new Error('Editor interface markup must not contain scripts');
// The ChatGPT copy's interface is this markup without the commercial sheet; the page's own loses only the sheet's markers.
const appsUi = PROFILE === 'full' ? dropIndentation(stripMarkupComments(ui.replace(commercialMarkup, ''))) : null;
if (appsUi !== null && /commercial-overlay|RAPIER_COMMERCIAL|buy\.stripe\.com/.test(appsUi)) throw new Error('The ChatGPT copy\'s interface must carry no commercial sheet and no link that starts a purchase');
ui = dropIndentation(stripMarkupComments(ui.replace(/<!-- RAPIER_COMMERCIAL_(?:BEGIN|END) -->\n?/g, '')));
// The document profile carries no Draw/Paint styles (docs/build.md, "Build profiles").
const styleRows = JSON.parse(await read('editor/styles.json')).filter(row => PROFILE === 'full' || (row.id !== 'rapier-draw-style' && row.id !== 'rapier-notes-style' && row.id !== 'rapier-todo-style'));
const styles = await Promise.all(styleRows.map(async row => ({...row, css: packStyleWhitespace(await inlineFonts(stripStyleComments(await read(row.path)), row.path))})));
if (new Set(styles.map(row => row.id)).size !== styles.length || styles.some(row => !/^rapier-[a-z-]+-style$/.test(row.id)))
  throw new Error('Editor style rows are invalid');
// The loader makes each <style> from the record after the boot style. An older template's slots go with their
// RAPIER_STYLE_SLOTS markers.
const styleSlots = /(?:<!-- RAPIER_STYLE_SLOTS_BEGIN -->\s*)?(<style id="rapier-boot-style">[\s\S]*?<\/style>)(?:[\s\S]*?<!-- RAPIER_STYLE_SLOTS_END -->)?/;
if (!styleSlots.test(html) || !html.includes('<template id="rapier-ui-slot"></template>')) throw new Error('Editor interface slots are missing');
html = html.replace(styleSlots, (_, critical) => critical);
html = html.replace(/<!-- RAPIER_JXL_BEGIN -->[\s\S]*?<!-- RAPIER_JXL_END -->\s*/g, '');
// `html` is the PREVIOUS artifact: it may still carry a packed worker copy.
html = html.replace(/<!-- RAPIER_BACKUP_WORKER_BEGIN -->[\s\S]*?<!-- RAPIER_BACKUP_WORKER_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_SHARED_AGENT_BEGIN -->[\s\S]*?<!-- RAPIER_SHARED_AGENT_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_APPS_BRIDGE_BEGIN -->[\s\S]*?<!-- RAPIER_APPS_BRIDGE_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_RUNTIME_BEGIN -->[\s\S]*?<!-- RAPIER_RUNTIME_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_PLATFORM_BEGIN -->[\s\S]*?<!-- RAPIER_PLATFORM_END -->\n?/g, '<!-- RAPIER_PLATFORM_BEGIN -->\n<!-- RAPIER_PLATFORM_END -->\n');
html = html.replace(/<meta name="rapier-version" content="[^"]+">/, `<meta name="rapier-version" content="${VERSION}">`);
// The page's search words (docs/build.md, "The page's search words"). The template carries two RAPIER_SEO regions: the head's (the site's
// description, previews, canonical address and structured data) and the body's (the plain guide a crawler reads, written below from the
// welcome document). Only the full page, the site's own, keeps them. The document profile, the ChatGPT copy and every page that carries
// someone's document (skills/rapier-html/page.mjs) drop both: none of them is rapier.website.
const seoRegion = /<!-- RAPIER_SEO_BEGIN -->[\s\S]*?<!-- RAPIER_SEO_END -->\n?/g;
const seoRegions = [...html.matchAll(seoRegion)], bodyAt = html.indexOf('<body');
if (seoRegions.length !== 2 || bodyAt < 0 || seoRegions[0].index > bodyAt || seoRegions[1].index < bodyAt || !/<script type="application\/ld\+json">/.test(seoRegions[0][0]) ||
    html.split('<!-- RAPIER_SEO_').length !== 5) throw new Error('The shell must carry its two RAPIER_SEO regions: metadata in the head, the guide in the body');
if (PROFILE === 'document') html = html.replace(seoRegion, '');
else {
  // One version: the structured data says version.mjs's number, as the rapier-version meta does.
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
    const data = JSON.parse(json);
    if (data['@type'] !== 'SoftwareApplication') throw new Error('The structured data must describe the SoftwareApplication');
    return open + JSON.stringify({...data, softwareVersion: VERSION}) + close;
  });
  const [guide] = [...html.matchAll(seoRegion)].slice(1);
  html = html.slice(0, guide.index) + '<!-- RAPIER_SEO_BEGIN -->\n' + seoSection(await read('editor/engine.js')) + '\n<!-- RAPIER_SEO_END -->\n' + html.slice(guide.index + guide[0].length);
}
// One page policy (security/csp.mjs): shell <meta> is csp('web'); Android and Windows send csp('native'). Absent native trees are `unchecked`.
{
  const shellPolicy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (!shellPolicy || shellPolicy[1] !== csp('web')) throw new Error('rapier.html <meta> Content-Security-Policy differs from security/csp.mjs csp("web")');
  if (absentFromTree('android').length) unchecked.push('android MainActivity.kt PAGE_CSP against csp("native"): android/ not in this tree');
  else {
    const androidSource = await read('android/app/src/main/java/app/rapier/MainActivity.kt');
    const androidPolicy = /private const val PAGE_CSP = "([^"]*)"/.exec(androidSource);
    if (!androidPolicy || androidPolicy[1] !== csp('native')) throw new Error('android MainActivity.kt PAGE_CSP differs from security/csp.mjs csp("native")');
  }
  if (absentFromTree('windows').length) unchecked.push('windows/rapier.cpp Content-Security-Policy against csp("native"): windows/ not in this tree');
  else {
    const windowsSource = await read('windows/rapier.cpp');
    const windowsPolicy = /L"Content-Security-Policy: ([^"]*)"/.exec(windowsSource);
    if (!windowsPolicy || windowsPolicy[1] !== csp('native')) throw new Error('windows/rapier.cpp Content-Security-Policy differs from security/csp.mjs csp("native")');
  }
  const hostedSource = await read('_headers');
  const hostedPolicy = /^  Content-Security-Policy: (.*)$/m.exec(hostedSource);
  if (!hostedPolicy || hostedPolicy[1] !== csp('hosted')) throw new Error('_headers Content-Security-Policy differs from security/csp.mjs csp("hosted")');
}
// The template is the previous page: an inline script this build does not author is residue and is refused.
{
  const owned = [...html.matchAll(/<script data-rapier-owned>([\s\S]{0,60})/g)].map(match => match[1].replace(/\s+/g, ' ').trim());
  if (owned.length) throw new Error('The template carries ' + owned.length + ' inline script(s) this build does not author; residue is refused, never carried: ' + owned.join(' | '));
}
html = html.replace(/(<script[^>]*type="application\/speedracer-app\+json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open, source, close) => {
  const manifest = JSON.parse(source);
  const exportOperation = manifest.operations.find(row => row.name === 'document.export');
  manifest.factory.version = VERSION;
  manifest.operations = TOOLS.map(entry => ({name: entry.name, label: entry.title, description: entry.description, authority: ['read', 'view'].includes(entry.effect) ? 'read' : 'write', input: entry.inputSchema, result: entry.outputSchema}));
  if (exportOperation) manifest.operations.push(exportOperation);
  return open + JSON.stringify(manifest) + close;
});

let source = await read('editor/engine.js');
// engine.js's RAPIER_JXL_ENCODER literal is
// the one runtime read of "has an encoder"; it must appear exactly once.
{
  const marker = 'const RAPIER_JXL_ENCODER = true;';
  if (source.split(marker).length - 1 !== 1) throw new Error('editor/engine.js must contain exactly one `' + marker + '` marker (docs/build.md, "Build profiles")');
  if (PROFILE === 'document') source = source.replace(marker, 'const RAPIER_JXL_ENCODER = false;');
}
const structureSource = await read('agent/structure.mjs');
const structureNode = parse(structureSource, 'module').body.find(node => node.type === 'FunctionDeclaration' && node.id.name === '_rapierStructureAnalyze');
if (!structureNode) throw new Error('Structure source is missing');
function insertSource(marker, contents) {
  const at = source.indexOf(marker);
  if (at < 0 || source.indexOf(marker, at + marker.length) >= 0) throw new Error('Editor source slot must occur once: ' + marker);
  source = source.slice(0, at) + contents + source.slice(at + marker.length);
}
insertSource('/* RAPIER_STRUCTURE_MODULE */', structureSource.slice(structureNode.start, structureNode.end));
insertSource('/* RAPIER_SHARE_MODULE */', await read('editor/share.js'));
// editor/source-store.js sets
// globalThis.RapierSourceStore, so it is spliced at its marker ahead of
// rapier.document.source's construction, not appended like other extensions.
insertSource('/* RAPIER_SOURCE_STORE_MODULE */', await read('editor/source-store.js'));
// editor/lexer.js sets globalThis.RapierLexer, spliced at its slot.
insertSource('/* RAPIER_LEXER_MODULE */', await read('editor/lexer.js'));
// Engine satellites project their original declarations into the same lexical slots. ESM
// exports belong to Node; the editor gets no facade, alias, wrapper or second implementation.
const {checkEngineOwnership} = await import('./check-engine-ownership.mjs');
checkEngineOwnership();
const {lexicalBindings} = await import('./engine-census.mjs');
const engineImports = new Map(lexicalBindings(acorn.parse(source, {ecmaVersion: 'latest', locations: true})).bindings.filter(binding => binding.scope.top &&
  binding.init?.type === 'MemberExpression' && binding.init.object.name === 'globalThis' && !binding.init.computed &&
  globals[binding.init.property.name] && binding.path.length === 1).map(binding =>
    [binding.name, globals[binding.init.property.name] + ':' + binding.path[0]]));
const satelliteSlots = [
  ['COLOUR_MATH', 'editor/colour-math.mjs'],
  ['CODE_TOKENS', 'editor/code-tokens.mjs'],
  ['PLAIN_PASTE', 'editor/plain-paste.mjs'],
  ['BODY_SEGMENT_SPANS', 'editor/segment-matches.mjs', ['_rapierBodySegmentSpans']],
  ['SEGMENT_MATCHES', 'editor/segment-matches.mjs', ['_rapierStableBlockIdentityKey', '_rapierProvenSegmentMatches', '_rapierSplicedSegmentMatches']],
  ['INLINE_SOURCE', 'editor/inline-source.mjs'],
  ['JOURNAL_LIMITS', 'editor/journal-records.mjs', ["_RAPIER_TRANSACTION_ACTOR_LIMIT","_RAPIER_TRANSACTION_OPERATION_LIMIT","_RAPIER_TRANSACTION_REQUEST_LIMIT"]],
  ['JOURNAL_SPLICES', 'editor/journal-records.mjs', ["_rapierTransformSplices","_rapierRecordSplices"]],
  ['JOURNAL_RECORDS', 'editor/journal-records.mjs', ["_rapierValidLedgerRecord","_rapierJournalRecord"]],
  ['UNDO_CHAIN', 'editor/undo-chain.mjs'],
  ['RECOVERY_POLICY', 'editor/recovery-policy.mjs'],
  ['ENTER_INTENT', 'editor/enter-intent.mjs'],
  ['TYPED_BLOCKS', 'editor/typed-blocks.mjs'],
  ['RENDERED_EDITS', 'editor/rendered-edits.mjs'],
  ['EXCERPT_SOURCE', 'editor/excerpt-source.mjs'],
  ['VISIBLE_SOURCE', 'editor/visible-source.mjs'],
  ['SOURCE_FACT_INDEX', 'editor/source-facts.mjs', ['_rapierBuildSemanticFactIndex']],
  ['DOCUMENT_CHECKS', 'editor/document-checks.mjs'],
  ['SOURCE_FACTS', 'editor/source-facts.mjs', ["_rapierLineStartOffsets","_rapierSourceLineSpan","_rapierHeadingSlugBase"]],
  ['SOURCE_TOKEN_FACTS', 'editor/source-facts.mjs', ["_rapierCollectTokenFacts"]],
  ['SOURCE_FINALIZE_BLOCKS', 'editor/source-facts.mjs', ["_rapierFinalizeParsedBlocks"]],
];
const satelliteModules = new Map(), projectedOwners = new Map(), satelliteProjections = [];
const satelliteNames = node => node.type === 'FunctionDeclaration' ? [node.id.name]
  : node.type === 'VariableDeclaration' ? node.declarations.map(row => row.id.name) : [];
for (const [slot, path, selected] of satelliteSlots) {
  if (!satelliteModules.has(path)) {
    const text = await read(path), tree = parse(text, 'module');
    if (tree.body.some(node => !['FunctionDeclaration', 'VariableDeclaration', 'ImportDeclaration', 'ExportNamedDeclaration'].includes(node.type)) ||
        tree.body.some(node => node.type === 'ExportNamedDeclaration' && (node.declaration || node.source)))
      throw new Error('Engine satellite must expose original declarations: ' + path);
    const exports = new Map(tree.body.filter(node => node.type === 'ExportNamedDeclaration')
      .flatMap(node => node.specifiers.map(row => [row.exported.name, row.local.name])));
    satelliteModules.set(path, {text, tree, exports});
  }
  const {text, tree} = satelliteModules.get(path);
  const declarations = tree.body.filter(node => satelliteNames(node).length &&
    (!selected || satelliteNames(node).some(name => selected.includes(name))));
  const names = declarations.flatMap(satelliteNames);
  if (!names.length || names.some(name => !name) || selected &&
      (names.length !== selected.length || names.some(name => !selected.includes(name))))
    throw new Error('Engine satellite slot is incomplete: ' + slot);
  const span = tree.body.filter(node => node.start >= declarations[0].start && node.end <= declarations.at(-1).end);
  if (span.length !== declarations.length) throw new Error('Engine satellite slot is not contiguous: ' + slot);
  for (const name of names) {
    if (projectedOwners.has(name)) throw new Error('Engine satellite declaration is projected twice: ' + name);
    projectedOwners.set(name, path);
  }
  // A satellite the shared runtime already carries is read from the published module, never projected twice.
  const shared = MODULES.has(path) ? Object.keys(globals).find(name => globals[name] === path) : null;
  if (MODULES.has(path) && (!shared || names.some(name => !EXPORTS.get(path).has(name))))
    throw new Error('A satellite the shared runtime carries is read from its published exports: ' + path);
  satelliteProjections.push({slot, text: shared ? `const {${names.join(', ')}} = globalThis.${shared};`
    : text.slice(declarations[0].start, declarations.at(-1).end)});
}
for (const [path, {tree}] of satelliteModules) {
  for (const name of tree.body.flatMap(satelliteNames)) {
    if (projectedOwners.get(name) !== path) throw new Error('Engine satellite declaration is not projected: ' + name);
  }
  // Standard imports retain the existing engine binding. Satellite imports must name the
  // same declaration projected exactly once from their producer; no new alias or global.
  for (const node of tree.body.filter(node => node.type === 'ImportDeclaration')) {
    const dependency = relative(root, resolve(root, dirname(path), node.source.value)).split('\\').join('/');
    if (!node.specifiers.length || node.specifiers.some(row => row.type !== 'ImportSpecifier' || !(
        EXPORTS.get(dependency)?.has(row.imported.name) && engineImports.get(row.local.name) === dependency + ':' + row.imported.name ||
        row.local.name === row.imported.name && satelliteModules.get(dependency)?.exports.get(row.imported.name) === row.local.name &&
          projectedOwners.get(row.local.name) === dependency)))
      throw new Error('Engine satellite import lacks its exact shared binding: ' + path);
  }
}
for (const {slot, text} of satelliteProjections) insertSource('/* RAPIER_' + slot + '_MODULE */', text);
const editorScriptsAll = JSON.parse(await read('editor/scripts.json'));
if (!Array.isArray(editorScriptsAll) || new Set(editorScriptsAll).size !== editorScriptsAll.length || editorScriptsAll.some(path =>
  typeof path !== 'string' || !/^(?:agent|draw|editor|images|interchange|layout|notes)\/[a-z-]+\.js$/.test(path)))
  throw new Error('Editor script sources are invalid');
// The document profile drops Draw, Paint and Notes scripts whole; editor/info.js drops only its marked Notes part (below).
const DOCUMENT_PROFILE_DROPPED_SCRIPTS = new Set(['editor/personal.js', 'draw/draw.js', 'draw/paint-tool.js', 'notes/notes.js', 'notes/todo.js', 'notes/library.js', 'notes/ocr.js', 'notes/recorder.js', 'notes/sync-ui.js',  'notes/attachments.js']);
const editorScripts = PROFILE === 'full' ? editorScriptsAll : editorScriptsAll.filter(path => !DOCUMENT_PROFILE_DROPPED_SCRIPTS.has(path));
// editor/info.js's Notes entries (#339) are marked and dropped
// as ui.html's RAPIER_NOTES markup is.
const notesInfoMarkup = /\/\* RAPIER_NOTES_BEGIN \*\/([\s\S]*?)\/\* RAPIER_NOTES_END \*\//g;
const extensions = (await Promise.all(editorScripts.map(async path => {
  let text = await read(path);
  if (path === 'editor/info.js') {
    const regions = [...text.matchAll(notesInfoMarkup)];
    if (!regions.length || regions.some(([, inner]) => inner.includes('RAPIER_NOTES_')) ||
      text.split('RAPIER_NOTES_').length - 1 !== 2 * regions.length) throw new Error('editor/info.js Notes markers are unbalanced');
    text = PROFILE === 'full' ? text.replace(/\/\* RAPIER_NOTES_(?:BEGIN|END) \*\//g, '') : text.replace(notesInfoMarkup, '');
  }
  return '/* ' + path + ' */\n' + text;
}))).join('\n');
walk(parse(extensions), node => {
  if (node.type !== 'VariableDeclarator' || node.id.type !== 'ObjectPattern' || node.init?.type !== 'MemberExpression' ||
      node.init.object.name !== 'globalThis' || node.init.computed || !globals[node.init.property.name]) return;
  const path = globals[node.init.property.name];
  for (const row of node.id.properties) if (row.type === 'Property' && !row.computed && !EXPORTS.get(path)?.has(row.key.name || row.key.value))
    throw new Error('Missing browser export in ' + path + ': ' + (row.key.name || row.key.value));
});
insertSource('\nreturn shellPort;\n', '\n' + extensions + '\nreturn shellPort;\n');
source = await lean(source, 'rapier-editor.js');

const safeScript = value => value.replace(/<\/script/gi, '<\\/script');
// A declaration, not a const: deriveVendorGroup above the search-cache key reads it before this line runs.
function checksum(value) { return createHash('sha256').update(value).digest('hex'); }
// A group's spans share one gzip stream; spans tile the group exactly. Markers carry name, offset, bytes;
// SHA-256 lives in dist/BUILD.json `spans`, not the page.
const packedRecord = [];
async function packedSpans(id, type, spans) {
  let out = `<script type="${type}" id="${id}">\n`;
  const buffers = spans.map(({source}) => Buffer.from(source));
  const combined = Buffer.concat(buffers);
  // base124 text has no `<`, so it can never open a tag or end this element (tools/base124.mjs).
  let stored = encodeBase124(await zopfliGzip(combined)), prefilter = '';
  const words = encodeTextPack(combined);
  if (words) {
    if (!Buffer.from(decodeTextPack(words, combined.length)).equals(combined)) throw new Error('Word packing changed ' + id);
    const candidate = encodeBase124(await zopfliGzip(words));
    const marker = ' prefilter=words2';
    if (candidate.length + marker.length < stored.length) { stored = candidate; prefilter = marker; }
  }
  out += `/* RAPIER_VENDOR_GROUP bytes=${combined.length} stored=gzip+base124${prefilter} */\n` + stored + `\n/* RAPIER_VENDOR_GROUP_END */\n`;
  let offset = 0;
  for (let i = 0; i < spans.length; i++) {
    const bytes = buffers[i];
    out += `/* RAPIER_VENDOR_SPAN ${spans[i].name} offset=${offset} bytes=${bytes.length} */\n`;
    packedRecord.push({element: id, name: spans[i].name, bytes: bytes.length, sha256: checksum(bytes)});
    offset += bytes.length;
  }
  return out + '</script>\n';
}
// A single payload is a one-span group (same store, same loader path as packedSpans -- one owner,
// not two marker formats for the same runtime to understand).
function packedScript(id, type, name, source) {
  return packedSpans(id, type, [{name, source}]);
}
// The vendor groups (VENDOR_GROUPS and deriveVendorGroup, above the search-cache key): each packed
// into the one element the shell keeps a slot for by id, from the spans derived once for this build.
for (const id of Object.keys(VENDOR_GROUPS)) {
  const spans = await deriveVendorGroup(id);
  const element = new RegExp(String.raw`<script (?:id="${id}" type="text/rapier-vendor"|type="text/rapier-vendor" id="${id}")>\n[\s\S]*?</script>\n`);
  if (!element.test(html)) throw new Error('The shell has no vendor slot ' + id);
  const packed = await packedSpans(id, 'text/rapier-vendor', spans);
  html = html.replace(element, () => packed);
}
const jxlWorker = await lean(await buildJPEGXLWorker(root, {profile: PROFILE}), 'rapier-jxl-worker.js');
const codecScript = '<!-- RAPIER_JXL_BEGIN -->\n' +
  await packedScript('rapier-jxl-worker', 'application/rapier-jxl-worker', 'rapier-jxl-worker.js', jxlWorker) +
  '<!-- RAPIER_JXL_END -->\n';
// The platform stage (shell/platform.js, bundle-io.js, plugin-loader.js): one element packed into the
// shell's RAPIER_PLATFORM slot; the runtime
// loader runs it first. No plain script after the slot may read a
// platform global at parse time (gated below).
{
  const spans = [];
  for (const [name, path] of [['rapier-platform.js', 'shell/platform.js'], ['rapier-bundle-io.js', 'shell/bundle-io.js'], ['rapier-plugin-loader.js', 'shell/plugin-loader.js']]) {
    const source = await lean(await read(path), name);
    spans.push({name, source});
  }
  const slot = /<!-- RAPIER_PLATFORM_BEGIN -->\n<!-- RAPIER_PLATFORM_END -->\n/;
  if (!slot.test(html)) throw new Error('The shell carries no RAPIER_PLATFORM slot');
  const after = html.slice(html.search(slot));
  for (const [, attrs, source] of after.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if ((!type || ['text/javascript', 'application/javascript'].includes(type)) && /\b(?:Rapier(?:TextCodec|Storage|Preferences|Platform|BundleIO)|_rapierProviders)\b/.test(source)) throw new Error('A plain script after the platform slot reads a platform-stage global at parse time');
  }
  const platformScript = '<!-- RAPIER_PLATFORM_BEGIN -->\n' + await packedSpans('rapier-platform-runtime', 'application/rapier-runtime', spans) + '<!-- RAPIER_PLATFORM_END -->\n';
  // (A function replacement: the text carries `$`.)
  html = html.replace(slot, () => platformScript);
}
// agent/apps.js is packed only into the Apps copy and runs only under its host flag.
let appsScript = null;
if (PROFILE === 'full') {
  const apps = await lean(await read('agent/apps.js'), 'rapier-apps.js');
  new vm.Script(apps, {filename: 'rapier-apps.js'});
  appsScript = await packedScript('rapier-apps-runtime', 'application/rapier-runtime', 'rapier-apps.js', apps);
}
// The shell decodes base124 and never encodes it: the encoder stays in the build.
const dropFunction = (text, name) => {
  const start = text.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('tools/base124.mjs has no ' + name);
  const docStart = text.lastIndexOf('/**', start), head = docStart >= 0 && !text.slice(docStart, start).includes('\n\n') ? docStart : start;
  const end = text.indexOf('\n}\n', start);
  if (end < 0) throw new Error('tools/base124.mjs: ' + name + ' does not end');
  return text.slice(0, head) + text.slice(end + 3);
};
const base124Source = dropFunction((await read('tools/base124.mjs')).replace(/^export /gm, ''), 'encodeBase124');
if (/encodeBase124/.test(base124Source)) throw new Error('The base124 encoder is still in the shell');
const runtimeLoader = await lean('const _rapierBase124 = (() => {\n' + base124Source +
  '\nreturn Object.freeze({decodeBase124});\n})();\n' +
  (await read('tools/text-pack.mjs')).replace(/^export /gm, '') + '\n' + await read('tools/runtime-loader.js'), 'rapier-loader.js');
new vm.Script(runtimeLoader, {filename: 'rapier-runtime-loader.js'});
const runtimeScript = '<!-- RAPIER_RUNTIME_BEGIN -->\n' +
  await packedScript('rapier-styles-runtime', 'application/rapier-runtime', 'rapier-styles.json', JSON.stringify(styles.map(({id, css}) => ({id, css})))) +
  await packedScript('rapier-ui-runtime', 'application/rapier-runtime', 'rapier-ui.html', ui) +
  await packedSpans('rapier-editor-runtime', 'application/rapier-runtime', [{name: 'rapier-shared.js', source: bundleText}, {name: 'rapier-editor.js', source}]) +
  '<script data-rapier-owned>\n' + safeScript(runtimeLoader) + '\n</script>\n<!-- RAPIER_RUNTIME_END -->\n';
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) throw new Error('Editor body is missing');
html = html.slice(0, bodyEnd) + codecScript + runtimeScript + html.slice(bodyEnd);
html = stripMarkupComments(html);
html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_, open, css, close) => open + stripStyleComments(css) + close);
{
  const inline = /(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/g;
  const leaned = await Promise.all([...html.matchAll(inline)].map(async ([whole, open, attrs, source, close]) => {
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !['text/javascript', 'application/javascript'].includes(type)) return whole;
    return open + safeScript(await lean(source, 'rapier-inline.js')) + close;
  }));
  let at = 0;
  html = html.replace(inline, () => leaned[at++]);
}
// The size law (docs/intent.md, amended 14 September 2026): never refuses on size; measures and reports every byte.
const BUDGET = SIZE_BUDGETS[PROFILE];
{
  const bytes = Buffer.byteLength(html);
  if (FAST_PACK) console.warn('RAPIER_PACK=fast: zlib packing for iteration only; ' + bytes + ' bytes is not a release measurement');
  if (bytes >= BUDGET.warn) console.warn(`[build] ${OUTPUT_FILE} is ` + bytes + ' bytes: ' + (bytes - BUDGET.warn) + ` over the ${PROFILE} profile's ` + BUDGET.warn + '-byte release budget (reported, not refused -- docs/size-ledger.md owes the trim)');
}
await writeFile(resolve(root, OUTPUT_FILE), html);

// The PWA and the Apps bridge are the full profile's only.
let shellDigest = null, appHtml = null, appHtmlBytes = null, appHtmlSha256 = null, appsSpans = null;
if (PROFILE === 'full') {
  const shellRows = [];
  for (const path of ['rapier.html', 'manifest.json', 'icon-192.png', 'icon-512.png']) {
    const body = await readFile(resolve(root, path));
    shellRows.push(`./${path}\t${body.length}\t${checksum(body)}`);
  }
  shellDigest = checksum(shellRows.join('\n'));
  const worker = (await read('sw.js')).replace(/const SHELL_RELEASE_SHA256 = '[0-9a-f]{64}';/, `const SHELL_RELEASE_SHA256 = '${shellDigest}';`);
  new vm.Script(worker, {filename: 'sw.js'});
  await writeFile(resolve(root, 'sw.js'), worker);

  // The Apps copy has no meta CSP: the host builds it from _meta.ui.csp (mcp/worker.mjs resource()).
  const editorElement = /<script type="application\/rapier-runtime" id="rapier-editor-runtime">[^<]*<\/script>\n/;
  if (html.split('id="rapier-editor-runtime"').length !== 2 || !editorElement.test(html)) throw new Error('The Apps copy needs the one editor runtime element to place its bridge after');
  // The Apps bridge owns the bounded frame size through MCP Apps notifications. Browser-level
  // automatic iframe expansion would compete with that viewport and expose the full document.
  // Its interface is packed again without the commercial sheet (docs/briefs/commercial.md: no link that starts a purchase rides
  // in the ChatGPT copy); that one span's record stands in the Apps receipt for the page's own interface row.
  const interfaceElement = /<script type="application\/rapier-runtime" id="rapier-ui-runtime">[^<]*<\/script>\n/;
  if (html.split('id="rapier-ui-runtime"').length !== 2 || !interfaceElement.test(html)) throw new Error('The Apps copy needs the one interface element to pack without the commercial sheet');
  const recorded = packedRecord.length;
  const appsInterface = await packedScript('rapier-ui-runtime', 'application/rapier-runtime', 'rapier-ui.html', appsUi);
  const [appsInterfaceRow] = packedRecord.splice(recorded);
  appsSpans = packedRecord.map(row => row.element === 'rapier-ui-runtime' ? appsInterfaceRow : row);
  // Nor does it claim rapier.website as its address or its description: the search words are the site's page alone.
  appHtml = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '').replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<script>globalThis.RAPIER_APPS_HOST = true;</script>')
    .replace(seoRegion, '').replace(interfaceElement, () => appsInterface).replace(editorElement, element => element + appsScript);
  const destination = resolve(root, 'dist/chatgpt');
  await mkdir(destination, {recursive: true});
  await writeFile(resolve(destination, 'rapier-app.html'), appHtml);
  // The separate MCP deployment carries the same policy owner, even while the main site is frozen.
  const privacy = /<div class="licenses-app privacy-words">([\s\S]*?)<\/div>/.exec(await read('editor/ui.html'))?.[1];
  if (!privacy) throw new Error('The Apps package needs the editor privacy sheet');
  await writeFile(resolve(destination, 'privacy.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapier privacy and terms</title><main><h1>Rapier privacy and terms</h1>' + privacy + '</main></html>');
  const licensingFonts = await inlineFonts(await read('shell/fonts/fonts.css'), 'shell/fonts/fonts.css');
  const pageFonts = page => page.replace('/* RAPIER_FONTS */', licensingFonts);
  await writeFile(resolve(destination, 'licensing.html'), pageFonts(await read('licensing.html')));
  await cp(resolve(root, 'icon-192.png'), resolve(destination, 'icon-192.png'));
  await cp(resolve(root, 'icon-512.png'), resolve(destination, 'icon-512.png'));
  appHtmlBytes = Buffer.byteLength(appHtml); appHtmlSha256 = checksum(appHtml);
}

// dist/BUILD.json names this profile and keeps a `profiles` map; release-gate.mjs refuses anything but full.
let priorReceipt = null;
try { priorReceipt = JSON.parse(await readFile(resolve(root, 'dist/BUILD.json'), 'utf8')); } catch (_) { priorReceipt = null; }
// A retained record without its own provenance is dropped (Greenfield: no older shape).
const PROVENANCE = ['builtAt', 'node', 'mode', 'packing'];
const priorProfiles = Object.fromEntries(Object.entries(priorReceipt?.profiles && typeof priorReceipt.profiles === 'object' ? priorReceipt.profiles : {})
  .filter(([, record]) => record && typeof record === 'object' && PROVENANCE.every(field => typeof record[field] === 'string')));
const BUILT_AT = new Date().toISOString(), PACK_MODE = FAST_PACK ? 'development' : 'release', PACKING = FAST_PACK ? 'fast (zlib; not a release)' : 'zopfli';
// `spans`: provenance of every packed span; the Apps copy adds its bridge.
const pageSpans = packedRecord.filter(row => row.element !== 'rapier-apps-runtime');
const profileRecord = {path: OUTPUT_FILE, bytes: Buffer.byteLength(html), sha256: checksum(html), budget: BUDGET, spans: pageSpans, shakenExports,
  builtAt: BUILT_AT, node: process.version, mode: PACK_MODE, packing: PACKING, canonical: toolchainCanonical};
// `mode`: 'development' for any fast/zlib pack
// (`RAPIER_PACK=fast`), 'release' for Zopfli; tools/release-gate.mjs checks it.
const receipt = {release: VERSION, builtAt: BUILT_AT, node: process.version, mode: PACK_MODE, packing: PACKING, validation: 'JavaScript syntax and source assembly only; no runtime or host verification', profile: PROFILE, profiles: {...priorProfiles, [PROFILE]: profileRecord}, editor: {path: OUTPUT_FILE, bytes: Buffer.byteLength(html), sha256: checksum(html)}, apps: PROFILE === 'full' ? {path: 'dist/chatgpt/rapier-app.html', bytes: appHtmlBytes, sha256: appHtmlSha256, spans: appsSpans} : priorReceipt?.apps ?? null, shell: PROFILE === 'full' ? {sha256: shellDigest} : priorReceipt?.shell ?? null, htmlSinks: {named: htmlSinks.total, files: htmlSinks.files, inventory: 'security/html-sinks.json'}, tools: TOOLS.map(row => row.name), toolchain: {canonical: toolchainCanonical, node: {expected: toolchain.node.version, actual: process.version}}, unchecked};
// `dist/` may not exist in a fresh copy.
await mkdir(resolve(root, 'dist'), {recursive: true});
await writeFile(resolve(root, 'dist/runtime-symbols-' + PROFILE + '.json'), JSON.stringify(lean.symbols) + '\n');
await writeFile(resolve(root, 'dist/BUILD.json'), JSON.stringify(receipt, null, 2) + '\n');
await writeFile(resolve(root, 'AGENT-TOOLS.json'), JSON.stringify({release: VERSION, core: TOOLS, mcp: manifestMcp}, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
