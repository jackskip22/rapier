// SPDX-License-Identifier: AGPL-3.0-only
import {createRequire} from 'node:module';
import acorn from '../agent/vendor/acorn.mjs';
const {minify} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');

export const PARTS = Object.freeze([
  {id: 'document', label: 'Document layout', scripts: ['editor/document-layout.js'], styles: ['rapier-document-style'],
    globals: {RapierClipboardPictures: 'interchange/clipboard-pictures.mjs'}},
  {id: 'presets', label: 'Gallery', scripts: ['presets/browser.js', 'editor/composer.js'], styles: ['rapier-composer-style'],
    globals: {RapierPresets: 'presets/presets.mjs', RapierOrnaments: 'presets/ornaments.mjs', RapierPins: 'presets/pins.mjs', RapierGalleryPreviews: 'presets/gallery-previews.mjs', RapierDrawOrnaments: 'draw/ornaments.mjs'}},
  {id: 'drawing', label: 'Drawing',
    scripts: ['draw/draw.js', 'draw/effects-tool.js', 'draw/liquid-live.js', 'draw/copier-live.js', 'draw/background-tool.js',
      'draw/paint-tool.js', 'draw/water-tool.js', 'draw/water-pro.js'],
    styles: ['rapier-draw-style'],
    globals: {RapierDrawLetterPreviews: 'draw/letter-previews.mjs', RapierDrawFit: 'draw/fit.mjs', RapierDrawWaterVideo: 'draw/water-video.mjs', RapierDrawPaint: 'draw/paint.mjs',
      RapierDrawBrushes: 'draw/brushes.mjs', RapierDrawAgentPaint: 'draw/agent-paint.mjs', RapierDrawPaintWorker: 'draw/paint-worker.mjs',
      RapierDrawPaintRows: 'draw/paint-parallel.mjs', RapierDrawPaintRemote: 'draw/paint-remote.mjs', RapierDrawLiquid: 'draw/liquid-gpu.mjs',
      RapierDrawLiquidWorker: 'draw/liquid-worker.mjs', RapierDrawCopier: 'draw/copier-gpu.mjs', RapierDrawWater: 'draw/water.mjs',
      RapierDrawWaterWorker: 'draw/water-worker.mjs', RapierDrawWaterPaths: 'draw/water-paths.mjs'}},
  {id: 'jxl', label: 'JPEG XL converter', scripts: ['jxl/view.js'], styles: ['rapier-jxl-style'],
    globals: {RapierJxlConvert: 'jxl/convert.mjs'}},
  {id: 'jxlcomplete', label: 'JPEG XL complete', scripts: ['jxl/complete.js'], styles: [], globals: {}},
  {id: 'notes', label: 'Notes',
    scripts: ['notes/notes.js', 'notes/todo.js', 'notes/library.js', 'notes/ocr.js', 'notes/recorder.js', 'notes/sync-ui.js', 'notes/attachments.js'],
    styles: ['rapier-notes-style', 'rapier-todo-style'],
    globals: Object.fromEntries(Object.entries({Model: 'model', LibraryWindow: 'library-window', LibraryReads: 'library-reads', Takeout: 'takeout',
      ImportNotion: 'import-notion', ImportSimplenote: 'import-simplenote', ImportStandardNotes: 'import-standardnotes', ImportJoplin: 'import-joplin',
      ImportTextBundle: 'import-textbundle', ImportDayOne: 'import-dayone', ImportRoam: 'import-roam', ImportLogseq: 'import-logseq', Import: 'import',
      ImportPictures: 'import-pictures', ImportReceipt: 'import-receipt', ImportPlan: 'import-plan',
      FrontMatter: 'frontmatter', Links: 'links', Search: 'search', SearchCache: 'search-cache', ImportMarkdown: 'import-markdown', ImportEnex: 'import-enex',
      ImportHtml: 'import-html', Trash: 'trash', History: 'history', Integrity: 'integrity', Backup: 'backup',
      BackupWorker: 'backup-worker', OPFSWorker: 'opfs-worker', OPFS: 'opfs', IdbStore: 'idb-store', WorkspaceStore: 'workspace-store', Folder: 'folder', Todo: 'todo',
      Audio: 'audio', Attachments: 'attachments', HostWords: 'host-words', SyncSession: 'sync-api'})
      .map(([name, file]) => ['RapierNotes' + name, 'notes/' + file + '.mjs'])
        .concat([['RapierOriginalFolderCore', 'notes/original-folder/index.mjs']]))},
]);
export const PART_IDS = Object.freeze(PARTS.map(part => part.id));
export const PART_DIRECTORY = 'parts';

export function partition({roots, partRoots, deps, order}) {
  const closure = starts => {
    const seen = new Set(), visit = path => { if (seen.has(path)) return; seen.add(path); for (const dep of deps.get(path) || []) visit(dep); };
    for (const start of starts) visit(start);
    return seen;
  };
  const core = closure(roots), owner = new Map();
  for (const [id, starts] of partRoots) for (const path of closure(starts)) {
    if (core.has(path)) continue;
    if (owner.has(path) && owner.get(path) !== id) throw new Error('A module two parts reach must be in core or one part: ' + path + ' (' + owner.get(path) + ', ' + id + ')');
    owner.set(path, id);
  }
  const unplaced = order.filter(path => !core.has(path) && !owner.has(path));
  if (unplaced.length) throw new Error('Modules no root reaches: ' + unplaced.join(', '));
  return {core, owner};
}

export const PART_MARK = '__RAPIER_PART__';
export const partMark = id => '\n' + PART_MARK + '(' + JSON.stringify(id) + ');\n';

export function splitProgram(code, ids) {
  const tree = acorn.parse(code, {ecmaVersion: 'latest'});
  const isMark = node => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === PART_MARK &&
    node.arguments.length === 1 && node.arguments[0].type === 'Literal';
  const cuts = [];
  for (const statement of tree.body) {
    if (statement.type !== 'ExpressionStatement') continue;
    const expression = statement.expression;
    if (isMark(expression)) cuts.push({id: expression.arguments[0].value, from: statement.start, to: statement.end});
    else if (expression.type === 'SequenceExpression') {
      const at = expression.expressions.findIndex(isMark);
      if (at < 0) continue;
      if (expression.expressions.filter(isMark).length > 1) throw new Error('Two part marks in one statement');
      const before = expression.expressions[at - 1], after = expression.expressions[at + 1];
      cuts.push({id: expression.expressions[at].arguments[0].value,
        from: before ? before.end : statement.start, to: after ? after.start : statement.end,
        open: before ? ';' : '', lead: ''});
    }
  }
  if (cuts.length !== ids.length || cuts.some((cut, index) => cut.id !== ids[index]))
    throw new Error('The compiled program lost or reordered its part marks: ' + cuts.map(cut => cut.id).join(', '));
  if (code.split(PART_MARK).length - 1 !== ids.length) throw new Error('A part mark survived outside the top level');
  const strict = '"use strict";';
  const slices = [];
  let from = 0;
  for (const cut of cuts) { slices.push(code.slice(from, cut.from) + (cut.open || '')); from = cut.to; }
  slices.push(code.slice(from));
  const [core, ...rest] = slices;
  if (!core.startsWith(strict)) throw new Error('The compiled editor must open strict');
  const parts = new Map(ids.map((id, index) => {
    const text = rest[index].replace(/^[;,\s]+/, '');
    return [id, text.startsWith(strict) ? text : strict + text];
  }));
  for (const [id, text] of [['core', core], ...parts]) {
    try { acorn.parse(text, {ecmaVersion: 'latest'}); }
    catch (error) { throw new Error('The ' + id + ' slice is not a script of its own: ' + error.message); }
  }
  return {core, parts};
}

export const WINDOW_SHORT_NAMES = Object.freeze(['Attr', 'Blob', 'CSS', 'Date', 'File', 'Ink', 'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Node', 'Set', 'Text',
  'URL', 'atob', 'blur', 'btoa', 'eval', 'find', 'name', 'open', 'self', 'stop', 'top', 'when', 'dump', 'GPU', 'XRay', 'ai', 'Infinity', 'undefined',
  'window', 'document', 'location']);
export async function realmNames(sources) {
  const read = new Set(WINDOW_SHORT_NAMES), declared = new Set();
  for (const item of sources) {
    const module = typeof item === 'object', source = module ? item.source : item;
    const {ast} = await minify(source, {module, compress: false, mangle: false, format: {ast: true, code: false}});
    ast.figure_out_scope({module});
    for (const name of ast.globals.keys()) read.add(name);
    if (!module) for (const name of ast.variables.keys()) declared.add(name);
  }
  return {read, declared};
}

export function topLevelNames(sources) {
  const names = [], ids = pattern => pattern.type === 'Identifier' ? [pattern.name]
    : pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(row => ids(row.value || row.argument))
    : pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(ids)
    : pattern.type === 'AssignmentPattern' ? ids(pattern.left) : pattern.type === 'RestElement' ? ids(pattern.argument) : [];
  for (const source of sources) for (const node of acorn.parse(source, {ecmaVersion: 'latest'}).body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') names.push(node.id.name);
    else if (node.type === 'VariableDeclaration') for (const row of node.declarations) names.push(...ids(row.id));
  }
  return names;
}

export function partElement(id, body) {
  if (typeof id !== 'string' || !/^[a-z]+$/.test(id)) throw new Error('A part id is one word: ' + id);
  if (typeof body !== 'string' || body.includes('<')) throw new Error('A part element is not one inert body: ' + id);
  const element = '<script type="application/rapier-runtime" id="rapier-part-' + id + '">' + body + '</script>\n';
  if (element.split('id="rapier-part-' + id + '"').length !== 2) throw new Error('A part element is not one inert body: ' + id);
  return element;
}

const EDITOR_RUNTIME = /<script type="application\/rapier-runtime" id="rapier-editor-runtime">[^<]*<\/script>\n/;

export function inlineParts(html, parts) {
  if (typeof html !== 'string' || html.split('id="rapier-editor-runtime"').length !== 2 || !EDITOR_RUNTIME.test(html))
    throw new Error('The full page has no single editor runtime to carry its parts');
  if (!Array.isArray(parts) || !parts.length) throw new Error('The full page has parts to carry');
  const seen = new Set();
  let extra = '';
  for (const part of parts) {
    if (!part || seen.has(part.id)) throw new Error('Each part is inlined once: ' + (part && part.id));
    seen.add(part.id);
    if (html.includes('id="rapier-part-' + part.id + '"')) continue;
    extra += part.element || partElement(part.id, part.body);
  }
  if ([...seen].join() !== PART_IDS.join()) throw new Error('The carried page must hold every part: ' + [...seen].join(', '));
  if (!extra) return html;
  return html.replace(EDITOR_RUNTIME, element => element + extra);
}
