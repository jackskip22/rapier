import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import acorn from '../agent/vendor/acorn.mjs';

export const engineURL = new URL('../editor/engine.js', import.meta.url);
const declarationIndexes = new Map();
function declarationIndex(source, sourceType = 'script') {
  const key = sourceType + '\0' + source;
  if (declarationIndexes.has(key)) {
    const found = declarationIndexes.get(key);
    declarationIndexes.delete(key); declarationIndexes.set(key, found);
    return found;
  }
  const found = new Map();
  const walk = (node, kind = null) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclaration') {
      for (const row of node.declarations) walk(row, node.kind);
      return;
    }
    const name = node.type === 'FunctionDeclaration' ? node.id?.name
      : node.type === 'VariableDeclarator' ? node.id?.name : null;
    if (name) {
      found.set(name, found.has(name) ? null : (node.type === 'VariableDeclarator' ? (kind || 'const') + ' ' : '') + source.slice(node.start, node.end) + '\n');
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, kind));
      else if (value && typeof value === 'object') walk(value, kind);
    }
  };
  walk(acorn.parse(source, {ecmaVersion: 'latest', sourceType}));
  if (declarationIndexes.size === 8) declarationIndexes.delete(declarationIndexes.keys().next().value);
  declarationIndexes.set(key, found);
  return found;
}
const RENDER_OWNERS = ['render-markdown', 'render', 'render-styles', 'render-sanitize', 'render-print', 'render-work'];
const RENDER_ALIASES = {Markdown: 'render-markdown', Print: 'render-print', Sanitizer: 'render-sanitize', Styles: 'render-styles'};
function ownerDeclaration(owner, name) {
  const found = declarationIndex(readFileSync(new URL('../kit/' + owner + '.mjs', import.meta.url), 'utf8'), 'module');
  return found.get(name);
}
export const EXTRACTED_PARTS = ['editor/seen-margin.js', 'editor/format-toolbar.js', 'editor/heavy-window.js', 'editor/agent-bar.js', 'editor/compare-block.js', 'editor/ui-open.js', 'editor/plan-exact.js', 'editor/will-plate.js'];
function partDeclaration(name) {
  for (const part of EXTRACTED_PARTS) {
    const found = declarationIndex(readFileSync(new URL('../' + part, import.meta.url), 'utf8')).get(name);
    if (found) return found;
  }
  return undefined;
}
function renderOwnerDeclaration(declaration, name, engine) {
  const delegated = declaration?.match(/^function [\w$]+\([^)]*\) \{[^\n]*_rapierRenderModule\(['"]([^'"]+)['"]\)[^\n]*\}\n?$/);
  if (delegated) return ownerDeclaration(delegated[1], name);
  const alias = declaration?.match(/^const \w+ = globalThis\.RapierRender(Markdown|Print|Sanitizer|Styles)\./);
  if (alias) return ownerDeclaration(RENDER_ALIASES[alias[1]], name) ?? declaration;
  if (declaration === undefined && engine) {
    const moved = partDeclaration(name); if (moved) return moved;
    for (const owner of RENDER_OWNERS) { const found = ownerDeclaration(owner, name); if (found) return found; }
  }
  return declaration;
}
export function declarations(source, names) {
  const found = declarationIndex(source), engine = source.includes('/* RAPIER_RENDER_MODULE */');
  const resolved = new Map(names.map(name => [name, renderOwnerDeclaration(found.get(name), name, engine)]));
  for (const name of names) if (resolved.get(name) === undefined) throw new Error('Missing declaration: ' + name);
  for (const name of names) if (resolved.get(name) === null) throw new Error('Ambiguous declaration: ' + name);
  const helpers = /(?<![\w.$])((?:_rapier[A-Za-z0-9_]*Steps)|finish|finishAsync|cloneTree|htmlParts|cleanTree|serializeTree|encodeUtf8Steps|pause|check)\s*\(/g;
  for (const declaration of resolved.values()) for (const match of declaration.matchAll(helpers)) {
    const name = match[1];
    if (resolved.has(name)) continue;
    const own = name.startsWith('_rapier') ? renderOwnerDeclaration(found.get(name), name, true) : ownerDeclaration('render-work', name);
    if (own) resolved.set(name, own);
  }
  return withRenderOwners([...resolved.values()].join('\n'));
}
export function withRenderOwners(source) {
  return /_rapierRenderModule\(/.test(source) && !/function _rapierRenderModule\(/.test(source)
    ? source + '\nglobalThis._rapierRenderModule ??= () => globalThis;\n' : source;
}
export async function loadSatellite(path, names, engine = false, bindings = {}) {
  if (!engine) return import(new URL('../editor/' + path, import.meta.url));
  const source = declarations(readFileSync(engineURL, 'utf8'), names);
  return vm.runInNewContext(source + '\n({' + names.join(',') + '})', bindings);
}

export const plain = value => structuredClone(value);
