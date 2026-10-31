import {buildObservationActive, runObservedBuild, buildPhase, buildReceiptTimestamp, readBuildShell, readBuildInput, buildMissingPaths, captureBuildGateOutputs, reuseBuildAssembly, finishBuildReuse} from './build-reuse.mjs';
import {readFile, writeFile, mkdir, cp, readdir, rm} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {searchCacheVersion} from './search-cache-version.mjs';
import {stripperFor} from './strip-comments.mjs';
import {BROTLI_SETTINGS, FAST_PACK} from './zopfli.mjs';
import vm from 'node:vm';
import {scriptMinifier, reflectedNames} from './minify.mjs';
import acorn from '../agent/vendor/acorn.mjs';
import {TOOLS, UI_RESOURCE, mcpDescriptors, publishedSchema} from '../agent/catalog.mjs';
import {pairedShell, PAIRED_SHELL_FILE, PAIRED_SHELL_HEADERS, PAIRED_SHELL_REDIRECTS} from '../mcp/paired.mjs';
import {entitiesVendor, SHARED_MARKDOWN_MODULES, sharedMarkdownVendor} from './entities-vendor.mjs';
import {VERSION} from '../version.mjs';
import {syncVersion, VERSIONED_FILES} from './version-sync.mjs';
import {checkPurity} from './purity-gate.mjs';
import {assertModernFoundations} from './check-modern-foundations.mjs';
import {csp} from '../security/csp.mjs';
import {checkHtmlSinks} from './html-sinks.mjs';
import {checkToolchain} from './check-toolchain.mjs';
import {createGroupPacker} from './packed-group.mjs';
import {SIZE_BUDGETS, checkProfileSize} from './profile-budgets.mjs';
import {inlineFonts, keepsComment, stripStyleComments, styleText} from './style-text.mjs';
import {shakeModule, pruneImports, declaresOnly, dropBareImports} from './tree-shake.mjs';
import {commercialPage} from './commercial-page.mjs';
import {seoSection, seoDoorSections} from './seo-page.mjs';
import {DOORS, PAGES, SITE_PAGES, STANDALONE, doorAssetPath} from '../door-worker.js';
import {readGuides, writeDoorAssets} from './door-assets.mjs';
import {firstScreenKey as firstScreenKeyOf} from './first-screen-record.mjs';
import {fillMermaidResources} from './mermaid-resources.mjs';
import {fillFontSubsetResources} from './font-subset-resources.mjs';
import {builtinPlugins, builtinFilesReuse, fillBuiltinSlot} from './builtin-plugins.mjs';
import {pluginPackFiles, readPluginFile} from './stage-plugin-pack.mjs';
import {fillMathLicense} from './build-math.mjs';
import {buildExportAssets} from './build-export-assets.mjs';
import {satelliteSlots} from './engine-slots.mjs';
import {editorOnlyMarkup} from './reader-profile.mjs';
import {APP_DESCRIPTION, HOME_TITLE, HOME_DESCRIPTION, DISCOVERY_LINKS, PLAY_URL} from './discovery.mjs';
import {lexicalBindings, ENGINE_MODULE_SLOTS} from './engine-census.mjs';
import {bundleModules, readNames, moduleDependency, checkModuleSyntax, moduleExportField, moduleExportNames, moduleImportText} from './reader-modules.mjs';
import {PARTS, PART_IDS, PART_DIRECTORY, partition, partMark, partElement, inlineParts, splitProgram, realmNames, topLevelNames, WINDOW_SHORT_NAMES} from './parts.mjs';
import {prefixSymbols} from './runtime-symbols.mjs';

if (!buildObservationActive()) process.exit(runObservedBuild());
buildPhase('prepare');

const versionSync = await syncVersion({absent: 'skip', artifacts: false});
await buildExportAssets();

if (process.argv.includes('--ledger')) {
	await import('./size-ledger.mjs').then(m => m.main());
	process.exit();
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Build profiles: `full` is byte-identical with RAPIER_PROFILE unset; `reader` is the read-only viewer, built by
const PROFILE_PAGES = {full: 'rapier.html', reader: 'rapier-reader.html'};
const RAPIER_PROFILE_RAW = process.env.RAPIER_PROFILE;
if (RAPIER_PROFILE_RAW !== undefined && !Object.hasOwn(PROFILE_PAGES, RAPIER_PROFILE_RAW)) {
  throw new Error('RAPIER_PROFILE must be "full" or "reader"; got ' + JSON.stringify(RAPIER_PROFILE_RAW));
}
const PROFILE = RAPIER_PROFILE_RAW || 'full';
const OUTPUT_FILE = PROFILE_PAGES[PROFILE];
buildPhase('gates');
await assertModernFoundations(root);
const toolchain = JSON.parse(await readBuildInput({root, path: 'tools/toolchain.json'}));
const NODE_MAJOR_MIN = toolchain.nodeFloor.major;
if (Number(process.versions.node.split('.')[0]) < NODE_MAJOR_MIN) throw new Error('Rapier builds on Node ' + NODE_MAJOR_MIN + '+; this is ' + process.version);
const toolchainCanonical = process.version === toolchain.node.version;
const absentFromTree = (...paths) => buildMissingPaths({root, paths});
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
const htmlSinks = checkHtmlSinks();
if (htmlSinks.problems.length) throw new Error('HTML sink law: ' + htmlSinks.problems.join('; '));
const collisionScan = new Promise(answer => execFile(process.execPath, [fileURLToPath(new URL('probes/scan-assembled-collisions.mjs', import.meta.url)), '--json'],
  {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}, (error, stdout) => answer({error, stdout})));
async function collisionLaw() {
  const collisions = await collisionScan;
  let report = null;
  try { report = JSON.parse(collisions.stdout); } catch (_) {}
  if (!report) throw new Error('assembled-scope law: the collision scanner did not run (' + String(collisions.error?.message || collisions.error?.code) + '); a scanner that did not run is not a scanner that found nothing');
  if (report.offenders) throw new Error('assembled-scope law: ' + report.rows.map(r => r.name + ' declared in ' + r.sites.map(s => s.file + ':' + s.line).join(' and ') + ' (' + r.winner + ' wins by hoisting)').join('; '));
}
const read = path => readFile(resolve(root, path), 'utf8');
const MODULES = new Map();
const EXPORTS = new Map(), bundling = new Set(), DEPS = new Map();
const MODULE_SOURCES = new Map();
const INK_FACTORIES = {'spec/md-marks.mjs': 'inkReader', 'spec/ink.mjs': 'inkGeometry'};
const RETAINED_GROUPS = {
  layout: path => path.startsWith('agent/vendor/pretext/') || path.startsWith('agent/vendor/hyphen-en-us/') || ['layout/model.mjs', 'layout/preparation.mjs', 'layout/prepared-paragraph.mjs', 'layout/hyphenation.mjs', 'layout/paragraph-fit.mjs', 'layout/initial-range.mjs', 'layout/typography.mjs', 'layout/line-plan.mjs', 'spec/md-layout.mjs'].includes(path),
  ink: path => Object.hasOwn(INK_FACTORIES, path) || ['draw/freehand.mjs', 'draw/pen-path.mjs', 'layout/ink-draw.mjs'].includes(path),
};
const retainedGroup = path => Object.keys(RETAINED_GROUPS).find(group => RETAINED_GROUPS[group](path)) || null;
const retainedModule = path => retainedGroup(path) !== null;
const parse = (source, sourceType = 'script') => acorn.parse(source, {ecmaVersion: 'latest', sourceType});

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

const PURITY_ENTRY = 'agent/kernel.mjs';
const purityViolations = await checkPurity(resolve(root, PURITY_ENTRY), {baseDir: root});
if (purityViolations.length) throw new Error(`Decision purity gate: ${PURITY_ENTRY} must receive its clock, randomness, network and DOM facts from its caller, never read them itself, directly or through an import:\n` +
  purityViolations.map(row => '  ' + row).join('\n'));


const MARK_CONVENTION_LITERALS = ['<!--md-break:v1', '<!--ink ', '<!--/ink-->'];
const MARK_CONVENTION_OWNER = 'spec/md-marks.mjs';
const MARK_CONVENTION_ALLOWED = new Set([MARK_CONVENTION_OWNER, 'tools/build.mjs']);
const MARK_CONVENTION_SKIP_DIRS = new Set(['dist', '.git', '.wrangler', 'node_modules', 'tools/witnesses', 'skills']);
const MARK_CONVENTION_GRADLE_OUTPUT = (relPath, name) => /^android/.test(relPath) && (name === 'build' || name === '.gradle' ||
  /^android\/[a-z]+\/src\/main\/assets$/.test(relPath));
const MARK_CONVENTION_SKIP_FILES = new Set([...Object.values(PROFILE_PAGES), 'sw.js', 'AGENT-TOOLS.json']);
const MARK_CONVENTION_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.md']);

async function markConventionViolations(dir = '') {
  const findings = [];
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const relPath = dir ? dir + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (MARK_CONVENTION_SKIP_DIRS.has(relPath) || MARK_CONVENTION_SKIP_DIRS.has(entry.name) || MARK_CONVENTION_GRADLE_OUTPUT(relPath, entry.name)) continue;
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
    'mcpDescriptors) must produce both, fed the same deployment facts.');
}

if (PROFILE !== 'reader') {
  const {checkEngineOwnership} = await import('./check-engine-ownership.mjs');
  checkEngineOwnership();
  const {checkFocusRings} = await import('./check-focus-rings.mjs');
  checkFocusRings();
}
await collisionLaw();
await captureBuildGateOutputs({root, paths: [...VERSIONED_FILES, 'packages/rapier-embed/README.md', 'mcp/render-assets.mjs',
  ...(PROFILE === 'reader' ? [] : ['tools/engine-ownership.json'])]});
if (await reuseBuildAssembly({root, profile: PROFILE})) process.exit(0);
const packedRecord = [];
const {pack: packedSpans, prepack} = createGroupPacker(packedRecord);
if (PROFILE === 'full') builtinPlugins(root, prepack).catch(() => {});
if (PROFILE === 'reader') {
  await (await import('./reader-build.mjs')).buildReader({root, unchecked, toolchainCanonical});
  buildPhase('gates');
  await syncVersion({absent: 'skip'});
  await captureBuildGateOutputs({root, paths: [...VERSIONED_FILES, 'packages/rapier-embed/README.md', 'mcp/render-assets.mjs']});
  await finishBuildReuse({root, profile: PROFILE});
  process.exit(0);
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

const PHONE_BENCH_SCRIPTS = ['bench/document.js', 'bench/graphics.js', 'bench/runner.js'];
const lean = scriptMinifier(await Promise.all(['editor/engine.js', 'editor/share.js', 'editor/source-store.js', 'editor/lexer.js', ...JSON.parse(await read('editor/scripts.json')), ...PHONE_BENCH_SCRIPTS].map(read)), keepsComment);


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
]);
const sheetNotices = new Map();
function withoutSheetNotice(path, source) {
  const notice = /^\/\*!?([\s\S]*?)\*\/\n?/.exec(source);
  if (!notice || !notice[1].includes(SHEET_NOTICES.get(path))) throw new Error('Expected the licence notice at the head of ' + path);
  sheetNotices.set(path, notice[1]);
  return source.slice(notice[0].length);
}
function dropIndentation(markup) {
  const collapse = text => text.replace(/[ \t\f\r]*\n[ \t\n\f\r]*/g, '\n'), parts = [];
  let cursor = 0;
  for (const verbatim of markup.matchAll(/<(pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)) {
    parts.push(collapse(markup.slice(cursor, verbatim.index)), verbatim[0]);
    cursor = verbatim.index + verbatim[0].length;
  }
  return parts.join('') + collapse(markup.slice(cursor));
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
  const source = SHEET_NOTICES.has(path) ? withoutSheetNotice(path, text) : text;
  const tree = parse(source, 'module');
  for (const node of tree.body) checkModuleSyntax(node, path);
  if (path === 'agent/kernel.mjs') {
    const entries = [];
    walk(tree, node => { if (node.type === 'FunctionDeclaration' && node.id?.name === 'dispatchOperation') entries.push(node); });
    const switches = [];
    if (entries.length === 1) walk(entries[0].body, node => { if (node.type === 'SwitchStatement' && node.discriminant.name === 'name') switches.push(node); });
    const dispatch = switches.length === 1 ? switches[0] : null;
    const cases = dispatch?.cases.filter(row => row.test).map(row => row.test.value);
    const names = TOOLS.map(row => row.name);
    if (!cases || cases.length !== new Set(cases).size || names.length !== new Set(names).size ||
      names.some(name => !cases.includes(name))) throw new Error('Tool catalog and kernel dispatch differ');
  }
  for (const node of tree.body) if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source) {
    const dependency = moduleDependency(root, path, node);
    (DEPS.get(path) || DEPS.set(path, []).get(path)).push(dependency);
    await bundle(dependency);
    for (const row of node.specifiers) {
      if (row.type === 'ImportNamespaceSpecifier') continue;
      const name = node.type === 'ImportDeclaration' ? row.imported.name : row.local.name;
      if (!EXPORTS.get(dependency)?.has(name))
        throw new Error('Missing named export in ' + dependency + ' for ' + path + ': ' + name);
    }
  }
  MODULE_SOURCES.set(path, source);
  assemble(path, source);
  bundling.delete(path);
}
function assemble(path, source) {
  const tree = parse(source, 'module'), changes = [], exported = [];
  const factory = INK_FACTORIES[path];
  if (factory) {
    const declaration = tree.body.filter(node => node.type === 'VariableDeclaration')
      .flatMap(node => node.declarations).find(row => row.id.type === 'Identifier' && row.id.name === factory);
    if (declaration?.init?.type !== 'ArrowFunctionExpression' || declaration.init.params.length)
      throw new Error('Retained ink factory must be a zero-argument closure: ' + path + ':' + factory);
    changes.push({start: declaration.init.start, end: declaration.init.start, text: `artifactFactories[${JSON.stringify(path)}] = `});
  }
  for (const node of tree.body) {
    if (node.type === 'ImportDeclaration') {
      changes.push({start: node.start, end: node.end, text: moduleImportText(node, moduleDependency(root, path, node))});
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.source) {
        const owner = 'modules[' + JSON.stringify(moduleDependency(root, path, node)) + ']';
        exported.push(...node.specifiers.map(row => moduleExportField(row.exported.name, owner + '.' + row.local.name)));
        changes.push({start: node.start, end: node.end, text: ''});
      } else if (node.declaration) {
        const declaration = node.declaration;
        const names = declaration.type === 'VariableDeclaration' ? declaration.declarations.flatMap(row => identifiers(row.id)) : [declaration.id.name];
        exported.push(...names.map(name => moduleExportField(name, name)));
        changes.push({start: node.start, end: declaration.start, text: ''});
      } else {
        exported.push(...node.specifiers.map(row => moduleExportField(row.exported.name, row.local.name)));
        changes.push({start: node.start, end: node.end, text: ''});
      }
    } else if (node.type === 'ExportDefaultDeclaration') throw new Error('Default exports do not belong in the browser kernel');
  }
  EXPORTS.set(path, new Set(moduleExportNames(tree)));
  MODULES.set(path, `modules[${JSON.stringify(path)}] = (${retainedModule(path) && !factory ? `artifactFactories[${JSON.stringify(path)}] = ` : ''}() => {\n${apply(source, changes)}\nreturn {${exported.join(',')}};\n})();`);
}

await bundle('agent/catalog.mjs');
await bundle('skills/rapier-html/return-address.mjs');
await bundle('agent/kernel.mjs');
await bundle('agent/structure-request.mjs');
await bundle('agent/markdown-spec.mjs');
await bundle('layout/model.mjs');
await bundle('layout/preparation.mjs');
await bundle('layout/occlusion.mjs');
await bundle('layout/occlusion-viewport.mjs');
await bundle('layout/transient-lifecycle.mjs');
await bundle('layout/bottom-surfaces.mjs');
await bundle('layout/markdown.mjs');
await bundle('images/assets.mjs');
await bundle('images/ocr.mjs');
await bundle('images/picture-marks.mjs');
await bundle('images/archive.mjs');
await bundle('interchange/docx.mjs');
await bundle('interchange/pdf.mjs');
await bundle('agent/vendor/pretext/rich-inline.js');
await bundle('draw/core.mjs');
await bundle('draw/edit.mjs');
await bundle('draw/font.mjs');
await bundle('notes/personal.mjs');
await bundle('spec/document-fonts.mjs');
if (PROFILE === 'full') for (const part of PARTS) for (const path of Object.values(part.globals)) await bundle(path);
await bundle('agent/door-identity.mjs');
await bundle('kit/render.mjs');
await bundle('kit/render-styles.mjs');
await bundle('kit/render-markdown.mjs');
await bundle('kit/render-sanitize.mjs');
await bundle('kit/render-print.mjs');
await bundle('editor/export-fonts.mjs');
await bundle('shell/fonts/docx-fonts.mjs');
await bundle('images/crc32.mjs');
const globals = {'RapierPortablePage': 'skills/rapier-html/wrap.mjs', 'RapierCursorMotion': 'agent/cursor-motion.mjs', 'RapierLedger': 'kit/rapier-ledger.mjs', 'RapierLedgerCarried': 'kit/ledger/carried.mjs', 'RapierRender': 'kit/render.mjs', 'RapierExportFonts': 'editor/export-fonts.mjs', 'RapierRenderStyles': 'kit/render-styles.mjs', 'RapierRenderMarkdown': 'kit/render-markdown.mjs', 'RapierRenderSanitizer': 'kit/render-sanitize.mjs', 'RapierRenderPrint': 'kit/render-print.mjs', 'RapierEmbedContract': 'packages/rapier-embed/contract.mjs', 'RapierComments': 'agent/comments.mjs', 'RapierVisualCapture': 'agent/visual-browser.mjs', 'RapierAgentVisual': 'agent/visual.mjs', 'RapierPageReturnAddress': 'skills/rapier-html/return-address.mjs', 'RapierMarkdownSpec': 'agent/markdown-spec.mjs', 'RapierInk': 'spec/ink.mjs', 'RapierInkDraw': 'layout/ink-draw.mjs', 'RapierMarkdownLayout': 'layout/markdown.mjs', 'RapierImageAssets': 'images/assets.mjs', 'RapierImageArchive': 'images/archive.mjs', 'RapierDocxImport': 'interchange/docx.mjs', 'RapierPdf': 'interchange/pdf.mjs', 'RapierAgentCatalog': 'agent/catalog.mjs', 'RapierKernel': 'agent/kernel.mjs', 'RapierJournalRecords': 'kit/ledger/journal-records.mjs', 'RapierVisibleSource': 'editor/visible-source.mjs', 'RapierColourMath': 'editor/colour-math.mjs', 'RapierAgentWill': 'agent/will.mjs', 'RapierAgentMarkdown': 'agent/markdown.mjs', 'RapierStructureRequest': 'agent/structure-request.mjs', 'RapierImageLayout': 'layout/model.mjs', 'RapierOcclusion': 'layout/occlusion.mjs', 'RapierOcclusionViewport': 'layout/occlusion-viewport.mjs', 'RapierTransientLifecycle': 'layout/transient-lifecycle.mjs', 'RapierBottomSurfaces': 'layout/bottom-surfaces.mjs', 'RapierDrawCore': 'draw/core.mjs', 'RapierFlowchart': 'draw/flowchart.mjs', 'RapierDrawEdit': 'draw/edit.mjs', 'RapierDrawFonts': 'draw/font.mjs', 'RapierDrawLetters': 'draw/letters.mjs', 'RapierNativeTransport': 'shell/native-transport.mjs', 'RapierDoorIdentity': 'agent/door-identity.mjs', 'RapierDiff': 'agent/diff.mjs'};
globals.RapierRenderedEdits = 'editor/rendered-edits.mjs';
globals.RapierDiffStructure = 'agent/diff-structure.mjs';
globals.RapierCodeTokens = 'editor/code-tokens.mjs';
globals.RapierDocxFonts = 'shell/fonts/docx-fonts.mjs';
globals.RapierPersonal = 'notes/personal.mjs';
globals.RapierTextPreparation = 'layout/preparation.mjs';
globals.RapierTypography = 'layout/typography.mjs';
globals.RapierExportWorker = 'editor/export-worker.mjs';
globals.RapierExportDialect = 'editor/export-dialect.mjs';
globals.RapierSourceWorker = 'editor/source-worker.mjs';
globals.RapierWorkerExecution = 'shell/worker-execution.mjs';
globals.RapierPlainPaste = 'editor/plain-paste.mjs';
globals.RapierImageInspection = 'images/inspection.mjs';
globals.RapierRecoveryWorker = 'editor/recovery-worker.mjs';
globals.RapierRecoveryPolicy = 'editor/recovery-policy.mjs';
globals.RapierOcr = 'images/ocr.mjs';
globals.RapierPictureMarks = 'images/picture-marks.mjs';
globals.RapierDrawRefraction = 'draw/refraction-browser.mjs';
globals.RapierZipRecords = 'notes/zip-records.mjs';
globals.RapierLiveMerge = 'kernel/live-merge.mjs';
globals.RapierLiveSession = 'editor/live-session.mjs';
globals.RapierCustodyBridge = 'editor/custody-bridge.mjs';
globals.RapierPageRules = 'editor/page-rules.mjs';
globals.RapierAgentEditor = 'agent/editor.mjs';
globals.RapierSourceFacts = 'editor/source-facts.mjs';
const partGlobals = Object.assign({}, ...PARTS.map(part => part.globals));
Object.assign(globals, partGlobals);
for (const path of Object.values(globals)) await bundle(path);
const workerEntries = [['images/inspection.mjs', 'installImageInspectionWorker'], ['editor/recovery-worker.mjs', 'installRecoveryWorker'], ['agent/diff.mjs', 'installDiffWorker'], ['agent/diff-structure.mjs', 'installDiffStructureWorker'], ['editor/export-worker.mjs', 'installExportWorker'], ['editor/source-worker.mjs', 'installSourceWorker'], ['editor/live-session.mjs', 'installLiveWorker'], ['notes/backup-worker.mjs', 'installBackupWorker'], ['notes/opfs-worker.mjs', 'installOPFSWorker'], ['notes/search.mjs', 'installSearchWorker'], ['draw/paint-worker.mjs', 'installPaintWorker'], ['draw/water-worker.mjs', 'installWaterWorker'], ['draw/paint-parallel.mjs', 'installPaintRowWorker'], ['draw/liquid-worker.mjs', 'installLiquidWorker']].filter(([entry]) => MODULES.has(entry));
const shakenExports = {};
{
  const classicPaths = [...new Set(['editor/engine.js', 'editor/share.js',
    ...Object.values(ENGINE_MODULE_SLOTS).filter(path => path.endsWith('.js')),
    ...JSON.parse(await read('editor/scripts.json'))])];
  const classic = await Promise.all(classicPaths.map(read));
  const bare = (path, text) => stripperFor(path)?.(text) ?? text;
  const runtimeSources = [...classic.map((text, index) => ({text: bare(classicPaths[index], text), module: false})),
    ...[...MODULE_SOURCES].map(([path, text]) => ({text: bare(path, text), module: true})),
    ...await Promise.all([...new Set(satelliteSlots.map(([, path]) => path))].map(async path => ({text: bare(path, await read(path)), module: true}))),
    ...await Promise.all(['shell/platform.js', 'shell/bundle-io.js', 'shell/bundled-plugins.js', 'shell/plugin-loader.js',
      'shell/font-subset-plugin.js', 'shell/parts.js', 'tools/runtime-loader.js', 'tools/startup-rescue.js',
      'agent/apps.js', 'bench/document.js', 'bench/graphics.js', 'bench/runner.js'].map(async path => ({text: bare(path, await read(path)), module: false})))];
  const published = new Map();
  for (const [name, path] of Object.entries(globals)) {
    let used = published.get(path) || new Set(), observed = false;
    for (const row of runtimeSources) {
      if (!row.text.includes(name)) continue;
      observed = true;
      row.tree ||= acorn.parse(row.text, {ecmaVersion: 'latest', sourceType: row.module ? 'module' : 'script', locations: true});
      const names = readNames(row.tree, name);
      if (names === null) { used.all = true; break; }
      for (const field of names) used.add(field);
    }
    if (!observed || !used.size || satelliteSlots.some(([, owner]) => owner === path)) used.all = true;
    published.set(path, used);
  }
  const reflected = reflectedNames([...classic.map(text => parse(text)), ...[...MODULE_SOURCES.values()].map(text => parse(text, 'module'))]);
  const requested = new Map(published);
  for (const [entry, install] of workerEntries) {
    const used = requested.get(entry) || requested.set(entry, new Set()).get(entry);
    used.add(install);
  }
  for (const [path, original] of [...MODULE_SOURCES].reverse()) {
    let source = original;
    if (!requested.get(path)?.all && !retainedModule(path)) {
      const used = requested.get(path) || new Set();
      const drop = [...EXPORTS.get(path)].filter(name => !used.has(name) && !reflected.has(name) && !/^__rapier/.test(name) && name !== 'SEAMS');
      if (drop.length) {
        const shaken = shakeModule(source, drop);
        source = shaken.source;
        if (shaken.unexported.length) shakenExports[path] = shaken.unexported;
      }
    }
    source = pruneImports(source);
    MODULE_SOURCES.set(path, source);
    assemble(path, source);
    for (const node of parse(source, 'module').body) if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source) {
      const dependency = moduleDependency(root, path, node);
      const used = requested.get(dependency) || requested.set(dependency, new Set()).get(dependency);
      for (const row of node.specifiers) {
        if (row.type === 'ImportNamespaceSpecifier') used.all = true;
        else used.add(node.type === 'ImportDeclaration' ? row.imported.name : row.local.name);
      }
    }
  }
}
const unreadModules = [];
{
  const importers = path => [...MODULE_SOURCES.keys()].filter(owner => (DEPS.get(owner) || []).includes(path));
  const entries = new Set([...MODULE_SOURCES.keys()].filter(path => !importers(path).length));
  const kept = new Set([...entries, ...Object.values(globals), ...workerEntries.map(([entry]) => entry), ...satelliteSlots.map(([, path]) => path)]);
  const named = (owner, path) => parse(MODULE_SOURCES.get(owner), 'module').body.some(node =>
    (node.type === 'ImportDeclaration' && node.specifiers.length || node.type === 'ExportNamedDeclaration' && node.source) && moduleDependency(root, owner, node) === path);
  const before = new Map(MODULE_SOURCES);
  for (let changed = true; changed;) {
    changed = false;
    for (const path of [...MODULE_SOURCES.keys()]) {
      if (kept.has(path) || retainedModule(path) || !MODULES.has(path)) continue;
      const readers = importers(path);
      if (readers.some(owner => named(owner, path)) || !declaresOnly(MODULE_SOURCES.get(path))) continue;
      for (const owner of readers) {
        const source = dropBareImports(MODULE_SOURCES.get(owner), new Set([path]), node => moduleDependency(root, owner, node));
        MODULE_SOURCES.set(owner, source); assemble(owner, source);
        DEPS.set(owner, (DEPS.get(owner) || []).filter(dep => dep !== path));
      }
      MODULE_SOURCES.delete(path); MODULES.delete(path); EXPORTS.delete(path);
      unreadModules.push(path); changed = true;
    }
  }
  const gone = new Set(unreadModules);
  for (const [path, source] of MODULE_SOURCES)
    if (source !== before.get(path) && source !== dropBareImports(before.get(path), gone, node => moduleDependency(root, path, node)))
      throw new Error('Removing unread modules changed ' + path + ' beyond its bare imports');
}
const VENDOR_GROUPS = {
  'lib-dompurify': ['dompurify-3.4.17.es2024.min.js'],
  'lib-turndown': ['turndown-7.2.4.es2024.min.js'],
  'lib-markdownit': ['markdown-it-15.0.3.es2022.umd.js', 'markdown-it-task-lists-2.1.1.min.js', 'markdown-it-footnote-4.0.0.min.js',
    'markdown-it-mark-4.0.0.min.js', 'markdown-it-sup-2.0.0.min.js', 'markdown-it-emoji-3.1.0-light.min.js',
    'markdown-it-abbr-2.0.0.min.js', 'markdown-it-ins-4.0.0.min.js', 'markdown-it-deflist-4.0.0.min.js'],
  'lib-gpu-lexer': ['gpu-lexer-0.0.4.js'],
  'lib-acorn': ['acorn-8.19.0.modern.js'],
};
const vendorSpans = new Map();
let markdownSharing = null;
async function deriveVendorGroup(id) {
  if (vendorSpans.has(id)) return vendorSpans.get(id);
  const provenance = JSON.parse(await read('shell/vendor/PROVENANCE.json')), spans = [];
  for (const name of VENDOR_GROUPS[id]) {
    const bytes = await readFile(resolve(root, 'shell/vendor', name)), record = provenance.files[name];
    if (!record || record.bytes !== bytes.length || record.sha256 !== checksum(bytes)) throw new Error('Vendor file ' + name + ' does not match shell/vendor/PROVENANCE.json');
    const source = bytes.toString('utf8');
    spans.push(entitiesVendor(name, source) || {name, source});
  }
  if (id === 'lib-markdownit') {
    const shared = sharedMarkdownVendor(root, spans);
    markdownSharing = shared.inventory;
    vendorSpans.set(id, shared.spans);
  } else vendorSpans.set(id, spans);
  return vendorSpans.get(id);
}
const textVendorIds = ['lib-dompurify', 'lib-turndown', 'lib-markdownit'];
const browserVendorSpans = id => id === 'lib-markdownit'
  ? Promise.all(textVendorIds.map(deriveVendorGroup)).then(groups => groups.flat()) : deriveVendorGroup(id);
for (const id of ['lib-markdownit', 'lib-gpu-lexer', 'lib-acorn'])
  browserVendorSpans(id).then(spans => prepack(id, 'text/rapier-vendor', spans), () => {});
if (PROFILE === 'full') {
  const parserSpans = (await deriveVendorGroup('lib-markdownit')).map(({name, source}) => [name + '.sha256', checksum(Buffer.from(source))]);
  if (!parserSpans.length) throw new Error('Search cache needs the parser identities of the spans this build packs');
  const scripts = JSON.parse(await read('editor/scripts.json'));
  const key = searchCacheVersion([
    ...MODULES.entries(),
    ...await Promise.all(['editor/engine.js', 'editor/scripts.json', ...scripts, 'tools/build.mjs', 'tools/minify.mjs', 'tools/closure-compiler.mjs', 'tools/engine-census.mjs', 'tools/text-pack.mjs', 'tools/text-pack-build.mjs', 'tools/runtime-symbols.mjs', 'tools/search-cache-version.mjs'].map(async path => [path, await read(path)])),
    ...parserSpans,
  ]);
  const path = 'notes/search-cache.mjs', marker = '__RAPIER_SEARCH_CACHE_VERSION__';
  if (MODULES.get(path).split(marker).length !== 2) throw new Error('Search cache identity slot must occur once');
  MODULES.set(path, MODULES.get(path).replace(marker, key));
}
const workerClosure = entry => { const seen = new Set(); const visit = path => { if (seen.has(path)) return; seen.add(path); for (const dep of DEPS.get(path) || []) visit(dep); }; visit(entry); return [...MODULES.keys()].filter(path => seen.has(path)); };
const workerPaths = new Set(workerEntries.flatMap(([entry]) => workerClosure(entry)));
for (const path of workerPaths) {
  const head = `modules[${JSON.stringify(path)}] = (`;
  if (!MODULES.get(path).startsWith(head)) throw new Error('Worker module is not an ordinary factory: ' + path);
  MODULES.set(path, head + `workerFactories[${JSON.stringify(path)}] = ` + MODULES.get(path).slice(head.length));
}
const workerSourceOf = new Map(workerEntries.map(([entry, install]) => [entry, `
Object.defineProperty(modules[${JSON.stringify(entry)}], 'workerSource', {value: () => '(() => {\\nconst modules = {}, artifactFactories = {};\\n' +
  ${JSON.stringify(workerClosure(entry))}.map(path => 'modules[' + JSON.stringify(path) + '] = (' + workerFactories[path].toString() + ')();').join('\\n') +
  '\\nmodules[${JSON.stringify(entry)}].${install}(self);\\n})();\\n'});`]));
const pretextLicense = await read('agent/vendor/pretext/LICENSE') + '\n\n' + await read('agent/vendor/hyphen-en-us/LICENSE');
const freehandNotice = /^\/\*([\s\S]*?)\*\//.exec(await read('draw/freehand.mjs'))?.[1].replace(/^ {3}/gm, '').trim();
if (!freehandNotice?.includes('MIT License') || !freehandNotice.includes('Copyright (c) 2021 Stephen Ruiz Ltd')) throw new Error('Missing perfect-freehand notice');
const retainedGroups = Object.fromEntries(Object.keys(RETAINED_GROUPS).map(group => [group, [...MODULES.keys()].filter(path => retainedGroup(path) === group)]));
// Pretext's licence rides once, as the string the styled export writes; the Licences sheet shows it.
const codecPaths = new Set(['draw/font-brotli-dictionary.mjs', 'draw/font-brotli.mjs', 'images/crc32.mjs', 'shell/worker-execution.mjs', 'shell/fonts/docx-fonts.mjs', ...SHARED_MARKDOWN_MODULES]);
for (const path of SHARED_MARKDOWN_MODULES) if (!MODULES.has(path) || (DEPS.get(path) || []).length)
  throw new Error('Shared Markdown factory must be present with no external module bindings: ' + path);
for (const path of codecPaths) if (!SHARED_MARKDOWN_MODULES.includes(path))
  for (const dep of DEPS.get(path) || []) if (SHARED_MARKDOWN_MODULES.includes(dep))
    throw new Error(path + ' needs a Markdown factory inside the gzip codec');
const runtimeParts = (await read('tools/runtime-loader.js')).split('// RAPIER_PACKED_STARTUP\n');
if (runtimeParts.length !== 2) throw new Error('Packed startup marker must occur once');
let runtimeLoaderBody = runtimeParts[0];
const continuationNodes = parse(runtimeParts[1]).body;
if (continuationNodes.some(node => node.type !== 'FunctionDeclaration'))
  throw new Error('Packed startup must contain only function declarations');
if (/markdown-runtime|markdownit|createMarkdownPlugins/.test(runtimeParts[1])) throw new Error('Packed startup must not depend on the Markdown factories');
const startupVendorIds = ['lib-markdownit', 'lib-gpu-lexer'];
let runtimeStartupSource = fillBuiltinSlot(fillBuiltinSlot(runtimeParts[1], '/* RAPIER_STARTUP_VENDORS */ []', JSON.stringify(startupVendorIds)),
  '/* RAPIER_BUILTIN_PLUGINS_READY */', 'try { await RapierBundledPlugins.ready(); } catch (error) { console.warn(\'[rapier] started without its plug-ins\', error); }');
const codecText = await lean('(() => {\nconst modules = {}, workerFactories = {};\n' +
  [...MODULES].filter(([path]) => codecPaths.has(path)).map(([, source]) => source).join('\n') +
  '\nglobalThis.RapierCodecs = Object.freeze({modules:Object.freeze(modules),factories:Object.freeze(workerFactories),' +
  'decodeBrotli:modules["draw/font-brotli.mjs"].decodeBrotli,crc32:modules["images/crc32.mjs"].crc32});\n})();\n' + runtimeStartupSource, 'rapier-codecs.js');
const factoryFontPath = 'shell/fonts/docx-fonts.mjs';
if (workerPaths.has(factoryFontPath) || (DEPS.get(factoryFontPath) || []).some(path => !codecPaths.has(path)))
  throw new Error('Factory fonts must depend only on the early codecs');
const factoryFontText = await lean('globalThis.RapierDocxFonts = globalThis.RapierCodecs.modules[' +
  JSON.stringify(factoryFontPath) + ']; Object.freeze(globalThis.RapierDocxFonts);', 'rapier-factory-fonts.js');
MODULES.set(factoryFontPath, 'modules[' + JSON.stringify(factoryFontPath) + '] = globalThis.RapierDocxFonts;');
let partOf = new Map();
if (PROFILE === 'full') {
  const imported = new Set([...DEPS.values()].flat()), partPaths = new Set(Object.values(partGlobals));
  const coreRoots = [...MODULES.keys()].filter(path => !imported.has(path) && !partPaths.has(path))
    .concat(Object.entries(globals).filter(([name]) => !Object.hasOwn(partGlobals, name)).map(([, path]) => path),
      'notes/integrity.mjs');
  partOf = partition({roots: coreRoots, partRoots: PARTS.map(part => [part.id, Object.values(part.globals)]), deps: DEPS, order: [...MODULES.keys()]}).owner;
  const retained = [...partOf.keys()].filter(retainedModule);
  if (retained.length) throw new Error('A styled-export factory belongs in core: ' + retained.join(', '));
}
const sharedText = (part, head) => '(() => {\n' + head + [...MODULES].filter(([path]) => !codecPaths.has(path) && partOf.get(path) === part).map(([, source]) => source).join('\n') +
  workerEntries.filter(([entry]) => partOf.get(entry) === part).map(([entry]) => workerSourceOf.get(entry)).join('') + '\n' +
  Object.entries(globals).filter(([, path]) => partOf.get(path) === part).map(([name, path]) => `globalThis.${name} = Object.freeze(modules[${JSON.stringify(path)}]);`).join('\n');
const bundleText = await lean(sharedText(undefined, 'const modules = {...globalThis.RapierCodecs.modules}, artifactFactories = {}' + (workerPaths.size ? ', workerFactories = {...globalThis.RapierCodecs.factories}' : '') + ';\n') +
  '\nglobalThis.RapierModuleRegistry = Object.freeze({modules, workerFactories});' +
  '\nglobalThis.RapierArtifactLayoutDependencies = Object.freeze({factories:Object.freeze(artifactFactories),groups:' + JSON.stringify(retainedGroups) + ',license:' + JSON.stringify(pretextLicense) + ',inkLicense:' + JSON.stringify(freehandNotice) + '});\n})();', 'rapier-shared.js');
const partShared = new Map();
for (const part of PART_IDS)
  partShared.set(part, await lean(sharedText(part, 'const {modules, workerFactories} = globalThis.RapierModuleRegistry, artifactFactories = {};\n') + '\n})();', 'rapier-part-' + part + '-shared.js'));
new vm.Script(bundleText, {filename: 'rapier-agent-bundle.js'});

let html = await readBuildShell(root);
// The shell's licence comment is the notice only, byte for byte, ending at its Licenses line.
{
  const notice = /^<!DOCTYPE html>\n<!--\n[\s\S]*?\tFull license, no-warranty terms, and exact source download: Settings → Licenses\.\n/.exec(html);
  const close = notice ? html.indexOf('-->', notice[0].length) : -1;
  if (close < 0) throw new Error('The shell must open with its licence notice');
  html = notice[0] + html.slice(close);
}
{
  const panel = /(?:<template id="rapier-boot-failure-later">)?(<main class="rapier-boot-failure"[\s\S]*?<\/main>)(?:<\/template>)?/g;
  if ([...html.matchAll(panel)].length !== 1) throw new Error('The page must have exactly one startup-failure panel');
  html = html.replace(panel, (_, main) => '<template id="rapier-boot-failure-later">' + main + '</template>');
}
const policySlot = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/g;
if ([...html.matchAll(policySlot)].length !== 1) throw new Error('The page must have exactly one policy slot');
html = html.replace(policySlot, () => '<meta http-equiv="Content-Security-Policy" content="' + csp('web') + '">');
let ui = await fillMathLicense(await read('editor/ui.html'), {root});
// Notes' markup sits between RAPIER_NOTES markers in editor/ui.html. The reader drops the regions
const notesMarkup = /<!-- RAPIER_NOTES_BEGIN -->([\s\S]*?)<!-- RAPIER_NOTES_END -->/g, notesRegions = [...ui.matchAll(notesMarkup)];
if (!notesRegions.length || notesRegions.some(([, inner]) => inner.includes('<!-- RAPIER_NOTES_')) ||
  ui.split('<!-- RAPIER_NOTES_').length - 1 !== 2 * notesRegions.length) throw new Error('Notes markup markers are unbalanced');
ui = ui.replace(/<!-- RAPIER_NOTES_(?:BEGIN|END) -->/g, '');
// The markers for what the reader leaves out (RAPIER_EDITOR_ONLY, RAPIER_READER_SKIP) stay out of every other profile's page.
ui = editorOnlyMarkup(ui);
const commercialMarkup = /<!-- RAPIER_COMMERCIAL_BEGIN -->[\s\S]*?<!-- RAPIER_COMMERCIAL_END -->\n?/g;
if ([...ui.matchAll(commercialMarkup)].length !== 1 || ui.split('<!-- RAPIER_COMMERCIAL_').length !== 3) throw new Error('Commercial sheet markers are unbalanced');
ui = commercialPage(ui, JSON.parse(await read('commercial-checkout.json')));
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const peleNotice = await read('shell/vendor/pele/LICENSE');
const peleProvenance = JSON.parse(await read('shell/vendor/pele/PROVENANCE.json'));
// The adapter Rapier wrote is one MIT line. Pele's own notice follows it; Rapier's file inventory does not.
const rapierAdapterLine = 'Copyright (c) 2026 Jack Skipworth. SPDX-License-Identifier: MIT\n';
if (!peleNotice.startsWith(rapierAdapterLine) || !peleNotice.includes('Copyright (c) 2026 kepano\n') ||
    peleNotice.includes('Files under this license carry') || peleProvenance.license !== 'MIT' ||
    peleProvenance.noticesSha256 !== createHash('sha256').update(peleNotice).digest('hex'))
  throw new Error('The diagram-core notice must be Rapier\'s MIT line and Pele\'s own license');
ui = ui.replace('<pre class="license-text" data-license="pele"></pre>', () => '<pre class="license-text">' + escapeHtml(peleNotice) + '</pre>');
const roughNotice = /^\/\*([\s\S]*?)\*\//.exec(await read('draw/rough.mjs'))?.[1].replace(/^ {3}/gm, '').trim();
if (!roughNotice?.includes('MIT License') || !roughNotice.includes('Copyright (c) 2019 Preet Shihn')) throw new Error('Missing rough.js notice');
// The Paint engine is a port of libmypaint (ISC) and the factory brushes are Brien Dieterle's
// (CC0): both notices are read from their own files and shown where a person can read them.
const mypaintNotice = (await read('draw/vendor-notices/libmypaint-COPYING.txt')).trim();
if (!mypaintNotice.includes('Martin Renold') || !mypaintNotice.includes('Permission to use, copy, modify, and/or distribute')) throw new Error('Missing libmypaint ISC notice');
const dieterleNotice = (await read('draw/vendor-notices/dieterle-brushes-CC0.txt')).trim();
if (!dieterleNotice.includes('Brien Dieterle') || !dieterleNotice.includes('CC0')) throw new Error('Missing Dieterle brush pack notice');
const spectralNotice = (await read('draw/vendor-notices/spectral-js-MIT.txt')).trim();
if (!spectralNotice.includes('Ronald van Wijnen') || !spectralNotice.includes('Permission is hereby granted')) throw new Error('Missing spectral.js MIT notice');
if (!ui.includes('<div class="licenses-list"><template data-rapier-later>')) throw new Error('The licenses list has no held-back notices');
ui = ui.replace('<div class="licenses-list"><template data-rapier-later>', () => '<div class="licenses-list"><template data-rapier-later>\n' +
    '<details class="license-entry"><summary><span class="license-name">Pretext 1.0.0 · 0d102a5c</span><span class="license-id">MIT · BSD · Unicode · ICU</span></summary><pre class="license-text" data-license="pretext"></pre></details>\n' +
  '<details class="license-entry"><summary><span class="license-name">perfect-freehand</span><span class="license-id">MIT</span></summary><pre class="license-text">' + escapeHtml(freehandNotice) + '</pre></details>\n' +
  '<details class="license-entry"><summary><span class="license-name">rough.js generator</span><span class="license-id">MIT</span></summary><pre class="license-text">' + escapeHtml(roughNotice) + '</pre></details>\n' +
  '<details class="license-entry"><summary><span class="license-name">libmypaint brush engine (port)</span><span class="license-id">ISC</span></summary><pre class="license-text">' + escapeHtml(mypaintNotice) + '</pre></details>\n' +
  '<details class="license-entry"><summary><span class="license-name">Factory brushes · Brien Dieterle</span><span class="license-id">CC0 1.0</span></summary><pre class="license-text">' + escapeHtml(dieterleNotice) + '</pre></details>\n' +
  '<details class="license-entry"><summary><span class="license-name">Spectral.js color data</span><span class="license-id">MIT</span></summary><pre class="license-text">' + escapeHtml(spectralNotice) + '</pre></details>\n');
{
  const words = text => text.replace(/\s+/g, ' ');
  const sheet = words(ui.replace(/<[^>]*>/g, ' ').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&'));
  if (sheetNotices.size !== SHEET_NOTICES.size) throw new Error('A notice the sheet carries was not met in the bundle: ' + [...SHEET_NOTICES.keys()].filter(path => !sheetNotices.has(path)).join(', '));
  for (const [path, notice] of sheetNotices) if (!sheet.includes(words(notice.slice(notice.indexOf(SHEET_NOTICES.get(path)))).trim()))
    throw new Error('The Licences sheet does not carry the notice of ' + path + ', which the shared runtime no longer repeats');
}
if (/<script\b/i.test(ui)) throw new Error('Editor interface markup must not contain scripts');
let appsUi = dropIndentation(stripMarkupComments(ui.replace(commercialMarkup, '')));
if (appsUi !== null && /commercial-overlay|RAPIER_COMMERCIAL|buy\.stripe\.com/.test(appsUi)) throw new Error('The ChatGPT copy\'s interface must carry no commercial sheet and no link that starts a purchase');
ui = dropIndentation(stripMarkupComments(ui.replace(/<!-- RAPIER_COMMERCIAL_(?:BEGIN|END) -->\n?/g, '')));
const firstScreenMarker = '<!-- RAPIER_FIRST_SCREEN_END -->';
const splitFirstScreen = (markup, label) => {
  const at = markup.indexOf(firstScreenMarker);
  if (at < 0 || markup.indexOf(firstScreenMarker, at + firstScreenMarker.length) >= 0) throw new Error(label + ' needs one first-screen marker');
  const head = markup.slice(0, at), rest = markup.slice(at + firstScreenMarker.length);
  if (!head.includes('id="editor-blocks"') || !head.includes('id="btn-find"') || !head.includes('id="btn-overflow"') || rest.includes('id="editor-blocks"')) throw new Error(label + ' first screen must hold the bar and the editor, once');
  return [head, rest];
};
const [firstScreenMarkup, deferredUi] = splitFirstScreen(ui, 'The editor interface');
ui = deferredUi;
if (appsUi !== null) {
  const [appsHead, appsDeferred] = splitFirstScreen(appsUi, 'The Apps interface');
  if (appsHead !== firstScreenMarkup) throw new Error('The first screen must be the same in every profile, and must not carry the commercial sheet');
  appsUi = appsDeferred;
}
const styleRowsAll = JSON.parse(await read('editor/styles.json'));
const partStyleIds = new Set(PARTS.flatMap(part => part.styles));
if ([...partStyleIds].some(id => !styleRowsAll.some(row => row.id === id))) throw new Error('A part names a style row editor/styles.json does not');
const styleRows = styleRowsAll.filter(row => !partStyleIds.has(row.id));
const styles = await Promise.all(styleRows.map(async row => ({...row, css: row.id === 'rapier-font-style' ? '' : styleText(row.path)})));
const partStyles = new Map(PARTS.map(part => [part.id, styleRowsAll.filter(row => part.styles.includes(row.id)).map(row => ({id: row.id, css: styleText(row.path)}))]));
if (new Set(styles.map(row => row.id)).size !== styles.length || styles.some(row => !/^rapier-[a-z-]+-style$/.test(row.id)))
  throw new Error('Editor style rows are invalid');
const styleSlots = /<style id="rapier-boot-style">[\s\S]*?<\/style>/;
if (!styleSlots.test(html) || !html.includes('<template id="rapier-ui-slot"></template>')) throw new Error('Editor interface slots are missing');
html = html.replace(styleSlots, critical => critical.replace(/#rapier-first-screen[^<]*/, ''));
const bootTheme = '<script id="rapier-boot-theme">globalThis.RapierBenchRoute=!!document.querySelector(\'meta[name="rapier-phone-bench"][content="1"]\')||/^https?:$/.test(location.protocol)&&/^\\/bench\\/?$/.test(location.pathname);document.documentElement.classList.add("rapier-script");try{var t=document.querySelector(\'meta[name="rapier-appearance"]\')?.content;try{if(t!=="light"&&t!=="dark")t=globalThis.RapierBenchRoute||globalThis.RapierBenchSession?.active===true?null:JSON.parse(localStorage.getItem("rapier:preference:theme"))}catch(e){}if(t==="light"||(t!=="dark"&&matchMedia("(prefers-color-scheme: light)").matches))document.documentElement.classList.add("rapier-boot-light")}catch(e){}</script>\n' +
  '<style id="rapier-boot-theme-style">html{background:#000}html.rapier-boot-light{color-scheme:light;background:#fff}html.rapier-script body:not(.rapier-first-ready):not(.rapier-boot-failed)>:not(.settings-overlay):not(dialog):not(#toast-root:has(>.rapier-progress)),html.rapier-script body:not(.rapier-first-ready):not(.rapier-boot-failed) #rapier-first-screen>*{opacity:0;pointer-events:none}html:not(.rapier-script) #rapier-first-screen{display:none}#rapier-first-screen{display:contents}</style>\n';
const charsetRepair = '<script id="rapier-charset">(function(){var d=document,n=String(d.characterSet||"").toLowerCase();' +
  'if(n==="utf-8"||globalThis.RapierCharsetRepaired!==undefined)return;var m=new Map,t;' +
  'try{t=new TextDecoder(n);for(var i=0;i<256;i++){var c=t.decode(new Uint8Array([i]));if(c.length!==1||c==="\\ufffd"||m.has(c)||i<128&&c.charCodeAt(0)!==i)return;m.set(c,i)}}catch(e){return}' +
  'globalThis.RapierCharsetRepaired=false;d.write("<plaintext hidden>");' +
  'd.addEventListener("DOMContentLoaded",function(){var r=d.querySelector("plaintext"),h=d.documentElement.outerHTML,' +
  'head="<!doctype html>"+h.slice(0,h.indexOf("<head"))+d.head.outerHTML.replace(/<\\/head>$/,""),rest=r?r.textContent:"",out=rest;' +
  'try{var b=new Uint8Array(rest.length),k=0;for(var j=0;j<rest.length;j++){var x=rest.charCodeAt(j),y=x<128?x:m.get(rest[j]);if(y===undefined)throw 0;b[k++]=y}' +
  'out=new TextDecoder("utf-8",{fatal:true}).decode(b.subarray(0,k));globalThis.RapierCharsetRepaired=true}catch(e){}' +
  'd.open();d.write(head+out);d.close()})})()</script>\n';
html = html.replace(/<script id="rapier-charset">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/<script id="rapier-boot-theme">[\s\S]*?<\/script>\s*<style id="rapier-boot-theme-style">[\s\S]*?<\/style>\s*/, '');
html = html.replace(/(<meta name="viewport")/, (_, anchor) => charsetRepair + bootTheme + anchor);
html = html.replace(/<!-- RAPIER_JXL_BEGIN -->[\s\S]*?<!-- RAPIER_JXL_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_BACKUP_WORKER_BEGIN -->[\s\S]*?<!-- RAPIER_BACKUP_WORKER_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_SHARED_AGENT_BEGIN -->[\s\S]*?<!-- RAPIER_SHARED_AGENT_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_APPS_BRIDGE_BEGIN -->[\s\S]*?<!-- RAPIER_APPS_BRIDGE_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_RUNTIME_BEGIN -->[\s\S]*?<!-- RAPIER_RUNTIME_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_PAINT_BEGIN -->[\s\S]*?<!-- RAPIER_PAINT_END -->\s*/g, '');
html = html.replace(/<!-- RAPIER_PLATFORM_BEGIN -->[\s\S]*?<!-- RAPIER_PLATFORM_END -->\n?/g, '<!-- RAPIER_PLATFORM_BEGIN -->\n<!-- RAPIER_PLATFORM_END -->\n');
html = html.replace(/<meta name="rapier-version" content="[^"]+">/, `<meta name="rapier-version" content="${VERSION}">`);
// The page's search words. The template carries two RAPIER_SEO regions: the head's (the site's description, previews, canonical address
const seoRegion = /<!-- RAPIER_SEO_BEGIN -->[\s\S]*?<!-- RAPIER_SEO_END -->\n?/g;
html = html.replace(seoRegion, (region, at) => at < html.indexOf('<body') ? '' : region);
const siteHead = await read('editor/site-head.html');
html = html.replace(/(<meta name="rapier-version" content="[^"]+">\n)/, (_, version) => version + siteHead);
const seoRegions = [...html.matchAll(seoRegion)], bodyAt = html.indexOf('<body');
if (seoRegions.length !== 2 || bodyAt < 0 || seoRegions[0].index > bodyAt || seoRegions[1].index < bodyAt || !/<script type="application\/ld\+json">/.test(seoRegions[0][0]) ||
    html.split('<!-- RAPIER_SEO_').length !== 5) throw new Error('The shell must carry its two RAPIER_SEO regions: metadata in the head, the guide in the body');
html = html.replace(/<title>[^<]*<\/title>/, () => '<title>' + escapeHtml(HOME_TITLE) + '</title>');
  const siteAttribute = value => escapeHtml(value).replaceAll('"', '&quot;');
  for (const [attribute, name, value] of [
    ['name', 'description', HOME_DESCRIPTION], ['property', 'og:title', HOME_TITLE],
    ['property', 'og:description', HOME_DESCRIPTION], ['name', 'twitter:title', HOME_TITLE],
    ['name', 'twitter:description', HOME_DESCRIPTION],
  ]) {
    const pattern = new RegExp('<meta ' + attribute + '="' + name + '" content="[^"]*">');
    if (!pattern.test(html)) throw new Error('The site head is missing ' + name);
    html = html.replace(pattern, () => '<meta ' + attribute + '="' + name + '" content="' + siteAttribute(value) + '">');
  }
  const sameAs = ['https://github.com/jackskip22/rapier'];
  html = html.replace(/<link rel="(?:describedby|ai-catalog)"[^>]*>\n?/g, '');
  html = html.replace('<!-- RAPIER_SEO_BEGIN -->', '<!-- RAPIER_SEO_BEGIN -->\n' + DISCOVERY_LINKS);
  html = html.replace(/\n<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@graph":[\s\S]*?<\/script>/, '');
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
    const data = JSON.parse(json);
    if (data['@type'] !== 'SoftwareApplication') throw new Error('The structured data must describe the SoftwareApplication');
    data.description = APP_DESCRIPTION;
    data.operatingSystem = ['Android', 'Web', 'Windows', 'Linux'];
    data.softwareHelp = {'@type': 'CreativeWork', url: 'https://rapier.website/agents'};
    data.featureList = ['Free online Markdown editor', 'Markdown viewer: open a .md file formatted',
      'Plain Markdown notes with embedded pictures', 'Mermaid diagrams and LaTeX equations',
      'Editable SVG drawing and typographic art', 'MyPaint brushes and watercolor painting',
      'Word and PDF import', 'Free Word, PDF, text and offline HTML export', 'Comments',
      'One offline HTML file',
      'Live collaboration with agents over MCP and WebMCP', 'See agent presence and changes live',
      'Tap a change to see what was there before and undo anything', 'Agents can show exact changes with the show tool',
      'Offline editable documents with rapier-html',
      'Embeddable editor and lightweight reader with rapier-embed', 'Self-contained Markdown pictures, editable drawings and layout',
      'Will/1 document regions', 'JPEG XL encoding in JavaScript', 'Self-hosted folder and bucket access with rapier-server',
      'Optional sync to your own Cloudflare account'];
    const origin = 'https://rapier.website', site = origin + '/#website', publisher = origin + '/#organization';
    const identity = {'@context': 'https://schema.org', '@graph': [
      {'@type': 'WebSite', '@id': site, url: origin + '/', name: data.name, alternateName: ['Rapier Markdown Editor', data.alternateName], description: data.description, inLanguage: 'en', publisher: {'@id': publisher},
        hasPart: Object.entries(SITE_PAGES).map(([path, door]) => ({'@type': 'WebPage', '@id': origin + path + '#webpage', url: origin + path, name: door.name}))},
      {'@type': 'Organization', '@id': publisher, name: data.name, url: origin + '/', logo: {'@type': 'ImageObject', url: origin + '/icon-512.png', width: 512, height: 512}, sameAs}]};
    return open + JSON.stringify({...data, '@id': origin + '/#application', softwareVersion: VERSION, sameAs: [...sameAs, PLAY_URL], publisher: {'@id': publisher}}) + close + '\n' + open + JSON.stringify(identity) + close;
  });
  const [guide] = [...html.matchAll(seoRegion)].slice(1), engineSource = await read('editor/engine.js');
  const doors = Object.entries(seoDoorSections(engineSource, ui)).map(([path, section]) => {
    const name = 'RAPIER_DOOR_' + path.slice(1).toUpperCase();
    return '<!-- ' + name + '_BEGIN -->\n<template>\n' + section + '\n</template>\n<!-- ' + name + '_END -->';
  }).join('\n');
  html = html.slice(0, guide.index) + '<!-- RAPIER_SEO_BEGIN -->\n' + seoSection() + '\n' + doors + '\n<!-- RAPIER_SEO_END -->\n' + html.slice(guide.index + guide[0].length);
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
  const embedBlock = hostedSource.split(/\n(?=\S)/).find(block => block.startsWith('/embed/*\n')) || '';
  const embedPolicy = /^  Content-Security-Policy: (.*)$/m.exec(embedBlock);
  if (!/^  ! Content-Security-Policy$/m.test(embedBlock) || embedPolicy?.[1] !== csp('embed'))
    throw new Error('_headers /embed/* must replace the hosted policy with security/csp.mjs csp("embed")');
}
{
  const owned = [...html.matchAll(/<script data-rapier-owned>([\s\S]{0,60})/g)].map(match => match[1].replace(/\s+/g, ' ').trim());
  if (owned.length) throw new Error('The template carries ' + owned.length + ' inline script(s) this build does not author; residue is refused, never carried: ' + owned.join(' | '));
}
html = html.replace(/(<script[^>]*type="application\/speedracer-app\+json"[^>]*>)[\s\S]*?(<\/script>)/, (_, open, close) => {
  const connect = /connect-src ([^;]*)/.exec(csp('reader'))[1].split(' ').filter(origin => origin !== "'self'");
  return open + JSON.stringify({speedracer: 1, name: 'rapier', version: VERSION, uses: ['store', 'files'],
    csp: {connectDomains: connect}, permissions: {clipboardWrite: {}}}) + close;
});

let source = await read('editor/engine.js');
// engine.js's RAPIER_JXL_ENCODER literal is
{
  const marker = 'const RAPIER_JXL_ENCODER = true;';
  if (source.split(marker).length - 1 !== 1) throw new Error('editor/engine.js must contain exactly one `' + marker + '` marker');
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
insertSource('/* RAPIER_RENDER_MODULE */', await read('editor/render-host.js'));
insertSource('/* RAPIER_SHARE_MODULE */', await read('editor/share.js'));
insertSource('/* RAPIER_SOURCE_STORE_MODULE */', await read('editor/source-store.js'));
insertSource('/* RAPIER_LEXER_MODULE */', await read('editor/lexer.js'));
const engineImports = new Map(lexicalBindings(acorn.parse(source, {ecmaVersion: 'latest', locations: true})).bindings.filter(binding => binding.scope.top &&
  binding.init?.type === 'MemberExpression' && binding.init.object.name === 'globalThis' && !binding.init.computed &&
  globals[binding.init.property.name] && binding.path.length === 1).map(binding =>
    [binding.name, globals[binding.init.property.name] + ':' + binding.path[0]]));
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
  if (!MODULES.has(path) && span.length !== declarations.length) throw new Error('Engine satellite slot is not contiguous: ' + slot);
  for (const name of names) {
    if (projectedOwners.has(name)) throw new Error('Engine satellite declaration is projected twice: ' + name);
    projectedOwners.set(name, path);
  }
  const shared = MODULES.has(path) ? Object.keys(globals).find(name => globals[name] === path) : null;
  if (MODULES.has(path) && (!shared || names.some(name => !EXPORTS.get(path).has(name))))
    throw new Error('A satellite the shared runtime carries is read from its published exports: ' + path);
  satelliteProjections.push({slot, text: shared ? `const {${names.join(', ')}} = globalThis.${shared};`
    : text.slice(declarations[0].start, declarations.at(-1).end)});
}
for (const [path, {tree}] of satelliteModules) {
  if (MODULES.has(path)) continue;
  for (const name of tree.body.flatMap(satelliteNames)) {
    if (projectedOwners.get(name) !== path) throw new Error('Engine satellite declaration is not projected: ' + name);
  }
  if (MODULES.has(path)) continue;
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
  typeof path !== 'string' || !/^(?:agent|diagrams|draw|editor|images|interchange|jxl|layout|notes|presets)\/[a-z-]+\.js$/.test(path)))
  throw new Error('Editor script sources are invalid');
const partScripts = new Set(PARTS.flatMap(part => part.scripts));
if (PARTS.some(part => part.scripts.some(path => !editorScriptsAll.includes(path)))) throw new Error('A part names an editor script editor/scripts.json does not');
const editorScripts = editorScriptsAll.filter(path => !partScripts.has(path));
// as ui.html's RAPIER_NOTES markup is.
const notesInfoMarkup = /\/\* RAPIER_NOTES_BEGIN \*\/([\s\S]*?)\/\* RAPIER_NOTES_END \*\//g;
const extensionText = async paths => (await Promise.all(paths.map(async path => {
  let text = await read(path);
  if (path === 'editor/info.js') {
    const regions = [...text.matchAll(notesInfoMarkup)];
    if (!regions.length || regions.some(([, inner]) => inner.includes('RAPIER_NOTES_')) ||
      text.split('RAPIER_NOTES_').length - 1 !== 2 * regions.length) throw new Error('editor/info.js Notes markers are unbalanced');
    text = text.replace(/\/\* RAPIER_NOTES_(?:BEGIN|END) \*\//g, '');
  }
  return '/* ' + path + ' */\n' + text;
}))).join('\n');
const extensions = await extensionText(editorScripts);
const partExtensions = await Promise.all(PARTS.map(part => extensionText(part.scripts)));
const benchExtensions = await extensionText(PHONE_BENCH_SCRIPTS);
for (const text of [extensions, ...partExtensions, benchExtensions]) walk(parse(text), node => {
  if (node.type !== 'VariableDeclarator' || node.id.type !== 'ObjectPattern' || node.init?.type !== 'MemberExpression' ||
      node.init.object.name !== 'globalThis' || node.init.computed || !globals[node.init.property.name]) return;
  const path = globals[node.init.property.name];
  for (const row of node.id.properties) if (row.type === 'Property' && !row.computed && !EXPORTS.get(path)?.has(row.key.name || row.key.value))
    throw new Error('Missing browser export in ' + path + ': ' + (row.key.name || row.key.value));
});
insertSource('\nreturn shellPort;\n', '\n' + extensions + '\nreturn shellPort;\n');
{
  const open = "const _rapierShellPort = (function () {\n'use strict';\n", close = '\nreturn shellPort;\n\n})();\n';
  if (source.split(open).length !== 2 || source.split(close).length !== 2 || source.indexOf(open) > source.indexOf(close))
    throw new Error('editor/engine.js must open and close its one program exactly');
  source = source.replace(open, '').replace(close, '\nconst _rapierShellPort = shellPort;\n');
}
async function realmSources() {
  const raw = await Promise.all(['tools/startup-release.js', 'tools/startup-rescue.js', 'tools/runtime-loader.js', 'tools/text-pack.mjs',
    'tools/packed-header.mjs', 'tools/base124.mjs', 'shell/platform.js', 'shell/bundle-io.js', 'shell/bundled-plugins.js', 'shell/plugin-loader.js',
    'shell/font-subset-plugin.js', 'shell/parts.js', 'agent/apps.js', 'agent/host-files.mjs'].map(async path => (await read(path)).replace(/^export /gm, '')));
  const inline = [...(charsetRepair + bootTheme).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const vendors = (await Promise.all(Object.keys(VENDOR_GROUPS).map(deriveVendorGroup))).flat().map(span => span.source);
  const plugins = await Promise.all((await pluginPackFiles()).filter(file => /^rapier-(?:math|mermaid-.*|font-subset|pdf-build-pdf\.mjs)$/.test(file.id))
    .map(async file => {
      const source = (await readPluginFile(file, file.path ? null : resolve(root, 'dist/plugin-cache', file.id))).bytes.toString('utf8');
      return file.id.endsWith('.mjs') ? {source, module: true} : source;
    }));
  return [...raw, ...inline, ...vendors, ...plugins, codecText, factoryFontText, bundleText, ...partShared.values()];
}
const realmInputs = await realmSources();
const realm = await realmNames(realmInputs);
const compiledEditor = await lean("'use strict';\ndocument.currentScript._rapierMountInterface();\n" + source +
  PARTS.filter((_, index) => partExtensions[index] !== undefined).map((part, index) => partMark(part.id) + partExtensions[index]).join('') +
  (PROFILE === 'full' ? partMark('benchmark') + benchExtensions : ''),
  'rapier-editor.js', {toplevel: true, reserved: [...realm.read, ...realm.declared]});
const editorSlices = splitProgram(compiledEditor, PROFILE === 'full' ? [...PART_IDS, 'benchmark'] : []);
source = editorSlices.core;
if (source !== compiledEditor) lean.symbols['rapier-editor.js'] = prefixSymbols(compiledEditor, lean.symbols['rapier-editor.js'], source);
prepack('rapier-editor-runtime', 'application/rapier-runtime', [{name: 'rapier-ui.html', source: ui}, {name: 'rapier-shared.js', source: bundleText}, {name: 'rapier-editor.js', source}]);
{
  const taken = topLevelNames([source, ...editorSlices.parts.values()]).filter(name => realm.declared.has(name));
  if (taken.length) throw new Error('The editor takes a global name another script in its realm declares: ' + taken.join(', '));
  const browserNames = new Set(WINDOW_SHORT_NAMES);
  const browserTaken = [...new Set(topLevelNames([source, ...editorSlices.parts.values()]).filter(name => browserNames.has(name)))];
  if (browserTaken.length) throw new Error('The editor declares a name the browser can predefine: ' + browserTaken.join(', '));
}

const safeScript = value => value.replace(/<\/script/gi, '<\\/script');
function checksum(value) { return createHash('sha256').update(value).digest('hex'); }
function packedScript(id, type, name, source) {
  return packedSpans(id, type, [{name, source}]);
}
const vendorIds = ['lib-markdownit', 'lib-gpu-lexer', 'lib-acorn'], vendorElement = id => new RegExp(String.raw`<script (?:id="${id}" type="text/rapier-vendor"|type="text/rapier-vendor" id="${id}")>\n[\s\S]*?</script>\n`);
for (const id of textVendorIds.slice(0, -1)) html = html.replace(vendorElement(id), '');
for (const id of vendorIds) if (!vendorElement(id).test(html)) throw new Error('The shell has no vendor slot ' + id);
const vendorGroupSpans = await Promise.all(vendorIds.map(browserVendorSpans));
const vendorPacks = Promise.all(vendorIds.map((id, at) => packedSpans(id, 'text/rapier-vendor', vendorGroupSpans[at])));
const {checkVendor} = await import('./jxl-vendor.mjs');
{ const problems = checkVendor(); if (problems.length) throw new Error('images/vendor/rapier-jxl: ' + problems.join('; ')); }
const JXL_PAGE_FILES = ['codec.mjs', 'still.worker.mjs', 'decode.worker.mjs', 'jpeg.worker.mjs'];
const JXL_PART_FILES = {jxlcomplete: ['animation.worker.mjs']};
const JXL_MARKS = {jxlcomplete: 'RAPIER_JXL_ANIMATION_FILES'};
const jxlPin = JSON.parse(await read('images/vendor/rapier-jxl/PIN.json'));
const jxlVendored = Object.fromEntries(await Promise.all([...JXL_PAGE_FILES, ...Object.values(JXL_PART_FILES).flat()].map(async name => [name, await read('images/vendor/rapier-jxl/' + name)])));
const jxlWorker = JXL_PAGE_FILES.map(name => jxlVendored[name]).join('\n');
const jxl = {version: jxlPin.version, source: jxlPin.source.digest, page: Object.fromEntries(JXL_PAGE_FILES.map(name => [name, jxlPin.files[name]])),
  parts: Object.fromEntries(Object.entries(JXL_PART_FILES).map(([part, names]) => [part, Object.fromEntries(names.map(name => [name, jxlPin.files[name]]))]))};
for (const [part, names] of Object.entries(JXL_PART_FILES)) {
  if (!editorSlices.parts.has(part)) throw new Error('No part ' + part + ' to carry ' + names.join(', '));
  const slice = editorSlices.parts.get(part), mark = new RegExp(`(['"])${JXL_MARKS[part]}\\1`, 'g');
  if ((slice.match(mark) || []).length !== 1) throw new Error('The part ' + part + ' has no one ' + JXL_MARKS[part] + ' mark');
  editorSlices.parts.set(part, slice.replace(mark, () => JSON.stringify(JSON.stringify(Object.fromEntries(names.map(name => [name, jxlVendored[name]]))))));
}
if (editorSlices.parts.has('fonts')) {
  const slice = editorSlices.parts.get('fonts'), mark = /(['"])RAPIER_FONT_CATALOG_PIN\1/g, pin = JSON.parse(await read('fonts/catalog-pin.json'));
  if ((slice.match(mark) || []).length !== 1) throw new Error('The font library part has no one catalog pin mark');
  if (!/^https:\/\/cdn\.jsdelivr\.net\/gh\/jackskip22\/rapier-plugins@[0-9a-f]{40}\/catalog\.json$/.test(pin.url) || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || !/^sha384-[A-Za-z0-9+/]{64}$/.test(pin.sri))
    throw new Error('fonts/catalog-pin.json is not a pinned catalog address');
  editorSlices.parts.set('fonts', slice.replace(mark, () => JSON.stringify({url: pin.url, bytes: pin.bytes, sri: pin.sri})));
}
const jxlPack = packedSpans('rapier-jxl-worker', 'application/rapier-jxl-worker', JXL_PAGE_FILES.map(name => ({name, source: jxlVendored[name]})));
// shell's RAPIER_PLATFORM slot; the runtime
const partPacks = Promise.all(PARTS.map(part => packedSpans('rapier-part-' + part.id, 'application/rapier-runtime', [
  {name: 'rapier-part-' + part.id + '-shared.js', source: partShared.get(part.id)},
  {name: 'rapier-part-' + part.id + '-styles.json', source: JSON.stringify(partStyles.get(part.id))},
  {name: 'rapier-part-' + part.id + '.js', source: editorSlices.parts.get(part.id)},
])));
for (const [at, packed] of (await vendorPacks).entries()) html = html.replace(vendorElement(vendorIds[at]), () => packed);
const codecScript = '<!-- RAPIER_JXL_BEGIN -->\n' + await jxlPack + '<!-- RAPIER_JXL_END -->\n';
const partFiles = [];
for (const [at, element] of (await partPacks).entries()) {
  const part = PARTS[at];
  const open = '<script type="application/rapier-runtime" id="rapier-part-' + part.id + '">', body = element.slice(open.length, element.length - '</script>\n'.length);
  const carried = partElement(part.id, body);
  if (carried !== element) throw new Error('A part element is not one inert body: ' + part.id);
  const bytes = Buffer.from(body);
  partFiles.push({id: part.id, element: carried, body, file: 'rapier-' + part.id + '-' + checksum(bytes).slice(0, 16) + '.txt', bytes: bytes.length,
    sri: createHash('sha384').update(bytes).digest('base64')});
}
const platformSpans = [];
{
  const preferences = await read('shell/preferences.mjs');
  const preferenceScript = apply(preferences, parse(preferences, 'module').body
    .filter(node => node.type === 'ExportNamedDeclaration')
    .map(node => ({start: node.start, end: node.declaration.start, text: ''})));
  platformSpans.push({name: 'rapier-preferences.js', source: await lean(
    'globalThis.RapierPreferenceDefinitions = (() => {\n' + preferenceScript +
    '\nreturn Object.freeze({PREFERENCE_ACCENTS, PREFERENCE_DEFINITIONS});\n})();', 'rapier-preferences.js')});
  platformSpans.push({name: 'rapier-file-bytes.js', source: await lean('globalThis.RapierFileBytes = (() => {\n' +
    (await read('shell/file-bytes.mjs')).replace(/^export /gm, '') + '\nreturn Object.freeze({saveFileBytes});\n})();', 'rapier-file-bytes.js')});
  for (const [name, path] of [['rapier-platform.js', 'shell/platform.js'], ['rapier-bundle-io.js', 'shell/bundle-io.js'], ['rapier-bundled-plugins.js', 'shell/bundled-plugins.js'], ['rapier-plugin-loader.js', 'shell/plugin-loader.js'], ['rapier-font-subset-plugin.js', 'shell/font-subset-plugin.js'], ['rapier-parts.js', 'shell/parts.js']]) {
    const input = await read(path);
    const source = await lean(path === 'shell/plugin-loader.js' ? fillBuiltinSlot(fillMermaidResources(input), '/* RAPIER_BUILTIN_FILES_REUSE */', builtinFilesReuse)
      : path === 'shell/font-subset-plugin.js' ? fillFontSubsetResources(input)
      : path === 'shell/parts.js' ? fillBuiltinSlot(input, '/* RAPIER_PARTS */ null', JSON.stringify(partFiles.map(({id, file, bytes, sri}) =>
        ({id, label: PARTS.find(part => part.id === id).label, file, bytes, sri, release: VERSION})))) : input, name);
    platformSpans.push({name, source});
  }
  const slot = /<!-- RAPIER_PLATFORM_BEGIN -->\n<!-- RAPIER_PLATFORM_END -->\n/;
  if (!slot.test(html)) throw new Error('The shell carries no RAPIER_PLATFORM slot');
  const after = html.slice(html.search(slot));
  for (const [, attrs, source] of after.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if ((!type || ['text/javascript', 'application/javascript'].includes(type)) && /\b(?:Rapier(?:TextCodec|FileBytes|Storage|Preferences|Platform|BundleIO)|_rapierProviders)\b/.test(source)) throw new Error('A plain script after the platform slot reads a platform-stage global at parse time');
  }
  const platformScript = '<!-- RAPIER_PLATFORM_BEGIN -->\n' + await packedSpans('rapier-platform-runtime', 'application/rapier-runtime', platformSpans) + '<!-- RAPIER_PLATFORM_END -->\n';
  html = html.replace(slot, () => platformScript);
}
let appsScript = null;
if (PROFILE === 'full') {
  const files = (await read('agent/host-files.mjs')).replace(/^export /gm, '');
  const hostFiles = 'globalThis.RapierHostFiles = (() => {\n' + files + '\nreturn Object.freeze({fileInput, readHostFile, createHostFileBinding});\n})();\n';
  const apps = await lean(hostFiles + await read('agent/apps.js'), 'rapier-apps.js');
  new vm.Script(apps, {filename: 'rapier-apps.js'});
  appsScript = await packedScript('rapier-apps-runtime', 'application/rapier-runtime', 'rapier-apps.js', apps);
}
const base124Source = (await read('tools/base124.mjs')).replace(/^export /gm, '');
const startupRelease = (await read('tools/startup-release.js')).replace('__RAPIER_PWA_ENABLED__', String(PROFILE === 'full'));
const recoveryModules = await bundleModules({root, entries: {RapierBootRecovery: 'shell/boot-recovery.mjs'},
  used: new Map([['RapierBootRecovery', null]])});
const startupRescue = '(() => {\n' + recoveryModules.text + '\n})();\n' + await read('tools/startup-rescue.js');
let phoneBenchScript = '', phoneBenchSpans = [];
let phoneBenchReceipt = null;
if (PROFILE === 'full') {
  const before = new Set(MODULES.keys());
  for (const path of ['bench/fixtures.mjs', 'bench/manifest.mjs', 'bench/results.mjs', 'bench/measure.mjs', 'bench/graphics-fixtures.mjs', 'bench/controller.mjs']) await bundle(path);
  const added = [...MODULES].filter(([path]) => !before.has(path));
  if (added.some(([path]) => !path.startsWith('bench/'))) throw new Error('Phone benchmark introduced an external runtime dependency');
  const benchAdapters = editorSlices.parts.get('benchmark');
  const identity = {version: VERSION, build: checksum(JSON.stringify({editor: source, shared: bundleText, factoryFonts: factoryFontText, platform: platformSpans, codec: jxlWorker, ui, styles, benchmark: added.map(([path, text]) => [path, stripperFor(path)?.(text) ?? text]), benchAdapters}))};
  const benchSource = '(() => {const modules = {};\n' + added.map(([,text]) => text).join('\n') +
    '\nglobalThis.RapierPhoneBenchCore = Object.freeze({...modules["bench/fixtures.mjs"],...modules["bench/manifest.mjs"],...modules["bench/results.mjs"],...modules["bench/measure.mjs"]});' +
    '\nglobalThis.RapierPhoneBenchGraphicsFixtures = modules["bench/graphics-fixtures.mjs"];' +
    '\nglobalThis.RapierPhoneBenchController = modules["bench/controller.mjs"];' +
    '\nglobalThis.RapierPhoneBenchBuild = Object.freeze(' + JSON.stringify(identity) + ');})();';
  new vm.Script(benchSource, {filename:'rapier-phone-bench.js'});
  const benchSpanStart = packedRecord.length;
  const benchCode = '"use strict";' + await lean(benchSource, 'rapier-phone-bench.js') + '\n' + benchAdapters;
  new vm.Script(benchCode, {filename:'rapier-phone-bench.js'});
  phoneBenchScript = await packedScript('rapier-phone-bench-runtime', 'application/rapier-runtime', 'rapier-phone-bench.js', benchCode);
  phoneBenchSpans = packedRecord.splice(benchSpanStart);
}
{
  const {LETTER_SETS} = await import('../draw/letters.mjs'), platformSource = await read('shell/platform.js');
  const unslotted = LETTER_SETS.filter(set => !platformSource.includes("'letters-" + set.id + "': null")).map(set => set.id);
  if (unslotted.length) throw new Error('Letter sets without a plug-in slot in shell/platform.js: ' + unslotted.join(', '));
}
const packedReaderSources = (await Promise.all(['tools/text-pack.mjs', 'tools/packed-header.mjs'].map(read)))
  .map(source => source.replace(/^export /gm, '')).join('\n');
if (JSON.stringify(vendorIds.filter(id => id !== 'lib-acorn')) !== JSON.stringify(startupVendorIds))
  throw new Error('Startup vendors and the packed continuation disagree');
const runtimeLoaderSource = startupRelease + '\n' + startupRescue + '\n' +
  runtimeLoaderBody.replace('/* RAPIER_PACKED_READER */', () => base124Source + '\n' + packedReaderSources);
const loaderRealm = await realmNames([...realmInputs.slice(6), source, ...editorSlices.parts.values()]);
const foldedRuntimeLoader = await lean(runtimeLoaderSource, 'rapier-loader-fold.js');
const runtimeLoader = await lean(foldedRuntimeLoader, 'rapier-loader.js',
  {toplevel: true, reserved: [...loaderRealm.read, ...loaderRealm.declared, '_rapierPacked', '_rapierLoadCodecs', '_rapierStoredVendorsPending']});
new vm.Script(runtimeLoader, {filename: 'rapier-runtime-loader.js'});
const loaderTaken = topLevelNames([runtimeLoader]).filter(name => loaderRealm.declared.has(name));
if (loaderTaken.length) throw new Error('The loader takes another script\'s global name: ' + loaderTaken.join(', '));
const loaderBrowser = [...new Set(topLevelNames([runtimeLoader]).filter(name => new Set(WINDOW_SHORT_NAMES).has(name)))];
if (loaderBrowser.length) throw new Error('The loader declares a name the browser can predefine: ' + loaderBrowser.join(', '));
const PAINT_STYLE_ORDER = ['rapier-font-style', 'rapier-content-style', 'rapier-app-style', 'rapier-editor-style', 'rapier-highlight-style'];
const paintStyles = PAINT_STYLE_ORDER.map(id => styles.find(row => row.id === id)).filter(Boolean);
const restStyles = styles.filter(row => !PAINT_STYLE_ORDER.includes(row.id));
const missingPaint = PAINT_STYLE_ORDER.filter(id => !paintStyles.some(row => row.id === id));
if (!paintStyles.length) throw new Error('First-paint styles are empty');
if (missingPaint.length && restStyles.length) throw new Error('A deferred sheet shipped without its first-paint sheet: ' + missingPaint.join(', '));
const styleRecord = rows => JSON.stringify(rows.map(({id, css}) => ({id, css: stripperFor('style.css')(css)})));
const engineText = await read('editor/engine.js');
const startText = ['rapierWelcomeMarkdown'].map(name => {
  const found = new RegExp('^function ' + name + '\\(\\) \\{[\\s\\S]*?^\\}', 'm').exec(engineText);
  if (!found) throw new Error('First-paint start is missing: ' + name);
  return stripperFor('editor/engine.js')(found[0]);
});
const firstPaintKey = checksum(JSON.stringify({paint: styleRecord(paintStyles), rest: styleRecord(restStyles), firstScreenMarkup, ui,
  boot: bootTheme, critical: stripperFor('style.css')(styleSlots.exec(html)?.[0] || ''), starts: startText}));
let firstPaintRecord = {version: '', paths: {}}, firstPaintCurrent = false;
try {
  const kept = JSON.parse(await read('editor/first-paint.json'));
  firstPaintCurrent = kept.key === firstPaintKey;
  if (firstPaintCurrent) firstPaintRecord = {version: kept.version, css: kept.css || [], paths: kept.paths};
  else console.warn('first paint: editor/first-paint.json is stale; after this build run node tools/first-paint.mjs, then build again');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const firstScreenKey = firstScreenKeyOf([VERSION, firstScreenMarkup, ui, styleRecord([...paintStyles, ...restStyles]),
  JSON.stringify([...partStyles]), bundleText, compiledEditor, JSON.stringify(await readGuides(resolve(root, '../docs')))]);
let firstScreenRecord = null;
try {
  const kept = JSON.parse(await read('editor/first-screen.json'));
  if (kept.key === firstScreenKey) firstScreenRecord = kept;
  else console.warn('first screen: editor/first-screen.json is stale; after this build run node tools/first-screen.mjs, then build again');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const [stylesRuntime, codecRuntime, editorRuntime] = await Promise.all([
  packedSpans('rapier-styles-runtime', 'application/rapier-runtime', [
    {name: 'rapier-factory-fonts.js', source: factoryFontText},
    {name: 'rapier-styles.json', source: styleRecord([...paintStyles, ...restStyles])},
    {name: 'rapier-first-screen.html', source: firstScreenMarkup},
  ]),
  packedScript('rapier-codec-runtime', 'application/rapier-runtime', 'rapier-codecs.js', codecText),
  packedSpans('rapier-editor-runtime', 'application/rapier-runtime', [
    {name: 'rapier-ui.html', source: ui}, {name: 'rapier-shared.js', source: bundleText}, {name: 'rapier-editor.js', source},
  ]),
]);
const paintScript = '<!-- RAPIER_PAINT_BEGIN -->\n'
  + '<div id="rapier-first-screen"></div>\n'
  + '<script data-rapier-owned>\n' + safeScript(runtimeLoader) + '\n</script>\n'
  + codecRuntime
  + stylesRuntime
  + '<!-- RAPIER_PAINT_END -->\n';
if (!html.includes('<template id="rapier-ui-slot"></template>')) throw new Error('Editor interface slot is missing');
html = html.replace('<template id="rapier-ui-slot"></template>', () => paintScript + '<template id="rapier-ui-slot"></template>');
const runtimeScript = '<!-- RAPIER_RUNTIME_BEGIN -->\n' + editorRuntime + '<!-- RAPIER_RUNTIME_END -->\n';
const tail = [];
const tailSlots = [
  /<script type="application\/speedracer-app\+json">[\s\S]*?<\/script>\n?/,
  /<script type="text\/rapier-vendor" id="lib-acorn">[\s\S]*?<\/script>\n?/,
];
for (const slot of tailSlots) {
  const match = slot.exec(html);
  if (!match) throw new Error('A deferred application payload is missing');
  tail.push(match[0]);
  html = html.slice(0, match.index) + html.slice(match.index + match[0].length);
}
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) throw new Error('Editor body is missing');
html = html.slice(0, bodyEnd) + runtimeScript + tail.join('\n') + codecScript + html.slice(bodyEnd);
if (PROFILE === 'full') {
  const guide = [...html.matchAll(seoRegion)].find(row => row.index > html.indexOf('<body'));
  if (!guide) throw new Error('The full page has no body search guide');
  html = html.slice(0, guide.index) + html.slice(guide.index + guide[0].length);
  const opened = /<body>\n/.exec(html);
  if (!opened) throw new Error('The page has no plain <body> opening');
  const at = opened.index + opened[0].length;
  html = html.slice(0, at) + guide[0] + html.slice(at);
}
html = stripMarkupComments(html);
html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_, open, css, close) => open + stripStyleComments(css) + close);
let inlineRuntimeLoader = null;
{
  const inline = /(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/g;
  const leaned = await Promise.all([...html.matchAll(inline)].map(async ([whole, open, attrs, source, close]) => {
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !['text/javascript', 'application/javascript'].includes(type)) return whole;
    const isLoader = source.trim() === safeScript(runtimeLoader);
    const compiled = isLoader ? safeScript(runtimeLoader) : safeScript(await lean(source, 'rapier-inline.js'));
    if (isLoader) {
      if (inlineRuntimeLoader !== null) throw new Error('The page has more than one runtime loader');
      inlineRuntimeLoader = compiled;
    }
    return open + compiled + close;
  }));
  let at = 0;
  html = html.replace(inline, () => leaned[at++]);
}
let siteHtml = html;
html = html.replace(seoRegion, '<!-- RAPIER_SEO_BEGIN -->\n<!-- RAPIER_SEO_END -->\n');
const bootSlot = '__RAPIER_BOOT_ID__';
if (html.split(bootSlot).length !== 2) throw new Error('The page must carry one startup identity');
// The worker ships as written, less its comments but licence ones (tools/strip-comments.mjs), as the public source carries it.
const serviceWorkerSource = PROFILE === 'full' ? stripperFor('shell/service-worker.js')(await read('shell/service-worker.js')) : '';
const bootId = checksum(html + serviceWorkerSource);
html = html.replace(bootSlot, bootId);
siteHtml = siteHtml.replace(bootSlot, bootId);
if (inlineRuntimeLoader) {
  const at = inlineRuntimeLoader.indexOf(bootSlot), map = lean.symbols['rapier-loader.js'];
  if (checksum(inlineRuntimeLoader) !== map.sha256) throw new Error('The runtime loader differs from its symbol map');
  inlineRuntimeLoader = inlineRuntimeLoader.replace(bootSlot, bootId);
  const offsets = [...map.offsets];
  for (let i = 0, position = 0; i < offsets.length; i += 3) {
    position += offsets[i];
    if (position > at) { offsets[i] += bootId.length - bootSlot.length; break; }
  }
  lean.symbols['rapier-loader.js'] = {...map, offsets, sha256: checksum(inlineRuntimeLoader)};
}
const BUDGET = SIZE_BUDGETS[PROFILE];
{
  const bytes = Buffer.byteLength(html);
  if (FAST_PACK) console.warn('RAPIER_PACK=fast: zlib packing for iteration only; ' + bytes + ' bytes is not a release measurement');
  checkProfileSize(PROFILE, bytes, console.warn, {release: !FAST_PACK});
}
await writeFile(resolve(root, OUTPUT_FILE), html);
if (PROFILE === 'full') {
  const doorFiles = await writeDoorAssets(root, Buffer.from(siteHtml), await readGuides(resolve(root, '../docs')), firstPaintRecord, firstScreenRecord);
  if (doorFiles.length !== Object.keys(PAGES).length) throw new Error('The site page did not produce a dedicated file for every door and document');
}
if (PROFILE === 'full') {
  const named = new RegExp('^rapier-(?:' + PART_IDS.join('|') + ')-[0-9a-f]{16}\\.txt$');
  const folder = resolve(root, PART_DIRECTORY);
  buildPhase('outputs');
  await mkdir(folder, {recursive: true});
  const listed = await readdir(folder);
  for (const name of listed) if (named.test(name) && !partFiles.some(part => part.file === name)) await rm(resolve(folder, name));
  buildPhase('assembly');
  for (const part of partFiles) await writeFile(resolve(folder, part.file), part.body);
}
if (PROFILE === 'full') {
  const benchmarkHtml = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8"><meta name="rapier-phone-bench" content="1">')
    .replace('</body>', () => phoneBenchScript + '</body>');
  if (benchmarkHtml === html || !benchmarkHtml.includes('name="rapier-phone-bench"')) throw new Error('Benchmark page marker missing');
  await writeFile(resolve(root, 'rapier-bench.html'), benchmarkHtml);
  phoneBenchReceipt = {path:'rapier-bench.html', bytes:Buffer.byteLength(benchmarkHtml), sha256:checksum(benchmarkHtml), editorPageSha256:checksum(html), spans:phoneBenchSpans};
}


let shellDigest = null, appHtml = null, appHtmlBytes = null, appHtmlSha256 = null, appsSpans = null, appPlugins = null, hostedPlugins = null, appAssets = null, portableHtml = null;
if (PROFILE === 'full') {
  const shellRows = [];
  let shellPageDigest = null;
  for (const path of ['rapier.html', 'manifest.json', 'icon-192.png', 'icon-512.png']) {
    const body = await readFile(resolve(root, path));
    const digest = checksum(body);
    if (path === 'rapier.html') shellPageDigest = digest;
    shellRows.push(`./${path}\t${body.length}\t${digest}`);
  }
  shellDigest = checksum(shellRows.join('\n'));
  const doorHashes = Object.fromEntries(await Promise.all(['/', ...Object.keys(DOORS)].map(async path =>
    [path, checksum(await readFile(resolve(root, path === '/' ? 'index.html' : doorAssetPath(path).slice(1))))])));
  const worker = serviceWorkerSource
    .replace('__RAPIER_BOOT_ID__', bootId)
    .replace('__RAPIER_DOOR_SHA256__', JSON.stringify(doorHashes))
    .replace('__RAPIER_SITE_PAGES__', JSON.stringify(Object.keys(STANDALONE)))
    .replace('__RAPIER_PARTS__', JSON.stringify(partFiles.map(({id, file, bytes, sri}) => ({id, file, bytes, sri, release: VERSION}))))
    .replace(/const SHELL_RELEASE_SHA256 = '[0-9a-f]{64}';/, `const SHELL_RELEASE_SHA256 = '${shellDigest}';`)
    .replace(/const SHELL_PAGE_SHA256 = '[0-9a-f]{64}';/, `const SHELL_PAGE_SHA256 = '${shellPageDigest}';`);
  new vm.Script(worker, {filename: 'sw.js'});
  await writeFile(resolve(root, 'sw.js'), worker);

  const editorElement = /<script type="application\/rapier-runtime" id="rapier-editor-runtime">[^<]*<\/script>\n/;
  if (html.split('id="rapier-editor-runtime"').length !== 2 || !editorElement.test(html)) throw new Error('The Apps copy needs the one editor runtime element to place its bridge after');
  const recorded = packedRecord.length;
  const appsInterface = await packedSpans('rapier-editor-runtime', 'application/rapier-runtime', [
    {name: 'rapier-ui.html', source: appsUi}, {name: 'rapier-shared.js', source: bundleText}, {name: 'rapier-editor.js', source},
  ]);
  const plugins = await builtinPlugins(root, packedSpans);
  appPlugins = plugins.groups;
  hostedPlugins = appPlugins.map(group => {
    const {file, bytes, sri} = plugins.assets.find(asset => asset.id === group.id);
    return {...group, asset: {file, bytes, sri}};
  });
  const appRows = packedRecord.splice(recorded);
  const replacementElements = new Set(['rapier-editor-runtime']);
  appsSpans = packedRecord.filter(row => !replacementElements.has(row.element) && !row.element.startsWith('rapier-part-'))
    .concat(appRows.filter(row => !row.element.startsWith('rapier-plugin-')));
  const platformElement = /<script type="application\/rapier-runtime" id="rapier-platform-runtime">[^<]*<\/script>\n/;
  if (!platformElement.test(html)) throw new Error('The built-in editor needs its platform runtime');
  const inventory = '<script type="application/json" id="rapier-builtin-plugins">' + safeScript(JSON.stringify(appPlugins)) + '</script>\n';
  const carried = inlineParts(html, partFiles);
  const lastPart = partFiles.at(-1).element;
  const partAt = carried.lastIndexOf(lastPart);
  if (partAt < 0) throw new Error('The portable page lost a part');
  const partEnd = partAt + lastPart.length;
  portableHtml = (carried.slice(0, partEnd) + plugins.html + carried.slice(partEnd)).replace(platformElement, element => inventory + element);
  const hostedInventory = '<script type="application/json" id="rapier-builtin-plugins">' + safeScript(JSON.stringify(hostedPlugins)) + '</script>\n';
  appHtml = html.replace(platformElement, element => hostedInventory + element)
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '').replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<script>globalThis.RAPIER_APPS_HOST = true;</script>')
    .replace(seoRegion, '').replace(editorElement, () => appsInterface + appsScript);
  const destination = resolve(root, 'dist/chatgpt');
  await mkdir(destination, {recursive: true});
  const assetDirectory = resolve(destination, 'editor-assets');
  buildPhase('outputs');
  await rm(assetDirectory, {recursive: true, force: true});
  buildPhase('assembly');
  await mkdir(assetDirectory, {recursive: true});
  appAssets = [];
  for (const asset of [...partFiles, ...plugins.assets]) {
    await writeFile(resolve(assetDirectory, asset.file), asset.body);
    appAssets.push({id: asset.id, path: 'editor-assets/' + asset.file, bytes: Buffer.byteLength(asset.body), sha256: checksum(asset.body), sri: asset.sri});
  }
  await writeFile(resolve(destination, '_headers'), '/editor-assets/*\n  Content-Type: text/plain; charset=utf-8\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=31536000, immutable\n' + PAIRED_SHELL_HEADERS);
  await writeFile(resolve(destination, 'rapier-app.html'), appHtml);
  await writeFile(resolve(destination, PAIRED_SHELL_FILE), pairedShell(appHtml));
  await writeFile(resolve(destination, '_redirects'), PAIRED_SHELL_REDIRECTS);
  await writeFile(resolve(destination, 'rapier.html'), portableHtml);
  const privacy = /<div class="licenses-app privacy-words">([\s\S]*?)<\/div>/.exec(await read('editor/ui.html'))?.[1];
  if (!privacy) throw new Error('The Apps package needs the editor privacy sheet');
  await writeFile(resolve(destination, 'privacy.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapier privacy and terms</title><main><h1>Rapier privacy and terms</h1>' + privacy + '</main></html>');
  const licensingFonts = await inlineFonts(await read('shell/fonts/fonts.css'), 'shell/fonts/fonts.css');
  const pageFonts = page => page.replace('/* RAPIER_FONTS */', licensingFonts);
  await writeFile(resolve(destination, 'licensing.html'), pageFonts(await read('licensing.html')));
  await writeFile(resolve(destination, 'fonts.css'), licensingFonts);
  await cp(resolve(root, 'icon-192.png'), resolve(destination, 'icon-192.png'));
  await cp(resolve(root, 'icon-512.png'), resolve(destination, 'icon-512.png'));
  appHtmlBytes = Buffer.byteLength(appHtml); appHtmlSha256 = checksum(appHtml);
}

let priorReceipt = null;
try { priorReceipt = JSON.parse(await readFile(resolve(root, 'dist/BUILD.json'), 'utf8')); } catch (_) { priorReceipt = null; }
const PROVENANCE = ['builtAt', 'node', 'mode', 'packing'];
const priorProfiles = Object.fromEntries(Object.entries(priorReceipt?.profiles && typeof priorReceipt.profiles === 'object' ? priorReceipt.profiles : {})
  .filter(([name, record]) => (name === 'full' || name === 'reader') && record && typeof record === 'object' && PROVENANCE.every(field => typeof record[field] === 'string')));
const BUILT_AT = buildReceiptTimestamp(), PACK_MODE = FAST_PACK ? 'development' : 'release', PACKING = FAST_PACK ? 'fast (zlib; not a release)' : 'zopfli';
const pageSpans = packedRecord.filter(row => row.element !== 'rapier-apps-runtime' && !row.element.startsWith('rapier-part-'));
const profileRecord = {path: OUTPUT_FILE, bytes: Buffer.byteLength(html), sha256: checksum(html), budget: BUDGET, spans: pageSpans,
  parts: partFiles.map(({id, file, bytes, sri}) => ({id, file, bytes, sri, scripts: PARTS.find(part => part.id === id).scripts,
    modules: [...partOf].filter(([, owner]) => owner === id).map(([path]) => path),
    globals: Object.entries(partGlobals).filter(([, path]) => partOf.get(path) === id).map(([name]) => name)})),
  coreHeldPartGlobals: Object.keys(partGlobals).filter(name => !partOf.has(partGlobals[name])), shakenExports, unreadModules, jxl,
  builtAt: BUILT_AT, node: process.version, mode: PACK_MODE, packing: PACKING, codecs: ['gzip', 'brotli'], brotli: {...BROTLI_SETTINGS}, canonical: toolchainCanonical};
// (`RAPIER_PACK=fast`), 'release' for Zopfli; tools/release-gate.mjs checks it.
const receipt = {markdownSharing, firstPaint: {key: firstPaintKey, current: firstPaintCurrent}, firstScreen: {key: firstScreenKey, current: !!firstScreenRecord}, phoneBench: phoneBenchReceipt, release: VERSION, builtAt: BUILT_AT, node: process.version, mode: PACK_MODE, packing: PACKING, codecs: profileRecord.codecs, brotli: profileRecord.brotli, validation: 'JavaScript syntax and source assembly only; no runtime or host verification', profile: PROFILE, jxl, profiles: {...priorProfiles, [PROFILE]: profileRecord}, editor: {path: OUTPUT_FILE, bytes: Buffer.byteLength(html), ceiling: BUDGET.refuse, sha256: checksum(html)}, apps: PROFILE === 'full' ? {path: 'dist/chatgpt/rapier-app.html', bytes: appHtmlBytes, sha256: appHtmlSha256, spans: appsSpans, plugins: hostedPlugins, assets: appAssets} : priorReceipt?.apps ?? null, offline: PROFILE === 'full' ? {path: 'dist/chatgpt/rapier.html', bytes: Buffer.byteLength(portableHtml), sha256: checksum(portableHtml), plugins: appPlugins} : priorReceipt?.offline ?? null, shell: PROFILE === 'full' ? {sha256: shellDigest} : priorReceipt?.shell ?? null, htmlSinks: {named: htmlSinks.total, files: htmlSinks.files, inventory: 'security/html-sinks.json'}, tools: TOOLS.map(row => row.name), toolchain: {canonical: toolchainCanonical, node: {expected: toolchain.node.version, actual: process.version}}, unchecked};
await mkdir(resolve(root, 'dist'), {recursive: true});
await writeFile(resolve(root, 'dist/runtime-symbols-' + PROFILE + '.json'), JSON.stringify(lean.symbols) + '\n');
await writeFile(resolve(root, 'dist/BUILD.json'), JSON.stringify(receipt, null, 2) + '\n');
await writeFile(resolve(root, 'AGENT-TOOLS.json'), JSON.stringify({release: VERSION, core: TOOLS,
  mcp: manifestMcp.map(tool => ({...tool, inputSchema: publishedSchema(tool.inputSchema)}))}, null, 2) + '\n');
await finishBuildReuse({root, profile: PROFILE});
console.log(JSON.stringify(receipt, null, 2));
